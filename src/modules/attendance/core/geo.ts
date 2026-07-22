/**
 * Geofence signal — captures where a punch happened for server-side
 * verification. The native win over a PWA is here: `mocked` flags a fake/
 * mock GPS location, which the browser cannot detect.
 *
 * Soft signal, never a hard block: if permission is denied, GPS is
 * unavailable, or the native module isn't present yet (pre-EAS-rebuild), we
 * return null and the punch still goes through. The engine records the fix +
 * mock flag and flags implausible ones for review — it does not reject.
 *
 * `expo-location` is loaded via a guarded dynamic import so this file compiles
 * and the app runs before the dependency is installed and the dev-client is
 * rebuilt. Add `expo-location` to package.json + app.json plugins and rebuild
 * to make it live.
 */

export type PunchGeo = {
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  mocked: boolean;
} | null;

// Variable specifier keeps the type-checker from requiring the module to be
// installed; at runtime Metro resolves it once the dep is present.
const LOCATION_MODULE = 'expo-location';

async function loadLocation(): Promise<any | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod: any = await import(LOCATION_MODULE);
    return mod?.default ?? mod ?? null;
  } catch {
    return null;
  }
}

export async function getPunchGeo(): Promise<PunchGeo> {
  try {
    const Location = await loadLocation();
    if (!Location?.requestForegroundPermissionsAsync) return null;

    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;

    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy?.Balanced ?? 3,
    });
    return {
      latitude: pos?.coords?.latitude ?? null,
      longitude: pos?.coords?.longitude ?? null,
      accuracy: pos?.coords?.accuracy ?? null,
      // Android surfaces this; iOS omits it (treated as not-mocked).
      mocked: pos?.mocked === true,
    };
  } catch {
    return null;
  }
}
