import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { DatabaseInstance } from '../../../platform/database/connection.js';
import type { Config } from '../../../platform/config/index.js';
import {
  users,
  donors,
  hospitals,
  bloodBanks,
  refreshTokens
} from '../../../platform/database/schema.js';
import {
  hashPassword,
  verifyPassword,
  performDummyPasswordVerify,
  normalizeEmail
} from '../domain/password.js';
import {
  createAccessToken,
  generateOpaqueRefreshToken,
  hashRefreshToken,
  ACCESS_TOKEN_EXPIRY_SECONDS
} from '../domain/tokens.js';
import { LockoutService } from '../domain/lockout.js';
import { AuditService } from '../../audit/audit.service.js';
import {
  ConflictError,
  UnauthorizedError,
  ForbiddenError
} from '../../../platform/http/errors.js';
import type {
  RegisterDonorInput,
  RegisterHospitalInput,
  RegisterBloodBankInput,
  LoginInput
} from './auth.schemas.js';

export interface SafeUser {
  id: string;
  email: string;
  role: 'donor' | 'hospital' | 'blood_bank' | 'admin';
  status: 'pending' | 'active' | 'suspended';
  lastLoginAt?: Date | null;
  createdAt?: Date;
}

export function sanitizeUser(user: typeof users.$inferSelect): SafeUser {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    status: user.status,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt
  };
}

export class AuthService {
  private readonly lockoutService: LockoutService;
  private readonly audit: AuditService;

  constructor(
    private readonly db: DatabaseInstance,
    private readonly config: Config
  ) {
    this.lockoutService = new LockoutService(db);
    this.audit = new AuditService(db, config);
  }

  /**
   * Registers a new blood donor.
   * Donors are immediately activated upon registration (status = 'active').
   */
  public async registerDonor(
    input: RegisterDonorInput,
    ip?: string
  ): Promise<{ user: SafeUser }> {
    const email = normalizeEmail(input.email);

    // 1. Check for existing user
    const [existing] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existing) {
      throw new ConflictError('A user with this email address already exists');
    }

    // 2. Hash password with argon2id
    const passwordHash = await hashPassword(input.password);

    // 3. Create user and donor profile within transaction
    const newUser = await this.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(users)
        .values({
          email,
          passwordHash,
          role: 'donor',
          status: 'active'
        })
        .returning();

      if (!created) {
        throw new Error('Failed to create donor user record');
      }

      await tx.insert(donors).values({
        userId: created.id,
        fullName: input.fullName,
        phone: input.phone,
        bloodGroup: input.bloodGroup,
        dateOfBirth: input.dateOfBirth,
        weightKg: input.weightKg,
        sex: input.sex,
        location: input.location,
        isAvailable: true,
        consentLocationAt: new Date()
      });

      return created;
    });

    await this.audit.record({
      action: 'auth.register.donor',
      entity: 'user',
      entityId: newUser.id,
      actorUserId: newUser.id,
      ip,
      metadata: { bloodGroup: input.bloodGroup }
    });

    return { user: sanitizeUser(newUser) };
  }

  /**
   * Registers a new hospital.
   * Hospital accounts are set to 'pending' and require admin approval before accessing protected features.
   */
  public async registerHospital(
    input: RegisterHospitalInput,
    ip?: string
  ): Promise<{ user: SafeUser }> {
    const email = normalizeEmail(input.email);

    // 1. Check email uniqueness
    const [existingUser] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existingUser) {
      throw new ConflictError('A user with this email address already exists');
    }

    // 2. Check registration number uniqueness
    const [existingReg] = await this.db
      .select({ userId: hospitals.userId })
      .from(hospitals)
      .where(eq(hospitals.registrationNo, input.registrationNo))
      .limit(1);

    if (existingReg) {
      throw new ConflictError('A hospital with this registration number already exists');
    }

    // 3. Hash password
    const passwordHash = await hashPassword(input.password);

    // 4. Create records with status 'pending'
    const newUser = await this.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(users)
        .values({
          email,
          passwordHash,
          role: 'hospital',
          status: 'pending'
        })
        .returning();

      if (!created) {
        throw new Error('Failed to create hospital user record');
      }

      await tx.insert(hospitals).values({
        userId: created.id,
        name: input.name,
        registrationNo: input.registrationNo,
        phone: input.phone,
        address: input.address,
        location: input.location
      });

      return created;
    });

    await this.audit.record({
      action: 'auth.register.hospital',
      entity: 'user',
      entityId: newUser.id,
      actorUserId: newUser.id,
      ip,
      metadata: { registrationNo: input.registrationNo }
    });

    return { user: sanitizeUser(newUser) };
  }

  /**
   * Registers a new blood bank.
   * Blood bank accounts are set to 'pending' and require admin approval.
   */
  public async registerBloodBank(
    input: RegisterBloodBankInput,
    ip?: string
  ): Promise<{ user: SafeUser }> {
    const email = normalizeEmail(input.email);

    // 1. Check email uniqueness
    const [existingUser] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existingUser) {
      throw new ConflictError('A user with this email address already exists');
    }

    // 2. Check license number uniqueness
    const [existingLicense] = await this.db
      .select({ userId: bloodBanks.userId })
      .from(bloodBanks)
      .where(eq(bloodBanks.licenseNo, input.licenseNo))
      .limit(1);

    if (existingLicense) {
      throw new ConflictError('A blood bank with this license number already exists');
    }

    // 3. Hash password
    const passwordHash = await hashPassword(input.password);

    // 4. Create records with status 'pending'
    const newUser = await this.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(users)
        .values({
          email,
          passwordHash,
          role: 'blood_bank',
          status: 'pending'
        })
        .returning();

      if (!created) {
        throw new Error('Failed to create blood bank user record');
      }

      await tx.insert(bloodBanks).values({
        userId: created.id,
        name: input.name,
        licenseNo: input.licenseNo,
        phone: input.phone,
        address: input.address,
        location: input.location
      });

      return created;
    });

    await this.audit.record({
      action: 'auth.register.blood_bank',
      entity: 'user',
      entityId: newUser.id,
      actorUserId: newUser.id,
      ip,
      metadata: { licenseNo: input.licenseNo }
    });

    return { user: sanitizeUser(newUser) };
  }

  /**
   * Authenticates user credentials with login hardening:
   * - Constant-time execution & identical error for unknown email vs bad password
   * - Dummy Argon2 verify for nonexistent users
   * - Account & IP lockout enforcement
   * - Generates access JWT and rotating opaque refresh token
   */
  public async login(
    input: LoginInput,
    ip?: string,
    userAgent?: string
  ): Promise<{
    accessToken: string;
    expiresIn: number;
    refreshToken: string;
    user: SafeUser;
  }> {
    const email = normalizeEmail(input.email);
    const ipIdentifier = ip ? `ip:${this.audit.hashIp(ip)}` : null;
    const accountIdentifier = `account:${email}`;

    // 1. Check account lockout
    const accountLockout = await this.lockoutService.checkLockout(accountIdentifier);
    if (accountLockout.isLocked) {
      await this.audit.record({
        action: 'auth.login.locked',
        entity: 'user',
        entityId: email,
        ip,
        metadata: { remainingSeconds: accountLockout.remainingSeconds }
      });
      throw new ForbiddenError(
        `Account is temporarily locked. Please retry in ${accountLockout.remainingSeconds} seconds.`
      );
    }

    // 2. Check IP lockout (if IP available)
    if (ipIdentifier) {
      const ipLockout = await this.lockoutService.checkLockout(ipIdentifier);
      if (ipLockout.isLocked) {
        throw new ForbiddenError(
          `Too many failed attempts from your network. Please retry in ${ipLockout.remainingSeconds} seconds.`
        );
      }
    }

    // 3. Look up user by email
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    // 4. Constant-time timing mitigation for nonexistent email
    if (!user) {
      await performDummyPasswordVerify(input.password);
      await this.lockoutService.recordFailedAttempt(accountIdentifier);
      if (ipIdentifier) {
        await this.lockoutService.recordFailedAttempt(ipIdentifier);
      }

      await this.audit.record({
        action: 'auth.login.failure',
        entity: 'user',
        entityId: email,
        ip,
        metadata: { reason: 'user_not_found' }
      });

      throw new UnauthorizedError('Invalid email or password');
    }

    // 5. Verify real user password
    const isPasswordValid = await verifyPassword(input.password, user.passwordHash);
    if (!isPasswordValid) {
      await this.lockoutService.recordFailedAttempt(accountIdentifier);
      if (ipIdentifier) {
        await this.lockoutService.recordFailedAttempt(ipIdentifier);
      }

      await this.audit.record({
        action: 'auth.login.failure',
        entity: 'user',
        entityId: user.id,
        ip,
        metadata: { reason: 'invalid_password' }
      });

      throw new UnauthorizedError('Invalid email or password');
    }

    // 6. Check user status
    if (user.status === 'pending') {
      await this.audit.record({
        action: 'auth.login.blocked_pending',
        entity: 'user',
        entityId: user.id,
        ip
      });
      throw new ForbiddenError(
        'Your organization account is pending administrator approval. Please wait for verification.'
      );
    }

    if (user.status === 'suspended') {
      await this.audit.record({
        action: 'auth.login.blocked_suspended',
        entity: 'user',
        entityId: user.id,
        ip
      });
      throw new ForbiddenError('Your account has been suspended. Please contact support.');
    }

    // 7. Successful login: reset lockout counters
    await this.lockoutService.resetAttempts(accountIdentifier);
    if (ipIdentifier) {
      await this.lockoutService.resetAttempts(ipIdentifier);
    }

    // 8. Update last login timestamp
    await this.db
      .update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.id, user.id));

    // 9. Generate access JWT and opaque refresh token
    const accessToken = await createAccessToken(user.id, user.role, this.config);
    const { rawToken, tokenHash, expiresAt } = generateOpaqueRefreshToken();
    const userAgentHash = userAgent
      ? crypto.createHash('sha256').update(userAgent).digest('hex')
      : null;

    // 10. Persist refresh token family in DB
    await this.db.insert(refreshTokens).values({
      userId: user.id,
      tokenHash,
      expiresAt,
      userAgentHash
    });

    // 11. Audit log success
    await this.audit.record({
      action: 'auth.login.success',
      entity: 'user',
      entityId: user.id,
      actorUserId: user.id,
      ip
    });

    return {
      accessToken,
      expiresIn: ACCESS_TOKEN_EXPIRY_SECONDS,
      refreshToken: rawToken,
      user: sanitizeUser(user)
    };
  }

  /**
   * Rotates a refresh token with automatic theft detection:
   * - If an already-revoked token is presented, revokes the entire token family.
   * - Otherwise, revokes old token, issues a new token with same family_id, and issues a new access JWT.
   */
  public async refresh(
    rawRefreshToken: string,
    ip?: string,
    userAgent?: string
  ): Promise<{
    accessToken: string;
    expiresIn: number;
    newRefreshToken: string;
  }> {
    if (!rawRefreshToken) {
      throw new UnauthorizedError('Refresh token required');
    }

    const tokenHash = hashRefreshToken(rawRefreshToken);

    const [tokenRecord] = await this.db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash))
      .limit(1);

    if (!tokenRecord) {
      throw new UnauthorizedError('Invalid refresh token');
    }

    // Theft Detection: If already revoked, an attacker or compromised party reused it!
    // Revoke the entire family immediately to protect the user.
    if (tokenRecord.revokedAt !== null) {
      await this.db
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(eq(refreshTokens.familyId, tokenRecord.familyId));

      await this.audit.record({
        action: 'auth.token.theft_detected',
        entity: 'user',
        entityId: tokenRecord.userId,
        ip,
        metadata: {
          familyId: tokenRecord.familyId,
          tokenId: tokenRecord.id
        }
      });

      throw new UnauthorizedError('Session compromised. Please log in again.');
    }

    // Check expiration
    if (tokenRecord.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedError('Refresh token expired');
    }

    // Verify user is still active
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, tokenRecord.userId))
      .limit(1);

    if (!user || user.status !== 'active') {
      throw new UnauthorizedError('User account is not active');
    }

    // Rotate: generate new token and replace old
    const { rawToken: newRawToken, tokenHash: newTokenHash, expiresAt } =
      generateOpaqueRefreshToken();
    const userAgentHash = userAgent
      ? crypto.createHash('sha256').update(userAgent).digest('hex')
      : null;

    const result = await this.db.transaction(async (tx) => {
      // Mark old token revoked and record replacement
      await tx
        .update(refreshTokens)
        .set({
          revokedAt: new Date(),
          replacedBy: newTokenHash
        })
        .where(eq(refreshTokens.id, tokenRecord.id));

      // Insert new token in same family
      await tx.insert(refreshTokens).values({
        userId: user.id,
        familyId: tokenRecord.familyId,
        tokenHash: newTokenHash,
        expiresAt,
        userAgentHash
      });

      const accessToken = await createAccessToken(user.id, user.role, this.config);

      return {
        accessToken,
        expiresIn: ACCESS_TOKEN_EXPIRY_SECONDS,
        newRefreshToken: newRawToken
      };
    });

    await this.audit.record({
      action: 'auth.token.refreshed',
      entity: 'user',
      entityId: user.id,
      actorUserId: user.id,
      ip
    });

    return result;
  }

  /**
   * Logs out the user by revoking the refresh token.
   */
  public async logout(rawRefreshToken?: string, ip?: string): Promise<void> {
    if (!rawRefreshToken) {
      return;
    }

    const tokenHash = hashRefreshToken(rawRefreshToken);
    const [tokenRecord] = await this.db
      .select({ id: refreshTokens.id, userId: refreshTokens.userId })
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash))
      .limit(1);

    if (tokenRecord) {
      await this.db
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(eq(refreshTokens.id, tokenRecord.id));

      await this.audit.record({
        action: 'auth.logout',
        entity: 'user',
        entityId: tokenRecord.userId,
        actorUserId: tokenRecord.userId,
        ip
      });
    }
  }

  /**
   * Retrieves the current user profile.
   */
  public async getCurrentUser(userId: string): Promise<SafeUser> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user || user.status !== 'active') {
      throw new UnauthorizedError('User account not found or inactive');
    }

    return sanitizeUser(user);
  }
}
