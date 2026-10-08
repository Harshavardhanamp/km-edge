import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { KEYS, clearSession, get, set } from '../lib/secureStore';
import { AppState } from 'react-native';
import { onSessionInvalid } from '../lib/gksClient';
import { clearIdentities } from '../lib/db/identityCache';
import { clearCaptureDraft } from '../lib/db/captureDraft';
import { refreshIdentityCache } from '../lib/sync/identityRefresh';

interface AuthSession {
  userId: string;
  displayName?: string;
  offline?: boolean;
}

interface AuthContextValue {
  sessionValid: boolean;
  userId: string;
  displayName: string;
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
      const userId = await get(KEYS.GKS_USER_ID);
      const token = await get(KEYS.EDGE_TOKEN);
      const verifier = await get(KEYS.OFFLINE_VERIFIER);
      if (userId && (token || verifier)) {
        const username = await get(KEYS.GKS_USERNAME);
        setSession({ userId, displayName: username ?? userId });
      }
      setLoaded(true);
    }
    restore();
  }, []);

  useEffect(() => {
    return onSessionInvalid(async () => {
      await clearSession();
      clearIdentities();   // KK-2.2 E3.3: the cache belongs to the session; an unfinished draft is kept
      setSession(null);
    });
  }, []);

  // KK-2.2 E3.2: refresh the identity-name cache when the app comes to the foreground.
  useEffect(() => {
    if (!session || session.offline) return;
    const refresh = async () => {
      const baseUrl = await get(KEYS.GKS_SERVER_URL);
      if (baseUrl) await refreshIdentityCache(baseUrl).catch(() => false);
    };
    void refresh();
    const sub = AppState.addEventListener('change', next => { if (next === 'active') void refresh(); });
    return () => sub.remove();
  }, [session]);

  const login = useCallback((s: AuthSession) => {
    if (s.displayName) set(KEYS.GKS_USERNAME, s.displayName);
    setSession(s);
  }, []);

  const logout = useCallback(async () => {
    await clearSession();
    clearIdentities();     // KK-2.2 E3.3
    clearCaptureDraft();   // E-D1: a draft does not outlive its user's sign-out
    setSession(null);
  }, []);

  if (!loaded) return null;

  return (
    <AuthContext.Provider
      value={{
        sessionValid: !!session,
        userId: session?.userId ?? '',
        displayName: session?.displayName ?? session?.userId ?? '',
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
