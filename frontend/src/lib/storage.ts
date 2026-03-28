import AsyncStorage from '@react-native-async-storage/async-storage';
import type { HistoryEntry } from '../types';

const HISTORY_KEY = 'house_calc_history';
const MAX_ENTRIES = 20;

export async function getHistory(): Promise<HistoryEntry[]> {
  const raw = await AsyncStorage.getItem(HISTORY_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export async function saveHistory(entry: HistoryEntry): Promise<void> {
  const history = await getHistory();
  history.unshift(entry);
  // FIFO: keep only the latest 20
  const trimmed = history.slice(0, MAX_ENTRIES);
  await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
}

export async function deleteHistoryEntry(id: string): Promise<void> {
  const history = await getHistory();
  const filtered = history.filter((e) => e.id !== id);
  await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(filtered));
}
