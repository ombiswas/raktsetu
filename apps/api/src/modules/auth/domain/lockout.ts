import { eq } from 'drizzle-orm';
import type { DatabaseInstance } from '../../../platform/database/connection.js';
import { loginAttempts } from '../../../platform/database/schema.js';

export const MAX_FAILED_LOGIN_ATTEMPTS = 5;
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

export interface LockoutStatus {
  isLocked: boolean;
  remainingSeconds: number;
}

export class LockoutService {
  constructor(private readonly db: DatabaseInstance) {}

  /**
   * Checks whether the given identifier (account email or IP hash) is temporarily locked.
   */
  public async checkLockout(identifier: string): Promise<LockoutStatus> {
    const [record] = await this.db
      .select({
        failedCount: loginAttempts.failedCount,
        lockedUntil: loginAttempts.lockedUntil
      })
      .from(loginAttempts)
      .where(eq(loginAttempts.identifier, identifier))
      .limit(1);

    if (!record || !record.lockedUntil) {
      return { isLocked: false, remainingSeconds: 0 };
    }

    const now = Date.now();
    const lockedUntilMs = record.lockedUntil.getTime();

    if (lockedUntilMs > now) {
      const remainingSeconds = Math.ceil((lockedUntilMs - now) / 1000);
      return { isLocked: true, remainingSeconds };
    }

    return { isLocked: false, remainingSeconds: 0 };
  }

  /**
   * Records a failed authentication attempt.
   * If the attempt threshold is reached, locks the identifier for LOCKOUT_DURATION_MS.
   */
  public async recordFailedAttempt(
    identifier: string
  ): Promise<{ isLocked: boolean; failedCount: number }> {
    const now = new Date();
    const [existing] = await this.db
      .select({
        failedCount: loginAttempts.failedCount,
        lockedUntil: loginAttempts.lockedUntil
      })
      .from(loginAttempts)
      .where(eq(loginAttempts.identifier, identifier))
      .limit(1);

    let newCount = 1;
    let shouldLock = false;

    if (existing) {
      // If previous lockout expired, reset counter to 1, otherwise increment
      const isPastLockout = existing.lockedUntil && existing.lockedUntil.getTime() <= now.getTime();
      newCount = isPastLockout ? 1 : existing.failedCount + 1;
      shouldLock = newCount >= MAX_FAILED_LOGIN_ATTEMPTS;

      const lockedUntil = shouldLock ? new Date(now.getTime() + LOCKOUT_DURATION_MS) : null;

      await this.db
        .update(loginAttempts)
        .set({
          failedCount: newCount,
          lockedUntil,
          lastAttemptAt: now
        })
        .where(eq(loginAttempts.identifier, identifier));
    } else {
      shouldLock = newCount >= MAX_FAILED_LOGIN_ATTEMPTS;
      const lockedUntil = shouldLock ? new Date(now.getTime() + LOCKOUT_DURATION_MS) : null;

      await this.db.insert(loginAttempts).values({
        identifier,
        failedCount: newCount,
        lockedUntil,
        lastAttemptAt: now
      });
    }

    return { isLocked: shouldLock, failedCount: newCount };
  }

  /**
   * Resets failed login attempts for an identifier upon successful authentication.
   */
  public async resetAttempts(identifier: string): Promise<void> {
    await this.db
      .delete(loginAttempts)
      .where(eq(loginAttempts.identifier, identifier));
  }
}
