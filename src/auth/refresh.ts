/**
 * Pull the live roles/permissions for the signed-in person and store them
 * on the session. Non-React so the sync worker can call it too.
 */
import { api } from '../sync/api';
import { getSession, setSession } from './session';

let inFlight: Promise<void> | null = null;

export function refreshSessionAccess(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const current = getSession();
    if (!current) return;
    try {
      const res = await api.session();
      const latest = getSession();
      // Signed out or switched user while the request was in flight.
      if (!latest || latest.token !== current.token) return;
      // Older server without roles: keep what we have.
      if (!Array.isArray(res.permissions)) return;
      await setSession({ ...latest, roles: res.roles ?? [], permissions: res.permissions });
    } catch {
      // Offline or server error: keep the cached access. A 401 is already
      // handled in request(), which clears the session.
    }
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
}
