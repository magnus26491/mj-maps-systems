'use client';

import { formatDistanceToNow, format } from 'date-fns';
import { ChevronRight, Package, PackageCheck, AlertTriangle, Undo2 } from 'lucide-react';
import clsx from 'clsx';
import type { ActiveRoute, RouteStop } from '@/types';
import { StopStatusBadge, TurnAlertBadge } from './StopStatusBadge';

interface RoutePanelProps {
  route: ActiveRoute | null;
  onClose: () => void;
}

function StopRow({ stop, idx }: { stop: RouteStop; idx: number }) {
  return (
    <div className={clsx(
      'flex items-start gap-3 px-4 py-3 border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors',
      stop.status === 'failed' && 'bg-red-950/20',
    )}>
      {/* Sequence number */}
      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-xs text-zinc-400 font-mono mt-0.5">
        {idx + 1}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-zinc-200 font-medium truncate max-w-[200px]">
            {stop.address}
          </span>
          <StopStatusBadge status={stop.status} />
          {stop.isCollection && (
            <span className="text-xs bg-blue-900/50 text-blue-300 px-1.5 py-0.5 rounded-full">COLLECT</span>
          )}
        </div>

        <div className="flex items-center gap-3 mt-1">
          {/* ETA */}
          <span className="text-xs text-zinc-500">
            ETA {format(new Date(stop.eta), 'HH:mm')}
          </span>
          {/* Approach side */}
          <span className="text-xs text-zinc-600">
            {stop.approachSide === 'left' ? '◀ Left' : '▶ Right'}
          </span>
          {/* Distance */}
          <span className="text-xs text-zinc-600">
            {stop.cumulativeDistanceKm.toFixed(1)}km
          </span>
        </div>

        {/* Turn alert */}
        {stop.turnAlert && stop.turnAlert.level !== 'GREEN' && (
          <div className="mt-2 flex items-start gap-2">
            <TurnAlertBadge level={stop.turnAlert.level} score={stop.turnAlert.score} />
            <p className="text-xs text-zinc-500 leading-relaxed">{stop.turnAlert.instruction}</p>
          </div>
        )}

        {/* Last 50m */}
        {stop.pin.last50mInstruction && (
          <p className="text-xs text-zinc-600 mt-1 italic leading-relaxed">
            {stop.pin.last50mInstruction}
          </p>
        )}
      </div>
    </div>
  );
}

export function RoutePanel({ route, onClose }: RoutePanelProps) {
  if (!route) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-zinc-600 text-sm gap-2">
        <Package size={32} className="text-zinc-700" />
        <span>Select a route on the map</span>
      </div>
    );
  }

  const progress = route.totalStops > 0
    ? Math.round((route.completedStops / route.totalStops) * 100)
    : 0;

  const redStops = route.stops.filter(
    (s) => s.turnAlert?.level === 'RED' && s.status === 'pending'
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-zinc-200">{route.driverName}</div>
            <div className="text-xs text-zinc-500">{route.vehicleLabel}</div>
          </div>
          <button onClick={onClose} className="text-zinc-600 hover:text-zinc-300 transition-colors p-3 -mr-2 min-w-[44px] min-h-[44px] flex items-center justify-center">
            <ChevronRight size={18} />
          </button>
        </div>

        {/* Progress bar */}
        <div className="mt-3">
          <div className="flex justify-between text-xs text-zinc-500 mb-1">
            <span>{route.completedStops}/{route.totalStops} stops</span>
            <span>ETA done: {format(new Date(route.estimatedCompletion), 'HH:mm')}</span>
          </div>
          <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-brand-500 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Stat chips */}
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <span className="text-xs bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded-full">
            {route.totalDistanceKm.toFixed(1)}km total
          </span>
          {route.failedStops > 0 && (
            <span className="text-xs bg-red-900/60 text-red-300 px-2 py-0.5 rounded-full">
              {route.failedStops} failed
            </span>
          )}
          {redStops.length > 0 && (
            <span className="text-xs bg-red-900/60 text-red-300 px-2 py-0.5 rounded-full animate-pulse-fast">
              🔴 {redStops.length} turn warnings ahead
            </span>
          )}
        </div>
      </div>

      {/* Stop list */}
      <div className="flex-1 overflow-y-auto">
        {route.stops.map((stop, i) => (
          <StopRow key={stop.stopId} stop={stop} idx={i} />
        ))}
      </div>
    </div>
  );
}
