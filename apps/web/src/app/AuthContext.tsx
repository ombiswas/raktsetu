import React, { createContext, useContext, useState, useMemo, useCallback, useEffect } from 'react';
import { apiFetch, setAccessToken as setTokenStore, clearAccessToken as clearTokenStore, getAccessToken } from '../lib/api/index.js';

export type UserRole = 'donor' | 'hospital' | 'blood_bank' | 'admin';
export type UserStatus = 'pending' | 'active' | 'suspended';

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  fullName?: string;
  lastLoginAt?: string | null;
  createdAt?: string;
}

export interface AuthContextValue {
  user: AuthUser | null;
  role: UserRole | null;
  status: UserStatus | null;
  isAuthenticated: boolean;
  accessToken: string | null;
  isBootstrapping: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setAuthSession: (user: AuthUser, token: string) => void;
  updateUser: (patch: Partial<AuthUser>) => void;
  clearAuthSession: () => void;
  bootstrapSession: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessTokenState] = useState<string | null>(getAccessToken());
  const [isBootstrapping, setIsBootstrapping] = useState<boolean>(true);

  const setAuthSession = useCallback((newUser: AuthUser, token: string) => {
    setUser(newUser);
    setAccessTokenState(token);
    setTokenStore(token);
  }, []);

  const updateUser = useCallback((patch: Partial<AuthUser>) => {
    setUser((prev) => (prev ? { ...prev, ...patch } : null));
  }, []);

  const clearAuthSession = useCallback(() => {
    setUser(null);
    setAccessTokenState(null);
    clearTokenStore();
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiFetch('/api/v1/auth/logout', {
        method: 'POST',
        skipAutoRefresh: true
      });
    } catch {
      // Proceed with client wipe even if network fails
    } finally {
      clearAuthSession();
    }
  }, [clearAuthSession]);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await apiFetch<{
        accessToken: string;
        user: AuthUser;
      }>('/api/v1/auth/login', {
        method: 'POST',
        skipAutoRefresh: true,
        body: JSON.stringify({ email, password })
      });

      if (res && res.accessToken && res.user) {
        setAuthSession(res.user, res.accessToken);
      }
    },
    [setAuthSession]
  );

  const bootstrapSession = useCallback(async () => {
    setIsBootstrapping(true);
    try {
      const refreshRes = await apiFetch<{ accessToken: string }>('/api/v1/auth/refresh', {
        method: 'POST',
        skipAutoRefresh: true
      });

      if (refreshRes && refreshRes.accessToken) {
        setTokenStore(refreshRes.accessToken);
        setAccessTokenState(refreshRes.accessToken);

        const meRes = await apiFetch<{ user: AuthUser }>('/api/v1/auth/me', {
          skipAutoRefresh: true
        });

        if (meRes && meRes.user) {
          setUser(meRes.user);
        } else {
          clearAuthSession();
        }
      } else {
        clearAuthSession();
      }
    } catch {
      clearAuthSession();
    } finally {
      setIsBootstrapping(false);
    }
  }, [clearAuthSession]);

  useEffect(() => {
    bootstrapSession();
  }, [bootstrapSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      role: user?.role ?? null,
      status: user?.status ?? null,
      isAuthenticated: Boolean(user && accessToken),
      accessToken,
      isBootstrapping,
      login,
      logout,
      setAuthSession,
      updateUser,
      clearAuthSession,
      bootstrapSession
    }),
    [user, accessToken, isBootstrapping, login, logout, setAuthSession, updateUser, clearAuthSession, bootstrapSession]
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
