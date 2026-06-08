import useSWR from 'swr';
import { getRoutes } from '../api';
import type { Route } from '../types';

export function useRoutes() {
  const { data, error } = useSWR<Route[]>('/api/dispatcher/routes', getRoutes, {
    refreshInterval: 15_000,
    revalidateOnFocus: false,
  });
  return { routes: data ?? [], isLoading: !error && !data, error };
}
