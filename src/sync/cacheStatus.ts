/**
 * Per-cache render state.
 *
 * Every read screen (Home tiles, Stock list, Catalog picker, Orders,
 * Alerts) needs to know two things to render correctly:
 *
 *   1. Is there anything in local SQLite yet? (The screen reads this
 *      itself.)
 *   2. What is the network layer doing about it right now? (Driven by
 *      this module.)
 *
 * Five states cover every combination cleanly:
 *
 *   cold        Never fetched this session. Render Skeleton.
 *   warm        Fetched at least once; no fetch in flight. Render data.
 *   refreshing  Fetch in flight. If data exists, render it + indicator;
 *               if not, render Skeleton.
 *   error       Last fetch failed. Render data if any + retry banner;
 *               if not, render error placeholder.
 *   offline     Network down. Render data if any + offline banner;
 *               if not, render "offline, no cache".
 *
 * The store is module-singleton (no React context overhead) and notifies
 * subscribers per-key, so a Stock-state change does not re-render every
 * Home tile.
 */

import { useEffect, useState } from 'react';

export type CacheKey = 'catalog' | 'stock' | 'orders' | 'alerts';

export type CacheState = 'cold' | 'warm' | 'refreshing' | 'error' | 'offline';

export type CacheStatus = {
  /** Current network-layer state for this key. */
  state: CacheState;
  /** Has any fetch for this key ever succeeded this session? Drives
   *  Skeleton-vs-data decisions independently of `state` — once true, a
   *  subsequent `refreshing` doesn't re-skeleton, it just adds a
   *  spinner on top of the existing data. */
  hasEverBeenWarm: boolean;
};

const ALL_KEYS: readonly CacheKey[] = ['catalog', 'stock', 'orders', 'alerts'];

const states = new Map<CacheKey, CacheState>();
const everWarm = new Map<CacheKey, boolean>();
type Listener = (status: CacheStatus) => void;
const listeners = new Map<CacheKey, Set<Listener>>();

function statusOf(key: CacheKey): CacheStatus {
  return {
    state: states.get(key) ?? 'cold',
    hasEverBeenWarm: everWarm.get(key) ?? false,
  };
}

export function getCacheStatus(key: CacheKey): CacheStatus {
  return statusOf(key);
}

function setStateInternal(key: CacheKey, state: CacheState, alsoMarkWarm: boolean): void {
  const prev = states.get(key);
  const prevWarm = everWarm.get(key) ?? false;
  if (prev === state && (!alsoMarkWarm || prevWarm)) return;
  states.set(key, state);
  if (alsoMarkWarm) everWarm.set(key, true);
  const status = statusOf(key);
  const ls = listeners.get(key);
  if (!ls) return;
  for (const l of ls) {
    try { l(status); } catch { /* listener errors must not break the notifier */ }
  }
}

export function onCacheStateChange(key: CacheKey, l: Listener): () => void {
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  set.add(l);
  return () => { set!.delete(l); };
}

/** React hook — re-renders the calling component when this key's status
 *  transitions. Initial value is the current status (no flash). */
export function useCacheStatus(key: CacheKey): CacheStatus {
  const [s, setS] = useState<CacheStatus>(() => statusOf(key));
  useEffect(() => onCacheStateChange(key, setS), [key]);
  return s;
}

/** Helpers callers use to drive the state machine. Centralised so the
 *  transitions stay consistent across warmCache, per-screen refetches,
 *  and post-write invalidation. */
export const cache = {
  refreshing: (key: CacheKey) => setStateInternal(key, 'refreshing', false),
  // `warm` also flips hasEverBeenWarm permanently — subsequent
  // refreshes won't re-skeleton the screen.
  warm: (key: CacheKey) => setStateInternal(key, 'warm', true),
  error: (key: CacheKey) => setStateInternal(key, 'error', false),
  offline: (key: CacheKey) => setStateInternal(key, 'offline', false),
};

/** Reset every cache to cold AND clear the hasEverBeenWarm flag.
 *  Called when the session ends (logout / 401 auto-clear) so the next
 *  session starts truly cold. */
export function resetAllCacheStates(): void {
  for (const k of ALL_KEYS) {
    states.set(k, 'cold');
    everWarm.set(k, false);
    const status = statusOf(k);
    const ls = listeners.get(k);
    if (!ls) continue;
    for (const l of ls) {
      try { l(status); } catch { /* swallow */ }
    }
  }
}
