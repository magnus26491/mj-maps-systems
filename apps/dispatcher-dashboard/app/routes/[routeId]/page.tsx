'use client';
import { useQuery } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { api } from '../../../lib/api';
import Sidebar from '../../../components/Sidebar';
import StopList from '../../../components/StopList';
import AlertBadge from '../../../components/AlertBadge';
import { ArrowLeft, RefreshCw } from 'lucide-react';

export default function RouteDetailPage() {
  const { routeId } = useParams<{ routeId: string }>();
  const router = useRouter();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['route', routeId],
    queryFn:  () => api.routeDetail(routeId),
    refetchInterval: 20_000,
  });

  const { data: alertsData } = useQuery({
    queryKey: ['alerts', routeId],
    queryFn:  () => api.alerts(routeId),
    enabled:  !!routeId,
  });

  const route = data?.data?.route;
  const stops = data?.data?.stops ?? [];
  const alerts = alertsData?.data?.events ?? [];

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="ml-56 flex-1 p-6">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => router.back()}
            className="rounded-lg bg-gray-800 hover:bg-gray-700 p-2 transition">
            <ArrowLeft size={16} />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-bold">Route {routeId?.slice(0, 16)}…</h1>
            {route && route[0] && (
              <p className="text-sm text-gray-400">
                {route[0].driverName} · {route[0].vehicleMake} {route[0].vehicleModel}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={() => refetch()}
              className="flex items-center gap-2 rounded-lg bg-gray-800 hover:bg-gray-700 px-3 py-2 text-sm transition">
              <RefreshCw size={14} />Refresh
            </button>
            <button
              onClick={() => api.replan(routeId, { driverId: route?.[0]?.driver_id, lat: 51.5, lng: -0.1, nowEpoch: Math.floor(Date.now()/1000) })}
              className="flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-500 px-3 py-2 text-sm font-medium transition">
              Replan
            </button>
          </div>
        </div>

        {alertsData?.data?.summary && (
          <div className="flex gap-3 mb-6">
            <AlertBadge level="red"   count={alertsData.data.summary.red}     label="DO NOT ENTER" />
            <AlertBadge level="amber" count={alertsData.data.summary.amber}   label="Caution" />
            <AlertBadge level="blue" count={alertsData.data.summary.blue}     label="Info" />
          </div>
        )}

        {isLoading
          ? <div className="h-96 rounded-xl bg-gray-800 animate-pulse" />
          : <StopList stops={stops} routeId={routeId} alerts={alerts} />
        }
      </main>
    </div>
  );
}