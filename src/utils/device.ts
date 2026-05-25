import AsyncStorage from '@react-native-async-storage/async-storage';
import { nanoid } from 'nanoid/non-secure';

const KEY = 'field-app:device-id';

let cached: string | null = null;

export async function getDeviceId(): Promise<string> {
  if (cached) return cached;
  const stored = await AsyncStorage.getItem(KEY);
  if (stored) {
    cached = stored;
    return stored;
  }
  const id = `dev_${nanoid(12)}`;
  await AsyncStorage.setItem(KEY, id);
  cached = id;
  return id;
}
