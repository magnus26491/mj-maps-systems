'use client';
import Link from 'next/link';
import { clsx } from 'clsx';
import { Truck, CheckCircle2, XCircle, Clock } from 'lucide-react';

interface Props {
  route: {
    driverId: string;
    driverName: string;
    vehicleMake: string | null;
    vehicleModel: string | null;
    routeId: string;
    totalStops: number;
    completedStops: number;
    failedStops: number;
    pendingStops: number;
    lastPing: string | null;
  };
}

export default function DriverCard({ route }: Props) {
  const pct = route.totalStops > 0
    ? Math.round((Number(route.completedStops) / Number(route.totalStops)) * 100)
    : 0;

  const vehicle = [route.vehicleMake, route.vehicleModel].filter(Boolean).join(' ') || 'Unknown vehicle';
  const lastSeen = route.lastPing
    ? new Date(route.lastPing).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : 'No updates yet';

  return (
    <Link href={`/routes/${route.routeId}`}
      className="block rounded-xl bg-gray-900 border border-gray-800 hover:border-blue-600/50 p-4 transition group">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="font-semibold text-sm">{route.driverName}</p>
          <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
            <Truck size={11} />{vehicle}
          </p>
        </div>
        {Number(route.failedStops) > 0 && (
          <span className="rounded-full bg-red-900/60 px-2 py-0.5 text-xs font-medium text-red-300">
            {route.failedStops} failed
          </span>
        )}
      </div>

      <div className="mb-3">
        <div className="flex justify-between text-xs text-gray-400 mb-1">
          <span>{route.completedStops}/{route.totalStops} stops</span>
          <span>{pct}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-gray-700">
          <div
            className={clsx('h-1.5 rounded-full transition-all',
              pct === 100 ? 'bg-green-500' : 'bg-blue-500')}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="flex gap-3 text-xs text-gray-400">
        <span className="flex items-center gap-1"><CheckCircle2 size={11} className="text-green-400" />{route.completedStops}</span>
        <span className="flex items-center gap-1"><XCircle size={11} className="text-red-400" />{route.failedStops}</span>
        <span className="flex items-center gap-1"><Clock size={11} />{route.pendingStops} pending</span>
      </div>

      <p className="mt-2 text-xs text-gray-500">Last activity: {lastSeen}</p>
    </Link>
  );
}