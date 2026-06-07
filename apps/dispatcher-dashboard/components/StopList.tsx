'use client';
import { useState } from 'react';
import { clsx } from 'clsx';
import { CheckCircle2, XCircle, Clock, ChevronDown, ChevronUp, Edit2 } from 'lucide-react';
import { api } from '../lib/api';

interface Stop {
  id: string; sequence: number; address: string; status: string;
  failureCode?: string; accessNotes?: string; last50m?: string;
  podPhotoUrl?: string; pinLat?: number; pinLon?: number;
}

interface Props { stops: Stop[]; routeId: string; alerts: any[] }

const STATUS_ICON: Record<string, React.ReactNode> = {
  completed: <CheckCircle2 size={14} className="text-green-400" />,
  failed:    <XCircle size={14} className="text-red-400" />,
  pending:   <Clock size={14} className="text-gray-400" />,
};

export default function StopList({ stops, routeId, alerts }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState('');

  async function saveNotes(stopId: string) {
    await api.updateStopNotes(stopId, { accessNotes: notesDraft });
    setEditing(null);
  }

  return (
    <div className="rounded-xl border border-gray-800 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-900 border-b border-gray-800 text-gray-400 text-xs uppercase tracking-wide">
            <th className="px-4 py-3 text-left w-8">#</th>
            <th className="px-4 py-3 text-left">Address</th>
            <th className="px-4 py-3 text-left w-28">Status</th>
            <th className="px-4 py-3 text-left w-28">Failure</th>
            <th className="px-4 py-3 w-8" />
          </tr>
        </thead>
        <tbody>
          {stops.map((stop) => (
            <>
              <tr key={stop.id}
                className="border-b border-gray-800/50 hover:bg-gray-800/40 transition cursor-pointer"
                onClick={() => setExpanded(expanded === stop.id ? null : stop.id)}>
                <td className="px-4 py-3 text-gray-500">{stop.sequence}</td>
                <td className="px-4 py-3 font-medium">{stop.address}</td>
                <td className="px-4 py-3">
                  <span className="flex items-center gap-1.5 capitalize">
                    {STATUS_ICON[stop.status] ?? null}
                    {stop.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-red-400 text-xs">{stop.failureCode ?? '—'}</td>
                <td className="px-4 py-3 text-gray-500">
                  {expanded === stop.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </td>
              </tr>
              {expanded === stop.id && (
                <tr key={`${stop.id}-detail`} className="bg-gray-900/60 border-b border-gray-800">
                  <td colSpan={5} className="px-6 py-4">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Access Notes</p>
                        {editing === stop.id ? (
                          <div className="flex gap-2">
                            <input value={notesDraft} onChange={e => setNotesDraft(e.target.value)}
                              className="flex-1 rounded bg-gray-800 border border-gray-700 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                            <button onClick={() => saveNotes(stop.id)}
                              className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium hover:bg-blue-500">Save</button>
                            <button onClick={() => setEditing(null)}
                              className="rounded bg-gray-700 px-3 py-1.5 text-xs hover:bg-gray-600">Cancel</button>
                          </div>
                        ) : (
                          <p className="text-gray-300 flex items-center gap-2">
                            {stop.accessNotes ?? <span className="text-gray-500 italic">None set</span>}
                            <button onClick={() => { setEditing(stop.id); setNotesDraft(stop.accessNotes ?? ''); }}
                              className="text-gray-500 hover:text-blue-400 transition">
                              <Edit2 size={12} />
                            </button>
                          </p>
                        )}
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Last 50m brief</p>
                        <p className="text-gray-300">{stop.last50m ?? <span className="text-gray-500 italic">None set</span>}</p>
                      </div>
                      {stop.podPhotoUrl && (
                        <div className="col-span-2">
                          <p className="text-xs text-gray-500 mb-1">POD Photo</p>
                          <img src={stop.podPhotoUrl} alt="POD" className="h-32 rounded-lg object-cover border border-gray-700" />
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </>
          ))}
        </tbody>
      </table>
    </div>
  );
}