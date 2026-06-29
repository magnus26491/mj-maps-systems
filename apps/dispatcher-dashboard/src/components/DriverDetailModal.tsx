import { useEffect, useState } from 'react';
import { getDriver } from '../api';
import type { DriverDetail, DriverRouteRow } from '../types';

interface Props {
  driverId: string | null;
  onClose: () => void;
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  zIndex: 1000, padding: '1rem', overflowY: 'auto',
};

const modalStyle: React.CSSProperties = {
  background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12,
  padding: '1.5rem', width: '100%', maxWidth: 700, position: 'relative',
  maxHeight: '90vh', overflowY: 'auto',
};

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

const thStyle: React.CSSProperties = { padding: '0.5rem', textAlign: 'left', fontWeight: 600, color: '#94a3b8', fontSize: '0.75rem' };
const tdStyle: React.CSSProperties = { padding: '0.5rem', verticalAlign: 'middle' };

function statusBadgeStyle(status: string): React.CSSProperties {
  const isCompleted = status === 'completed';
  return {
    display: 'inline-block', padding: '0.125rem 0.5rem', borderRadius: 9999,
    fontSize: '0.75rem', fontWeight: 600,
    background: isCompleted ? '#14532d' : '#1e3a5f',
    color: isCompleted ? '#22c55e' : '#3b82f6',
    border: `1px solid ${isCompleted ? '#22c55e' : '#3b82f6'}`,
  };
}

export default function DriverDetailModal({ driverId, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [driverData, setDriverData] = useState<{ driver: DriverDetail; routes: DriverRouteRow[] } | null>(null);

  useEffect(() => {
    if (!driverId) {
      setDriverData(null);
      setError(null);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);
    setDriverData(null);

    getDriver(driverId)
      .then(data => {
        if (active) {
          setDriverData(data);
          setLoading(false);
        }
      })
      .catch(err => {
        if (active) {
          setError(err instanceof Error ? err.message : 'Failed to load driver details.');
          setLoading(false);
        }
      });

    return () => { active = false; };
  }, [driverId]);

  if (!driverId) return null;

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        <button onClick={onClose} style={closeBtn}>&times;</button>

        <h2 style={titleStyle}>
          Driver — {driverData?.driver.name ?? 'Loading...'}
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

        {driverData && (
          <div>
            {/* Summary grid — 2 cols on mobile, 4 cols on wider screens */}
            <div className="driver-summary-grid">
              <div>
                <div style={{ color: '#64748b', fontSize: '0.75rem' }}>Email</div>
                <div style={{ color: '#f1f5f9', fontSize: '0.875rem' }}>{driverData.driver.email}</div>
              </div>
              <div>
                <div style={{ color: '#64748b', fontSize: '0.75rem' }}>Role</div>
                <div style={{ color: '#f1f5f9', fontSize: '0.875rem' }}>{driverData.driver.role}</div>
              </div>
              <div>
                <div style={{ color: '#64748b', fontSize: '0.75rem' }}>Status</div>
                <div style={{ color: '#f1f5f9', fontSize: '0.875rem' }}>
                  <span style={{
                    display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
                    background: driverData.driver.isActive ? '#22c55e' : '#475569',
                    marginRight: '0.375rem',
                  }} />
                  {driverData.driver.isActive ? 'Active' : 'Offline'}
                </div>
              </div>
              <div>
                <div style={{ color: '#64748b', fontSize: '0.75rem' }}>Last Seen</div>
                <div style={{ color: '#f1f5f9', fontSize: '0.875rem' }}>
                  {driverData.driver.lastSeenAt
                    ? new Date(driverData.driver.lastSeenAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    : '—'}
                </div>
              </div>
            </div>

            {/* Route history */}
            <div className="table-scroll" style={{ maxHeight: '50vh' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem', color: '#f1f5f9' }}>
                <thead>
                  <tr style={{ background: '#1e293b' }}>
                    <th style={thStyle}>Date</th>
                    <th style={thStyle}>Stops</th>
                    <th style={thStyle}>Failed</th>
                    <th style={thStyle}>Distance</th>
                    <th style={thStyle}>On Time</th>
                    <th style={thStyle}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {driverData.routes.map(route => (
                    <tr key={route.routeId} style={{ borderBottom: '1px solid #1e293b' }}>
                      <td style={tdStyle}>
                        {route.shiftStart
                          ? new Date(route.shiftStart).toLocaleDateString()
                          : '—'}
                      </td>
                      <td style={tdStyle}>{route.completedStops}/{route.totalStops}</td>
                      <td style={tdStyle}>{route.failedStops}</td>
                      <td style={tdStyle}>
                        {route.actualDistanceKm != null ? `${route.actualDistanceKm.toFixed(1)} km` : '—'}
                      </td>
                      <td style={tdStyle}>
                        {route.onTime === true ? (
                          <span style={{ color: '#22c55e' }}>✓</span>
                        ) : route.onTime === false ? (
                          <span style={{ color: '#ef4444' }}>✗</span>
                        ) : (
                          <span style={{ color: '#64748b' }}>—</span>
                        )}
                      </td>
                      <td style={tdStyle}>
                        <span style={statusBadgeStyle(route.status)}>{route.status}</span>
                      </td>
                    </tr>
                  ))}
                  {driverData.routes.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ ...tdStyle, color: '#64748b', textAlign: 'center', padding: '1rem' }}>
                        No routes found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
