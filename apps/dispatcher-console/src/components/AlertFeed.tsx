'use client';

import { formatDistanceToNow } from 'date-fns';
import { X, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import clsx from 'clsx';
import type { LiveAlert } from '@/types';

interface AlertFeedProps {
  alerts: LiveAlert[];
  connected: boolean;
  onDismiss: (alertId: string) => void;
  onReplan?: (routeId: string) => void;
}

export function AlertFeed({ alerts, connected, onDismiss, onReplan }: AlertFeedProps) {
  const visible = alerts.filter((a) => !a.dismissed).slice(0, 20);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-200">Live Alerts</h2>
        <div className="flex items-center gap-2">
          {connected
            ? <span className="flex items-center gap-1 text-emerald-400 text-xs"><Wifi size={12} /> Live</span>
            : <span className="flex items-center gap-1 text-red-400 text-xs"><WifiOff size={12} /> Offline</span>
          }
        </div>
      </div>

      {/* Feed */}
      <div className="flex-1 overflow-y-auto">
        {visible.length === 0 && (
          <div className="flex flex-col items-center justify-center h-32 text-zinc-600 text-sm">
            <span>No active alerts</span>
          </div>
        )}

        {visible.map((alert) => (
          <div
            key={alert.alertId}
            className={clsx(
              'border-b border-zinc-800/60 px-4 py-3 animate-slide-in',
              alert.level === 'RED'   && 'bg-red-950/30 border-l-2 border-l-red-500',
              alert.level === 'AMBER' && 'bg-yellow-950/20 border-l-2 border-l-yellow-500',
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-base flex-shrink-0">
                  {alert.level === 'RED' ? '🔴' : '🟡'}
                </span>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-zinc-200 truncate">
                    {alert.driverName} — {alert.vehicleLabel}
                  </div>
                  <div className="text-xs text-zinc-400 truncate">{alert.stopAddress}</div>
                </div>
              </div>
              <button
                onClick={() => onDismiss(alert.alertId)}
                className="flex-shrink-0 text-zinc-600 hover:text-zinc-300 transition-colors p-3 -mr-3 -mt-1"
                aria-label="Dismiss alert"
              >
                <X size={14} />
              </button>
            </div>

            <p className="text-xs text-zinc-400 mt-2 leading-relaxed">{alert.instruction}</p>

            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-zinc-600">
                {formatDistanceToNow(new Date(alert.ts), { addSuffix: true })}
              </span>
              {alert.level === 'RED' && onReplan && (
                <button
                  onClick={() => onReplan(alert.routeId)}
                  className="flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300 transition-colors font-medium"
                >
                  <RefreshCw size={11} />
                  Replan route
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
