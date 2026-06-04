import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_KEY_PREFIX = '@auxilio-cache-time:';
const CACHE_TTL = 30 * 1000; // 30 seconds

export async function getLastSyncTime(screenName: string): Promise<number> {
  try {
    const stored = await AsyncStorage.getItem(`${CACHE_KEY_PREFIX}${screenName}`);
    return stored ? parseInt(stored, 10) : 0;
  } catch {
    return 0;
  }
}

export async function setLastSyncTime(screenName: string): Promise<void> {
  try {
    await AsyncStorage.setItem(`${CACHE_KEY_PREFIX}${screenName}`, Date.now().toString());
  } catch {
    // Silent fail - caching is best-effort
  }
}

export function isCacheStale(lastSyncTime: number): boolean {
  return Date.now() - lastSyncTime > CACHE_TTL;
}

export function clearAllSyncTimes(): Promise<void> {
  return AsyncStorage.multiRemove([
    `${CACHE_KEY_PREFIX}home`,
    `${CACHE_KEY_PREFIX}orders`,
    `${CACHE_KEY_PREFIX}alerts`,
    `${CACHE_KEY_PREFIX}stock`,
    `${CACHE_KEY_PREFIX}catalog`,
  ]);
}
