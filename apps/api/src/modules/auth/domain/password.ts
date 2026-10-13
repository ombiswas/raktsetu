import argon2 from 'argon2';
import { isCommonPassword } from './common-passwords.js';
import { ValidationError } from '../../../platform/http/errors.js';

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19456, // 19 MiB (OWASP recommendation)
  timeCost: 2,       // 2 iterations
  parallelism: 1
};

// Pre-computed dummy argon2id hash matching the exact parameters, used to ensure
// constant-time verification behavior for nonexistent user accounts.
let dummyPasswordHash: string | null = null;

export async function getDummyPasswordHash(): Promise<string> {
  if (!dummyPasswordHash) {
    dummyPasswordHash = await argon2.hash('raktsetu-constant-time-dummy-password-salt', ARGON2_OPTIONS);
  }
  return dummyPasswordHash;
}

/**
 * Normalizes an email address to lowercase and strips leading/trailing whitespace.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Validates password strength:
 * - Minimum 12 characters
 * - Maximum 128 characters
 * - Not in bundled common passwords list
 */
export function validatePasswordStrength(password: string): void {
  if (typeof password !== 'string') {
    throw new ValidationError('Password must be a string');
  }

  if (password.length < PASSWORD_MIN_LENGTH) {
    throw new ValidationError(
      `Password must be at least ${PASSWORD_MIN_LENGTH} characters long`
    );
  }

  if (password.length > PASSWORD_MAX_LENGTH) {
    throw new ValidationError(
      `Password must not exceed ${PASSWORD_MAX_LENGTH} characters`
    );
  }

  if (isCommonPassword(password)) {
    throw new ValidationError(
      'Password is too common and easily guessable. Please choose a stronger passphrase.'
    );
  }
}

/**
 * Hashes a plaintext password using Argon2id with OWASP-tuned parameters.
 */
export async function hashPassword(password: string): Promise<string> {
  validatePasswordStrength(password);
  return argon2.hash(password, ARGON2_OPTIONS);
}

/**
 * Verifies a plaintext password against an Argon2id hash.
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

/**
 * Performs a dummy argon2 verification against a valid Argon2id hash.
 * Ensures the response time for unknown email addresses matches real user password checks.
 */
export async function performDummyPasswordVerify(password: string): Promise<boolean> {
  const dummyHash = await getDummyPasswordHash();
  try {
    await argon2.verify(dummyHash, password);
  } catch {
    // Ignore error
  }
  return false;
}
