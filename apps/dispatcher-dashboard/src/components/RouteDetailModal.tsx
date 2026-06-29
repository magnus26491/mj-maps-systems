import { useEffect, useState } from 'react';
import { getAnalyticsRoute } from '../api';
import type { RouteAnalyticsSummary, StopAnalyticsRow } from '../types';

interface Props {
  routeId: string | null;
  onClose: () => void;
}

export default function RouteDetailModal({ routeId, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [routeData, setRouteData] = useState<{ route: RouteAnalyticsSummary; stops: StopAnalyticsRow[] } | null>(null);

  useEffect(() => {
    if (!routeId) {
      setRouteData(null);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    setRouteData(null);

    getAnalyticsRoute(routeId)
      .then(data => {
        // Guard: backend must return ok=true
        if (!data || typeof data !== 'object' || !('route' in data) || !('stops' in data)) {
          throw new Error('Invalid response from analytics API.');
        }
        setRouteData(data as { route: RouteAnalyticsSummary; stops: StopAnalyticsRow[] });
        setLoading(false);
      })
      .catch(err => {
        setError(err instanceof Error ? err.message : 'Failed to load route details.');
        setLoading(false);
      });
  }, [routeId]);

  if (!routeId) return null;

  return (
    <div className="modal-overlay" style={{ zIndex: 1010 }} onClick={onClose}>
      <div className="modal-box modal-box-lg" style={{ maxWidth: 800 }} onClick={e => e.stopPropagation()}>
        <button onClick={onClose} style={closeBtn}>&times;</button>

        <h2 style={titleStyle}>
          Route Detail — {routeData?.route.driverName ?? 'Unknown'}
        </h2>

        {loading && (
          <div style={centerStyle}>
            <div style={spinnerStyle} />
            <span style={{ color: '#94a3b8', marginTop: '0.5rem' }}>Loading...</span>
          </div>
        )}

        {error && (
          <div style={errorBoxStyle}>{error}</div>
        )}

        {routeData && (
          <div>
            {/* Summary row — 2 cols on mobile, 4 cols on wider screens */}
            <div className="driver-summary-grid">
              <div>
                <div style={{ color: '#64748b', fontSize: '0.75rem' }}>Vehicle</div>
                <div style={{ color: '#f1f5f9', fontSize: '0.875rem' }}>{routeData.route.vehicleLabel ?? '—'}</div>
              </div>
              <div>
                <div style={{ color: '#64748b', fontSize: '0.75rem' }}>Distance</div>
                <div style={{ color: '#f1f5f9', fontSize: '0.875rem' }}>{routeData.route.totalDistanceKm?.toFixed(1) ?? '—'} km</div>
              </div>
              <div>
                <div style={{ color: '#64748b', fontSize: '0.75rem' }}>Shift</div>
                <div style={{ color: '#f1f5f9', fontSize: '0.875rem' }}>
                  {routeData.route.shiftStart
                    ? new Date(routeData.route.shiftStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    : '—'}
                  {routeData.route.finishedAt
                    ? ` → ${new Date(routeData.route.finishedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                    : ''}
                </div>
              </div>
              <div>
                <div style={{ color: '#64748b', fontSize: '0.75rem' }}>On Time</div>
                <div style={{
                  color: routeData.route.onTime === true ? '#22c55e'
                    : routeData.route.onTime === false ? '#ef4444'
                    : '#64748b',
                  fontSize: '0.875rem', fontWeight: 600,
                }}>
                  {routeData.route.onTime === true ? '✓ On time'
                    : routeData.route.onTime === false ? '✗ Late'
                    : '—'}
                </div>
              </div>
            </div>

            {/* Stop list */}
            <div className="table-scroll" style={{ maxHeight: '60vh' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem', color: '#f1f5f9' }}>
                <thead>
                  <tr style={{ background: '#1e293b', color: '#94a3b8' }}>
                    <th style={thStyle}>Address</th>
                    <th style={thStyle}>Status</th>
                    <th style={thStyle}>Alert</th>
                    <th style={thStyle}>POD</th>
                    <th style={thStyle}>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {routeData.stops.map(stop => (
                    <tr key={stop.stopId} style={{ borderBottom: '1px solid #1e293b' }}>
                      <td style={tdStyle}>{stop.address}</td>
                      <td style={tdStyle}>
                        <span style={{
                          display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                          background: stop.status === 'delivered' ? '#22c55e'
                            : stop.status === 'failed' ? '#ef4444'
                            : '#f59e0b',
                          marginRight: '0.375rem',
                        }} />
                        {stop.status}
                      </td>
                      <td style={tdStyle}>
                        {stop.turnAlertLevel === 'RED' ? '🔴'
                          : stop.turnAlertLevel === 'AMBER' ? '🟡'
                          : '—'}
                      </td>
                      <td style={tdStyle}>{stop.hasPod ? '📷' : '—'}</td>
                      <td style={tdStyle}>
                        {stop.createdAt
                          ? new Date(stop.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// overlayStyle and modalStyle replaced by CSS classes — see globals.css .modal-overlay / .modal-box

const closeBtn: React.CSSProperties = {
  position: 'absolute', top: 12, right: 16, background: 'transparent', border: 'none',
  color: '#94a3b8', fontSize: '1.5rem', cursor: 'pointer', lineHeight: 1,
};

const titleStyle: React.CSSProperties = {
  color: '#f1f5f9', fontSize: '1.125rem', fontWeight: 600, margin: '0 0 1rem',
};

const centerStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '2rem 0',
};

const spinnerStyle: React.CSSProperties = {
  width: 32, height: 32, border: '3px solid #1e293b', borderTop: '3px solid #3b82f6',
  borderRadius: '50%', animation: 'spin 1s linear infinite',
};

const errorBoxStyle: React.CSSProperties = {
  background: '#1e293b', border: '1px solid #ef4444', borderRadius: 8,
  padding: '1rem', color: '#ef4444', textAlign: 'center',
};

const thStyle: React.CSSProperties = { padding: '0.5rem', textAlign: 'left', fontWeight: 600 };
const tdStyle: React.CSSProperties = { padding: '0.5rem', verticalAlign: 'middle' };