/**
 * Session store for the guard's PIN-based login.
 *
 * Persists `{ token, guardId, guardName, language }` in AsyncStorage and
 * notifies subscribers when it changes. Network code (`sync/api.ts`)
 * reads the current token; the navigation root subscribes to know
 * whether to render the Login screen or the main stack.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'app.session';

export type GuardSession = {
  token: string;
  guardId: string;
  guardName: string;
  language: 'hindi' | 'english';
};

type Listener = (session: GuardSession | null) => void;

let current: GuardSession | null = null;
let hydrated = false;
const listeners = new Set<Listener>();

export async function hydrateSession(): Promise<GuardSession | null> {
  if (hydrated) return current;
  hydrated = true;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) current = JSON.parse(raw) as GuardSession;
  } catch {
    current = null;
  }
  notify();
  return current;
}

export function getSession(): GuardSession | null {
  return current;
}

export async function setSession(s: GuardSession): Promise<void> {
  current = s;
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  notify();
}

export async function clearSession(): Promise<void> {
  current = null;
  await AsyncStorage.removeItem(STORAGE_KEY);
  notify();
}

export function onSessionChange(l: Listener): () => void {
  listeners.add(l);
  l(current);
  return () => listeners.delete(l);
}

function notify() {
  for (const l of listeners) l(current);
}
