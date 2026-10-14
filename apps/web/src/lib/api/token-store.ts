let inMemoryAccessToken: string | null = null;
type AuthChangeListener = (token: string | null) => void;
const listeners = new Set<AuthChangeListener>();

/**
 * Access token stored strictly in JavaScript runtime memory.
 * NEVER written to localStorage, sessionStorage, or client disk.
 */
export function getAccessToken(): string | null {
  return inMemoryAccessToken;
}

export function setAccessToken(token: string | null): void {
  inMemoryAccessToken = token;
  listeners.forEach((listener) => {
    try {
      listener(token);
    } catch (err) {
      console.error('Error in auth change listener:', err);
    }
  });
}

export function clearAccessToken(): void {
  setAccessToken(null);
}

export function onAuthChange(listener: AuthChangeListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
