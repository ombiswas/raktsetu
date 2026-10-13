import { describe, it, expect } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  performDummyPasswordVerify,
  normalizeEmail,
  validatePasswordStrength,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH
} from '../../../../src/modules/auth/domain/password.js';
import { isCommonPassword } from '../../../../src/modules/auth/domain/common-passwords.js';
import { ValidationError } from '../../../../src/platform/http/errors.js';

describe('Password Domain Service', () => {
  describe('Email Normalization', () => {
    it('normalizes emails to lowercase and trims whitespace', () => {
      expect(normalizeEmail('  User.Name@Example.COM  ')).toBe('user.name@example.com');
      expect(normalizeEmail('DONOR@RAKTSETU.IN')).toBe('donor@raktsetu.in');
    });
  });

  describe('Password Strength Validation', () => {
    it('accepts strong passphrases exceeding minimum length', () => {
      expect(() =>
        validatePasswordStrength('correct-horse-battery-staple-2026')
      ).not.toThrow();
    });

    it('rejects passwords shorter than 12 characters', () => {
      expect(() => validatePasswordStrength('short123')).toThrow(ValidationError);
      expect(() => validatePasswordStrength('short123')).toThrow(
        `Password must be at least ${PASSWORD_MIN_LENGTH} characters long`
      );
    });

    it('rejects passwords exceeding 128 characters', () => {
      const longPass = 'a'.repeat(PASSWORD_MAX_LENGTH + 1);
      expect(() => validatePasswordStrength(longPass)).toThrow(ValidationError);
    });

    it('rejects top common passwords', () => {
      expect(isCommonPassword('password1234')).toBe(true);
      expect(() => validatePasswordStrength('password1234')).toThrow(
        /Password is too common/
      );
      expect(() => validatePasswordStrength('qwertyuiop12')).toThrow(
        /Password is too common/
      );
    });
  });

  describe('Argon2id Hashing and Verification', () => {
    it('hashes passwords using Argon2id format and verifies correctly', async () => {
      const plain = 'StrongPassphrase2026!#Secure';
      const hash = await hashPassword(plain);

      expect(hash).toMatch(/^\$argon2id\$/);

      const isValid = await verifyPassword(plain, hash);
      expect(isValid).toBe(true);

      const isInvalid = await verifyPassword('WrongPassword123!', hash);
      expect(isInvalid).toBe(false);
    });

    it('dummy argon2 verification completes and returns false', async () => {
      const result = await performDummyPasswordVerify('AnyPasswordAttempt123!');
      expect(result).toBe(false);
    });
  });
});
