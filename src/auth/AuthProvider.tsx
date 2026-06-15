import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { ANONYMOUS_PRINCIPAL, can, Principal } from '../rbac';
import { api } from '../sync/api';
import { resetAllCacheStates } from '../sync/cacheStatus';
import { resetAllRefetchThrottles } from '../sync/refetch';
import { startSync, stopSync } from '../sync/syncService';
import { warmCache } from '../sync/warmCache';
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
      // Re-opening the app with a persisted session: warm the cache
      // immediately so Home/Stock/Catalog skeletons fill in before the
      // user reaches them. Fire-and-forget — non-blocking by design.
      // Also start the background sync loop (periodic flush + push on
      // reconnect) which is otherwise never started.
      if (s) {
        void warmCache();
        startSync();
      }
    });
    // Subscribe to session changes from any source — manual logout,
    // 401 auto-clear in sync/api.ts, or another tab updating storage.
    // When the session becomes null we also reset cache states and stop
    // the sync loop so the next login starts cold.
    return onSessionChange((next) => {
      setSessionState(next);
      if (next === null) {
        stopSync();
        resetAllCacheStates();
        resetAllRefetchThrottles();
      } else {
        // startSync is idempotent (no-op if already running), so it's
        // safe to call on every login / session refresh.
        startSync();
      }
    });
  }, []);

  const login = useCallback(async ({ guardName, pin }: { guardName: string; pin: string }) => {
    const res = await api.login({ guardName, pin });
    await setSession({
      token: res.token,
      guardId: res.guardId,
      guardName: res.guardName,
      language: res.language,
    });
    // Kick off the warm-up so Home tiles populate without waiting for
    // the periodic 30 s sync tick. Non-blocking — login() returns
    // immediately so the LoginScreen can navigate to Home and the user
    // sees skeletons that fill in as each request returns.
    void warmCache();
  }, []);

  const logout = useCallback(async () => {
    // clearSession() fires onSessionChange → the listener above resets
    // cache states. No need to call resetAllCacheStates here.
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
