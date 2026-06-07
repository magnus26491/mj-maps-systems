'use client';
import { useState } from 'react';
import { XCircle, ArrowRight } from 'lucide-react';

const CODE_COLOUR: Record<string, string> = {
  ACCESS_DENIED: 'text-red-400',
  NO_ANSWER:     'text-amber-400',
  SAFE_PLACE:    'text-green-400',
  NEIGHBOUR:     'text-blue-400',
};

interface Props {
  stop: any;
  availableRoutes: any[];
  onReassign: (targetRouteId: string) => void;
}

export default function FailedStopRow({ stop, availableRoutes, onReassign }: Props) {
  const [reassigning, setReassigning] = useState(false);
  const [target, setTarget] = useState('');

  const otherRoutes = availableRoutes.filter((r: any) => r.routeId !== stop.routeId);
  const colour = CODE_COLOUR[stop.failureCode] ?? 'text-gray-400';

  return (
    <div className="flex items-center gap-4 px-4 py-3 border-b border-gray-800 hover:bg-gray-800/30 transition">
      <XCircle size={16} className={colour} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{stop.address}</p>
        <p className="text-xs text-gray-400">
          {stop.driverName} · <span className={colour}>{stop.failureCode}</span>
          {stop.accessNotes && <> · {stop.accessNotes}</>}
        </p>
      </div>

      {reassigning ? (
        <div className="flex items-center gap-2">
          <select value={target} onChange={e => setTarget(e.target.value)}
            className="rounded bg-gray-800 border border-gray-700 px-2 py-1.5 text-xs focus:outline-none">
            <option value="">Select driver…</option>
            {otherRoutes.map((r: any) => (
              <option key={r.routeId} value={r.routeId}>
                {r.driverName} ({r.pendingStops} stops left)
              </option>
            ))}
          </select>
          <button disabled={!target} onClick={() => { onReassign(target); setReassigning(false); }}
            className="rounded bg-blue-600 hover:bg-blue-500 px-3 py-1.5 text-xs font-medium disabled:opacity-50 flex items-center gap-1 transition">
            <ArrowRight size={12} />Move
          </button>
          <button onClick={() => setReassigning(false)}
            className="rounded bg-gray-700 hover:bg-gray-600 px-3 py-1.5 text-xs transition">
            Cancel
          </button>
        </div>
      ) : (
        <button onClick={() => setReassigning(true)}
          className="rounded bg-gray-800 hover:bg-gray-700 px-3 py-1.5 text-xs transition">
          Reassign
        </button>
      )}
    </div>
  );
}