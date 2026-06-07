'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import Sidebar from '../../components/Sidebar';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';

export default function AnalyticsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['analytics-today'],
    queryFn:  api.analyticsToday,
    refetchInterval: 60_000,
  });

  const summary = data?.data?.summary;
  const byHour  = data?.data?.byHour ?? [];
  const byVehicle = data?.data?.byVehicle ?? [];

  const statCards = summary && summary[0] ? [
    { label: 'Delivered',    value: summary[0].delivered,         colour: 'text-green-400' },
    { label: 'Failed',       value: summary[0].failed,             colour: 'text-red-400' },
    { label: 'Pending',      value: summary[0].pending,           colour: 'text-gray-300' },
    { label: 'Success rate', value: `${summary[0].successRatePct ?? 0}%`, colour: 'text-blue-400' },
  ] : [];

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="ml-56 flex-1 p-6">
        <h1 className="text-xl font-bold mb-6">Today's Analytics</h1>

        {isLoading && <div className="h-64 rounded-xl bg-gray-800 animate-pulse" />}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {statCards.map(s => (
            <div key={s.label} className="rounded-xl bg-gray-900 border border-gray-800 p-4">
              <p className="text-xs text-gray-400 mb-1">{s.label}</p>
              <p className={`text-3xl font-bold ${s.colour}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {byHour.length > 0 && (
          <div className="rounded-xl bg-gray-900 border border-gray-800 p-4 mb-6">
            <h2 className="text-sm font-semibold mb-4 text-gray-300">Deliveries by Hour</h2>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={byHour} margin={{ top: 0, right: 8, left: -16, bottom: 0 }}>
                <XAxis dataKey="hour" stroke="#6b7280" tick={{ fontSize: 11 }}
                  tickFormatter={h => `${h}:00`} />
                <YAxis stroke="#6b7280" tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }} />
                <Legend />
                <Bar dataKey="delivered" fill="#22c55e" name="Delivered" />
                <Bar dataKey="failed"    fill="#ef4444" name="Failed" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {byVehicle.length > 0 && (
          <div className="rounded-xl bg-gray-900 border border-gray-800 p-4">
            <h2 className="text-sm font-semibold mb-4 text-gray-300">By Vehicle Type</h2>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={byVehicle} layout="vertical" margin={{ top: 0, right: 8, left: 40, bottom: 0 }}>
                <XAxis type="number" stroke="#6b7280" tick={{ fontSize: 11 }} />
                <YAxis dataKey="vehicleId" type="category" stroke="#6b7280" tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }} />
                <Legend />
                <Bar dataKey="delivered" fill="#22c55e" name="Delivered" />
                <Bar dataKey="failed"    fill="#ef4444" name="Failed" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </main>
    </div>
  );
}