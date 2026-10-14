import React, { createContext, useContext, useState, useMemo, useCallback } from 'react';

export type UserRole = 'DONOR' | 'HOSPITAL' | 'ADMIN';

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  fullName?: string;
  entityId?: string;
}

export interface AuthContextValue {
  user: AuthUser | null;
  role: UserRole | null;
  isAuthenticated: boolean;
  accessToken: string | null;
  setAuthSession: (user: AuthUser, token: string) => void;
  clearAuthSession: () => void;
  setAccessToken: (token: string | null) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  // In-memory token and user state strictly inside React memory
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setTokenState] = useState<string | null>(null);

  const setAuthSession = useCallback((newUser: AuthUser, token: string) => {
    setUser(newUser);
    setTokenState(token);
  }, []);

  const clearAuthSession = useCallback(() => {
    setUser(null);
    setTokenState(null);
  }, []);

  const setAccessToken = useCallback((token: string | null) => {
    setTokenState(token);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      role: user?.role ?? null,
      isAuthenticated: Boolean(user && accessToken),
      accessToken,
      setAuthSession,
      clearAuthSession,
      setAccessToken
    }),
    [user, accessToken, setAuthSession, clearAuthSession, setAccessToken]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
