import useSWR from 'swr';
import { getDrivers } from '../api';
import type { Driver } from '../types';

export function useDrivers() {
  const { data, error } = useSWR<Driver[]>('/api/dispatcher/drivers', getDrivers, {
    revalidateOnFocus: false,
  });
  return { drivers: data ?? [], isLoading: !error && !data, error };
}
