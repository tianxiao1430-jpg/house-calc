/**
 * Persistent session store using AsyncStorage.
 * Data survives app backgrounding and process death.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ExtractedProperty, Mode, CostResult } from '../types';

interface SessionData {
  mode: Mode;
  imageUri?: string;
  extracted?: ExtractedProperty;
  property?: Record<string, any>;
  costResult?: CostResult;
}

const SESSION_KEY = 'house_calc_session';

let _cache: SessionData | null = null;

export async function setSession(data: Partial<SessionData>): Promise<void> {
  const current = await getSession();
  const next = { ...current, ...data };
  _cache = next;
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(next));
}

export async function getSession(): Promise<SessionData> {
  if (_cache) return _cache;
  const raw = await AsyncStorage.getItem(SESSION_KEY);
  _cache = raw ? JSON.parse(raw) : { mode: 'rent' };
  return _cache!;
}

export async function clearSession(): Promise<void> {
  _cache = { mode: 'rent' };
  await AsyncStorage.removeItem(SESSION_KEY);
}
