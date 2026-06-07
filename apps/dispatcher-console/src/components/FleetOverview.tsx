'use client';

import { Truck, AlertTriangle, CheckCircle2, XCircle, Route, Activity } from 'lucide-react';
import type { FleetStats } from '@/types';

interface KpiCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  accent?: 'default' | 'red' | 'amber' | 'green';
}

function KpiCard({ icon, label, value, sub, accent = 'default' }: KpiCardProps) {
  const accentClass = {
    default: 'border-zinc-700/50',
    red:     'border-red-500/40 bg-red-950/20',
    amber:   'border-yellow-500/40 bg-yellow-950/20',
    green:   'border-emerald-500/40 bg-emerald-950/20',
  }[accent];

  const valueClass = {
    default: 'text-white',
    red:     'text-red-400',
    amber:   'text-yellow-400',
    green:   'text-emerald-400',
  }[accent];

  return (
    <div className={`rounded-xl border bg-zinc-900/60 p-4 flex flex-col gap-2 ${accentClass}`}>
      <div className="flex items-center justify-between">
        <span className="text-zinc-400 text-xs font-medium uppercase tracking-wider">{label}</span>
        <span className="text-zinc-500">{icon}</span>
      </div>
      <div className={`text-3xl font-bold tabular-nums ${valueClass}`}>{value}</div>
      {sub && <div className="text-xs text-zinc-500">{sub}</div>}
    </div>
  );
}

export function FleetOverview({ stats, isLoading }: { stats: FleetStats | null; isLoading: boolean }) {
  if (isLoading || !stats) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 h-24 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
      <KpiCard
        icon={<Truck size={16} />}
        label="Active Routes"
        value={stats.activeRoutes}
        sub={`${stats.totalDrivers} drivers`}
      />
      <KpiCard
        icon={<AlertTriangle size={16} />}
        label="RED Alerts"
        value={stats.redAlerts}
        accent={stats.redAlerts > 0 ? 'red' : 'default'}
        sub="Turn warnings"
      />
      <KpiCard
        icon={<AlertTriangle size={16} />}
        label="AMBER Alerts"
        value={stats.amberAlerts}
        accent={stats.amberAlerts > 0 ? 'amber' : 'default'}
        sub="Tight roads"
      />
      <KpiCard
        icon={<CheckCircle2 size={16} />}
        label="Completed"
        value={stats.completedStopsToday}
        accent="green"
        sub="Stops today"
      />
      <KpiCard
        icon={<XCircle size={16} />}
        label="Failed"
        value={stats.failedStopsToday}
        accent={stats.failedStopsToday > 0 ? 'red' : 'default'}
        sub="Stops today"
      />
      <KpiCard
        icon={<Route size={16} />}
        label="Distance"
        value={`${stats.totalDistanceKmToday.toFixed(0)}km`}
        sub="Fleet today"
      />
    </div>
  );
}
