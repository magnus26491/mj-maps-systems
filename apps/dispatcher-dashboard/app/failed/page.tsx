'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import Sidebar from '../../components/Sidebar';
import FailedStopRow from '../../components/FailedStopRow';

export default function FailedStopsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['failed-stops'],
    queryFn:  api.failedStops,
    refetchInterval: 30_000,
  });

  const { data: allRoutes } = useQuery({
    queryKey: ['overview'],
    queryFn:  api.overview,
  });

  const stops = data?.data ?? [];
  const routes = allRoutes?.data ?? [];

  async function handleReassign(stopId: string, fromRouteId: string, targetRouteId: string) {
    await api.reassignStop(fromRouteId, stopId, targetRouteId);
    qc.invalidateQueries({ queryKey: ['failed-stops'] });
    qc.invalidateQueries({ queryKey: ['overview'] });
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="ml-56 flex-1 p-6">
        <div className="mb-6">
          <h1 className="text-xl font-bold">Failed Stops</h1>
          <p className="text-sm text-gray-400">
            Today's delivery failures — {stops.length} requiring action
          </p>
        </div>

        {isLoading && <div className="h-64 rounded-xl bg-gray-800 animate-pulse" />}

        {!isLoading && stops.length === 0 && (
          <div className="rounded-xl border border-dashed border-gray-700 p-12 text-center text-gray-500">
            No failed stops today 🎉
          </div>
        )}

        <div className="rounded-xl border border-gray-800 overflow-hidden">
          {stops.map((stop: any) => (
            <FailedStopRow
              key={stop.stopId}
              stop={stop}
              availableRoutes={routes}
              onReassign={(targetRouteId) => handleReassign(stop.stopId, stop.routeId, targetRouteId)}
            />
          ))}
        </div>
      </main>
    </div>
  );
}