import useSWR from 'swr';
import { getStats } from '../api';
import type { Stats } from '../types';

export function useStats() {
  const { data, error } = useSWR<Stats>('/api/dispatcher/stats', getStats, {
    refreshInterval: 30_000,
    revalidateOnFocus: false,
  });
  return { stats: data, isLoading: !error && !data, error };
}
