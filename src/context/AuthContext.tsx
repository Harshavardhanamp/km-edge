import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { KEYS, clearSession, get, set } from '../lib/secureStore';

interface AuthSession {
  userId: string;
  offline?: boolean;
}

interface AuthContextValue {
  sessionValid: boolean;
  userId: string;
  offline: boolean;
  login: (session: AuthSession) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    async function restore() {
      const userId = await get(KEYS.GKS_USERNAME);
      const verifier = await get(KEYS.OFFLINE_VERIFIER);
      if (userId && verifier) {
        // Credentials exist — treat as valid session; gksProbe will refine online/offline
        setSession({ userId });
      }
      setLoaded(true);
    }
    restore();
  }, []);

  const login = useCallback((s: AuthSession) => {
    set(KEYS.GKS_USERNAME, s.userId);
    setSession(s);
  }, []);

  const logout = useCallback(async () => {
    await clearSession();
    setSession(null);
  }, []);

  if (!loaded) return null;

  return (
    <AuthContext.Provider
      value={{
        sessionValid: !!session,
        userId: session?.userId ?? '',
        offline: session?.offline ?? false,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
