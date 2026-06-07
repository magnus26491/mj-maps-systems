'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import Sidebar from '../../components/Sidebar';
import { Truck, CheckCircle2, XCircle } from 'lucide-react';

export default function DriversPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['drivers'],
    queryFn:  api.drivers,
    refetchInterval: 30_000,
  });

  const drivers = data?.data ?? [];

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="ml-56 flex-1 p-6">
        <h1 className="text-xl font-bold mb-6">Driver Roster</h1>
        {isLoading && <div className="h-64 rounded-xl bg-gray-800 animate-pulse" />}
        <div className="rounded-xl border border-gray-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-900 border-b border-gray-800 text-gray-400 text-xs uppercase tracking-wide">
                <th className="px-4 py-3 text-left">Driver</th>
                <th className="px-4 py-3 text-left">Vehicle</th>
                <th className="px-4 py-3 text-left">Height</th>
                <th className="px-4 py-3 text-left">GVW</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Today</th>
              </tr>
            </thead>
            <tbody>
              {drivers.map((d: any) => (
                <tr key={d.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition">
                  <td className="px-4 py-3 font-medium">{d.name}</td>
                  <td className="px-4 py-3 text-gray-300 flex items-center gap-2">
                    <Truck size={13} className="text-gray-500" />
                    {[d.vehicleMake, d.vehicleModel].filter(Boolean).join(' ') || '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-400">
                    {d.vehicleHeightM ? `${d.vehicleHeightM}m` : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-400">
                    {d.vehicleGvwKg ? `${(d.vehicleGvwKg/1000).toFixed(1)}t` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      d.todayStatus === 'active' ? 'bg-green-900/50 text-green-300' :
                      d.todayStatus === 'offline' ? 'bg-gray-800 text-gray-400' :
                      'bg-blue-900/50 text-blue-300'
                    }`}>
                      {d.todayStatus}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-3 text-xs">
                      <span className="flex items-center gap-1 text-green-400"><CheckCircle2 size={11}/>{d.deliveredToday}</span>
                      <span className="flex items-center gap-1 text-red-400"><XCircle size={11}/>{d.failedToday}</span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}