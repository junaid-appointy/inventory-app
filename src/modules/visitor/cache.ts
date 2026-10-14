/**
 * Small offline caches for the gate, in AsyncStorage (they are lists the
 * guard reads, not records we write):
 *  - today's expected guests, so a pass can be matched with no internet;
 *  - the staff directory, so host suggestions are instant and work offline.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ExpectedGuest, StaffMember } from './api';

const EXPECTED_KEY = 'visitor.expected.v1';
const STAFF_KEY = 'visitor.staff.v1';
export const STAFF_TTL_MS = 6 * 60 * 60 * 1000;

export type CachedExpected = { generatedAt: string; guests: ExpectedGuest[] };
export type CachedStaff = { loadedAt: number; staff: StaffMember[] };

async function read<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export const readExpected = () => read<CachedExpected>(EXPECTED_KEY);
export const saveExpected = (v: CachedExpected) => AsyncStorage.setItem(EXPECTED_KEY, JSON.stringify(v)).catch(() => {});
export const readStaff = () => read<CachedStaff>(STAFF_KEY);
export const saveStaff = (v: CachedStaff) => AsyncStorage.setItem(STAFF_KEY, JSON.stringify(v)).catch(() => {});

export async function findExpectedByToken(token: string): Promise<ExpectedGuest | null> {
  const cached = await readExpected();
  return cached?.guests.find((g) => g.qrToken === token) ?? null;
}
