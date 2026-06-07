'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import Sidebar from '../components/Sidebar';
import DriverCard from '../components/DriverCard';
import { RefreshCw } from 'lucide-react';

export default function OverviewPage() {
  const { data, isLoading, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['overview'],
    queryFn:  () => api.overview(),
    refetchInterval: 30_000,
  });

  const routes = data?.data ?? [];
  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : '—';

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="ml-56 flex-1 p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold">Live Overview</h1>
            <p className="text-sm text-gray-400">Updated {lastUpdated} · auto-refreshes every 30s</p>
          </div>
          <button onClick={() => refetch()}
            className="flex items-center gap-2 rounded-lg bg-gray-800 hover:bg-gray-700 px-3 py-2 text-sm transition">
            <RefreshCw size={14} />Refresh
          </button>
        </div>

        {isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-40 rounded-xl bg-gray-800 animate-pulse" />
            ))}
          </div>
        )}

        {!isLoading && routes.length === 0 && (
          <div className="rounded-xl border border-dashed border-gray-700 p-12 text-center text-gray-500">
            No active routes today
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {routes.map((route: any) => (
            <DriverCard key={route.routeId} route={route} />
          ))}
        </div>
      </main>
    </div>
  );
}