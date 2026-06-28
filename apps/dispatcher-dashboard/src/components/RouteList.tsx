import { useState } from 'react';
import type { Route } from '../types';
import PodModal from './PodModal';
import MessageDriverModal from './MessageDriverModal';
import { forceCompleteRoute } from '../api';

interface Props {
  routes: Route[];
  isLoading: boolean;
  onAssign: (routeId: string) => void;
  onComplete?: (routeId: string) => void;
}

export default function RouteList({ routes, isLoading, onAssign, onComplete }: Props) {
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  const [expandedRoutes, setExpandedRoutes] = useState<Set<string>>(new Set());
  const [completingRouteId, setCompletingRouteId] = useState<string | null>(null);
  const [messageModalRoute, setMessageModalRoute] = useState<Route | null>(null);

  if (isLoading) return <div style={{ color: '#64748b' }}>Loading routes...</div>;
  if (routes.length === 0) return <div style={{ color: '#64748b' }}>No active routes.</div>;

  function toggleRoute(routeId: string) {
    setExpandedRoutes(prev => {
      const next = new Set(prev);
      if (next.has(routeId)) next.delete(routeId); else next.add(routeId);
      return next;
    });
  }

  function handleComplete(routeId: string) {
    setCompletingRouteId(routeId);
    forceCompleteRoute(routeId)
      .then(() => { onComplete?.(routeId); })
      .catch(err => { console.error('[RouteList] forceCompleteRoute failed:', err); })
      .finally(() => { setCompletingRouteId(null); });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {routes.map(route => {
        const pct = route.totalStops > 0
          ? Math.round((route.completedStops / route.totalStops) * 100)
          : 0;
        const expanded = expandedRoutes.has(route.routeId);

        return (
          <div key={route.routeId} style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, overflow: 'hidden' }}>
            {/* Route row */}
            <div style={{ display: 'flex', alignItems: 'center', padding: '0.75rem 1rem', gap: '1rem' }}>
              <span style={{ color: '#94a3b8', fontSize: '0.75rem', cursor: 'pointer', minWidth: 20 }}
                onClick={() => toggleRoute(route.routeId)}>
                {expanded ? '▼' : '▶'}
              </span>
              <div style={{ flex: 1 }}>
                <span style={{ color: '#f1f5f9', fontWeight: 600 }}>{route.driverName ?? 'Unassigned'}</span>
                <span style={{ color: '#64748b', marginLeft: '0.5rem', fontSize: '0.875rem' }}>{route.vehicleLabel}</span>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ background: '#1e293b', borderRadius: 4, height: 8, flex: 1, maxWidth: 80 }}>
                    <div style={{ background: '#3b82f6', borderRadius: 4, height: 8, width: `${pct}%` }} />
                  </div>
                  <span style={{ color: '#64748b', fontSize: '0.75rem' }}>{pct}%</span>
                </div>
                <span style={{ color: '#64748b', fontSize: '0.75rem' }}>{route.completedStops}/{route.totalStops} stops</span>
              </div>
              <div style={{ color: '#64748b', fontSize: '0.875rem' }}>
                {route.estimatedCompletion
                  ? new Date(route.estimatedCompletion).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  : '—'}
              </div>
              {route.status === 'active' && (
                <button
                  onClick={() => handleComplete(route.routeId)}
                  disabled={completingRouteId === route.routeId}
                  style={{
                    background: 'transparent',
                    border: '1px solid #22c55e',
                    color: '#22c55e',
                    borderRadius: 6,
                    padding: '0.25rem 0.5rem',
                    fontSize: '0.75rem',
                    cursor: completingRouteId === route.routeId ? 'not-allowed' : 'pointer',
                    marginLeft: '0.5rem',
                    opacity: completingRouteId === route.routeId ? 0.5 : 1,
                  }}
                >
                  {completingRouteId === route.routeId ? 'Completing...' : '✓ Complete'}
                </button>
              )}
              {route.status === 'active' && (
                <button
                  onClick={() => setMessageModalRoute(route)}
                  style={{
                    background: '#0f1e30', border: '1px solid #00C2A840',
                    color: '#00C2A8', borderRadius: 6,
                    padding: '0.25rem 0.5rem', fontSize: '0.75rem', cursor: 'pointer',
                    marginLeft: '0.25rem',
                  }}
                >
                  Message
                </button>
              )}
              <button
                onClick={() => onAssign(route.routeId)}
                style={{
                  background: '#1e3a5f', border: '1px solid #3b82f6', borderRadius: 4,
                  color: '#3b82f6', fontSize: '0.75rem', padding: '0.25rem 0.5rem', cursor: 'pointer',
                }}
              >
                Assign →
              </button>
            </div>

            {/* Expanded stops section */}
            {expanded && route.stops.length > 0 && (
              <div style={{ borderTop: '1px solid #1e293b', background: '#0c1322', padding: '0.5rem 1rem 0.75rem' }}>
                <div style={{ color: '#64748b', fontSize: '0.75rem', marginBottom: '0.5rem' }}>Stops</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  {route.stops.map(stop => (
                    <div key={stop.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{
                        display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                        background: stop.status === 'delivered' ? '#22c55e' : stop.status === 'failed' ? '#ef4444' : '#f59e0b',
                      }} />
                      <span style={{ flex: 1, color: '#94a3b8', fontSize: '0.875rem' }}>{stop.address}</span>
                      {stop.podUrl && (
                        <button
                          onClick={() => setSelectedStopId(stop.id)}
                          style={{
                            background: 'transparent', border: 'none', cursor: 'pointer',
                            fontSize: '1rem', padding: '0 0.25rem', lineHeight: 1,
                          }}
                          title="View POD"
                        >
                          📷
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}

      <PodModal stopId={selectedStopId} onClose={() => setSelectedStopId(null)} />
      {messageModalRoute && (
        <MessageDriverModal
          prefillDriver={{
            driverId:   messageModalRoute.driverId,
            driverName: messageModalRoute.driverName ?? 'Driver',
            vehicleLabel: messageModalRoute.vehicleLabel,
            status:     'active',
          }}
          onClose={() => setMessageModalRoute(null)}
        />
      )}
    </div>
  );
}

