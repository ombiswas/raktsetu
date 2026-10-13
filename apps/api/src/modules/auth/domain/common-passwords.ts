/**
 * Small bundled list of top common/weak passwords (normalized to lowercase).
 * Passwords matching this list are rejected even if they meet length requirements.
 */
export const COMMON_PASSWORDS: ReadonlySet<string> = new Set([
  'password1234',
  'password12345',
  'password123456',
  'qwertyuiop12',
  '123456789012',
  '1234567890123',
  'admin1234567',
  'admin12345678',
  'welcome12345',
  'welcome123456',
  'letmein12345',
  'iloveyou1234',
  'monkey123456',
  'dragon123456',
  'sunshine1234',
  'princess1234',
  'football1234',
  'superman1234',
  'trustnoone12',
  'whatever1234',
  'testpassword1',
  'raktsetu1234',
  'changeme12345'
]);

/**
 * Checks if a candidate password appears in the common passwords list.
 */
export function isCommonPassword(password: string): boolean {
  return COMMON_PASSWORDS.has(password.trim().toLowerCase());
}
