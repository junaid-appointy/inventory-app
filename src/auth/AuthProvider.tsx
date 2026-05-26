import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { ANONYMOUS_PRINCIPAL, can, Principal } from '../rbac';
import { api } from '../sync/api';
import { clearSession, GuardSession, getSession, hydrateSession, onSessionChange, setSession } from './session';

type Ctx = {
  /** True once we've read AsyncStorage for any persisted session. */
  ready: boolean;
  session: GuardSession | null;
  principal: Principal;
  login: (input: { guardName: string; pin: string }) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<Ctx | null>(null);

function principalFromSession(session: GuardSession | null): Principal {
  if (!session) return ANONYMOUS_PRINCIPAL;
  // Backend doesn't yet return roles/permissions for the guard. Until it
  // does, every logged-in guard gets the inventory module's view +
  // capture permissions. Replace with server-supplied values when the
  // /api/guard/login response grows them.
  return {
    userId: session.guardId,
    roles: ['guard'],
    permissions: [
      'inventory.view',
      'inventory.receive',
      'inventory.issue',
      'inventory.register',
      'inventory.reorder',
    ],
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSessionState] = useState<GuardSession | null>(getSession());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    hydrateSession().then((s) => {
      setSessionState(s);
      setReady(true);
    });
    return onSessionChange(setSessionState);
  }, []);

  const login = useCallback(async ({ guardName, pin }: { guardName: string; pin: string }) => {
    const res = await api.login({ guardName, pin });
    await setSession({
      token: res.token,
      guardId: res.guardId,
      guardName: res.guardName,
      language: res.language,
    });
  }, []);

  const logout = useCallback(async () => {
    await clearSession();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        ready,
        session,
        principal: principalFromSession(session),
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): Ctx {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}

/**
 * Permission checker tied to the live session. Replaces the stub in
 * `rbac/permissions.ts` for use inside the React tree.
 */
export function useCan() {
  const { principal } = useAuth();
  return useCallback((permission: string) => can(principal, permission), [principal]);
}
