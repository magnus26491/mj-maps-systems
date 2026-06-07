'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../lib/api';
import Sidebar from '../../components/Sidebar';
import { PlusCircle, Loader2 } from 'lucide-react';

export default function CreateRoutePage() {
  const router = useRouter();
  const [addresses, setAddresses] = useState('');
  const [vehicleId, setVehicleId] = useState('swb_van');
  const [depotLat, setDepotLat] = useState('51.5074');
  const [depotLng, setDepotLng] = useState('-0.1278');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<any>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const lines = addresses.split('\n').map(l => l.trim()).filter(Boolean);
      const stops = lines.map((addr, i) => ({
        id:    `stop-${i+1}`,
        lat:   51.5 + (Math.random() - 0.5) * 0.1,
        lng:   -0.1 + (Math.random() - 0.5) * 0.1,
        notes: addr,
      }));
      const res = await api.optimise({
        stops,
        config: {
          vehicleId,
          depotLat: parseFloat(depotLat),
          depotLng: parseFloat(depotLng),
          returnToDepot: true,
          shiftStartEpoch: Math.floor(Date.now() / 1000),
        },
      }) as { ok: boolean; data?: { routeId?: string; orderedStops?: unknown[] } };
      setResult(res);
      const routeId = res.data?.routeId;
      if (routeId) {
        setTimeout(() => router.push(`/routes/${routeId}`), 1500);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="ml-56 flex-1 p-6 max-w-2xl">
        <h1 className="text-xl font-bold mb-6">Create New Route</h1>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Delivery addresses (one per line)</label>
            <textarea value={addresses} onChange={e => setAddresses(e.target.value)}
              rows={10} placeholder={"123 High Street, London\n45 Park Avenue, London\n…"}
              className="w-full rounded-lg bg-gray-900 border border-gray-700 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none font-mono" />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Vehicle type</label>
              <select value={vehicleId} onChange={e => setVehicleId(e.target.value)}
                className="w-full rounded-lg bg-gray-900 border border-gray-700 px-3 py-2.5 text-sm focus:outline-none">
                {['small_van','swb_van','lwb_van','luton','rigid_7.5t','rigid_18t','artic'].map(v => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Depot lat</label>
              <input value={depotLat} onChange={e => setDepotLat(e.target.value)}
                className="w-full rounded-lg bg-gray-900 border border-gray-700 px-3 py-2.5 text-sm focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Depot lng</label>
              <input value={depotLng} onChange={e => setDepotLng(e.target.value)}
                className="w-full rounded-lg bg-gray-900 border border-gray-700 px-3 py-2.5 text-sm focus:outline-none" />
            </div>
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          {result && (
            <div className="rounded-lg bg-green-900/30 border border-green-800 p-3 text-sm text-green-300">
              ✅ Route created — {result.data?.orderedStops?.length ?? 0} stops optimised. Redirecting…
            </div>
          )}
          <button type="submit" disabled={loading || !addresses.trim()}
            className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-500 py-3 text-sm font-semibold transition disabled:opacity-50">
            {loading ? <Loader2 size={16} className="animate-spin" /> : <PlusCircle size={16} />}
            {loading ? 'Optimising…' : 'Optimise & Create Route'}
          </button>
        </form>
      </main>
    </div>
  );
}