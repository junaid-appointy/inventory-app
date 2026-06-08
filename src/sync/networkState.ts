/**
 * Authoritative "are we online?" signal for the field-app.
 *
 * Why this exists:
 *   `expo-network` alone is unreliable on mid-range Android devices —
 *   `isConnected` sometimes returns `undefined` or stays `false` even
 *   when the radio is up and API calls are succeeding. The old
 *   OfflineBanner just `!isConnected`'d that into a permanently-stuck
 *   "Offline" banner.
 *
 * Strategy here:
 *   • Track the timestamp of the last successful API request.
 *   • If a request succeeded recently (within `RECENT_SUCCESS_MS`),
 *     consider the device online regardless of what expo-network says.
 *   • Otherwise fall back to expo-network. Treat `undefined` as online
 *     (assume best; false positives are worse than false negatives).
 *   • Re-probe periodically so we recover when the radio comes back
 *     between transitions the OS forgot to emit.
 *
 * The api client (`sync/api.ts`) calls `markApiSuccess()` after every
 * 2xx response and `markApiNetworkError()` on `Network request failed`.
 */

import * as Network from 'expo-network';

const RECENT_SUCCESS_MS = 20_000; // 20 s: if we got a 200 in that window, we're online.
const REPROBE_MS = 15_000; // poll expo-network every 15 s as a backup.

type Listener = (online: boolean) => void;

let lastApiSuccessAt = 0;
let lastApiErrorAt = 0;
let probedOnline: boolean | null = null; // null until first probe finishes.
let currentOnline = true; // optimistic default.
const listeners = new Set<Listener>();

function recompute(): void {
  const now = Date.now();
  const recentSuccess = now - lastApiSuccessAt < RECENT_SUCCESS_MS;
  // A recent success is the strongest signal — if the server replied in
  // the last few seconds, the network is up. Beats expo-network because
  // some devices misreport on the radio side.
  const next = recentSuccess
    ? true
    // Else: use the probe if we have one, otherwise default to online.
    // Critically we DO NOT flip offline when the probe is `null`.
    : probedOnline !== false;
  if (next !== currentOnline) {
    currentOnline = next;
    for (const fn of listeners) {
      try { fn(currentOnline); } catch { /* swallow */ }
    }
  }
}

async function probe(): Promise<void> {
  try {
    const s = await Network.getNetworkStateAsync();
    // Treat undefined as "not enough info" → leave probedOnline at its
    // previous value, OR if never set, leave it null so the override
    // logic above defaults to online.
    if (typeof s.isConnected === 'boolean') {
      probedOnline = s.isConnected;
    }
  } catch {
    // Probe failed — leave the previous value, don't flip the user offline
    // just because expo-network errored.
  } finally {
    recompute();
  }
}

/** Public hook: called by the API client after a successful response. */
export function markApiSuccess(): void {
  lastApiSuccessAt = Date.now();
  recompute();
}

/** Public hook: called by the API client after a network-layer failure
 *  (DNS, socket, fetch threw). NOT for 4xx / 5xx — those mean we got to
 *  the server. */
export function markApiNetworkError(): void {
  lastApiErrorAt = Date.now();
  // Probe immediately to refresh the OS signal — we don't trust a cached
  // "online" if the radio just dropped.
  void probe();
}

export function isOnline(): boolean {
  return currentOnline;
}

export function subscribeNetworkState(fn: Listener): () => void {
  listeners.add(fn);
  // Fire once with the current state so the subscriber doesn't have to
  // also call isOnline() to initialise.
  try { fn(currentOnline); } catch { /* swallow */ }
  return () => {
    listeners.delete(fn);
  };
}

let started = false;

/** Boot the background probe. Called once at app start. */
export function startNetworkProbe(): void {
  if (started) return;
  started = true;
  void probe();
  setInterval(() => { void probe(); }, REPROBE_MS);
  try {
    Network.addNetworkStateListener((state) => {
      if (typeof state.isConnected === 'boolean') probedOnline = state.isConnected;
      recompute();
    });
  } catch {
    // Older expo-network builds: silently rely on the polling probe.
  }
}

// For tests / debug.
export function _resetForTests(): void {
  lastApiSuccessAt = 0;
  lastApiErrorAt = 0;
  probedOnline = null;
  currentOnline = true;
  listeners.clear();
  started = false;
}
