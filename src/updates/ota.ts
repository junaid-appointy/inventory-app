import * as Updates from 'expo-updates';
import { useEffect } from 'react';
import { AppState } from 'react-native';

/**
 * Over-the-air updates (EAS Update): new JavaScript and images reach every
 * installed APK without sharing a new APK. Native changes (a new library,
 * a new permission) still need a new APK; the "fingerprint" runtime version
 * in app.json makes sure an update only goes to APKs whose native code it
 * matches, so an update can never crash an older install.
 *
 * Flow, built for patchy Wi-Fi and people mid-task:
 *   - check when the app opens and when it comes back to the foreground,
 *     at most every 30 minutes (each check is a small request);
 *   - download quietly in the background;
 *   - show a small "update ready" banner (UpdateBanner): one tap restarts
 *     into it, otherwise it applies on the next launch by itself.
 *
 * Off in development builds (they load code from the dev server).
 */

export const otaEnabled = !__DEV__ && Updates.isEnabled;

const MIN_GAP_MS = 30 * 60_000;
let lastCheck = 0;
let inFlight: Promise<OtaResult> | null = null;

export type OtaResult = 'downloaded' | 'latest' | 'offline' | 'disabled';

/** Check and, if there is one, download the newest update. Never throws. */
export function checkForOta(force = false): Promise<OtaResult> {
  if (!otaEnabled) return Promise.resolve('disabled');
  if (inFlight) return inFlight;
  if (!force && Date.now() - lastCheck < MIN_GAP_MS) return Promise.resolve('latest');
  lastCheck = Date.now();
  inFlight = (async (): Promise<OtaResult> => {
    try {
      const check = await Updates.checkForUpdateAsync();
      if (!check.isAvailable) return 'latest';
      const fetched = await Updates.fetchUpdateAsync();
      return fetched.isNew ? 'downloaded' : 'latest';
    } catch {
      // No internet or the update server is unreachable: try again later.
      lastCheck = 0;
      return 'offline';
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/** Restart into the downloaded update. */
export function applyOta(): Promise<void> {
  return Updates.reloadAsync();
}

/** Mount once at the root: checks on launch and whenever the app returns. */
export function useOtaChecks(): void {
  useEffect(() => {
    if (!otaEnabled) return;
    void checkForOta();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void checkForOta();
    });
    return () => sub.remove();
  }, []);
}

/** Whether an update is downloaded and waiting for a restart. */
export function useOtaPending(): boolean {
  const { isUpdatePending } = Updates.useUpdates();
  return otaEnabled && isUpdatePending;
}

/** What is running, for Settings: "0.1.0 · 15 Oct 2026" (update date, or the APK's own code). */
export function runningVersion(appVersion: string | null | undefined): string {
  const v = appVersion ?? '';
  if (!otaEnabled || Updates.isEmbeddedLaunch || !Updates.createdAt) return v;
  const d = Updates.createdAt;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${v} · ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}
