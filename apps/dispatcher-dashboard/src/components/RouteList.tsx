import type { Route } from '../types';

interface Props {
  routes: Route[];
  isLoading: boolean;
  onAssign: (routeId: string) => void;
}

export default function RouteList({ routes, isLoading, onAssign }: Props) {
  if (isLoading) return <div style={{ color: '#64748b' }}>Loading routes...</div>;
  if (routes.length === 0) return <div style={{ color: '#64748b' }}>No active routes.</div>;

  return (
    <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, overflow: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem', color: '#f1f5f9' }}>
        <thead>
          <tr style={{ background: '#1e293b', color: '#94a3b8' }}>
            <th style={thStyle}>Driver</th>
            <th style={thStyle}>Vehicle</th>
            <th style={thStyle}>Progress</th>
            <th style={thStyle}>Est. Completion</th>
            <th style={thStyle}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {routes.map(route => {
            const pct = route.totalStops > 0
              ? Math.round((route.completedStops / route.totalStops) * 100)
              : 0;
            return (
              <tr key={route.routeId} style={{ borderBottom: '1px solid #1e293b' }}>
                <td style={tdStyle}>{route.driverName ?? 'Unassigned'}</td>
                <td style={tdStyle}>{route.vehicleLabel}</td>
                <td style={tdStyle}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ background: '#1e293b', borderRadius: 4, height: 8, flex: 1, maxWidth: 100 }}>
                      <div style={{ background: '#3b82f6', borderRadius: 4, height: 8, width: `${pct}%` }} />
                    </div>
                    <span style={{ color: '#64748b', minWidth: 40 }}>{pct}%</span>
                  </div>
                  <span style={{ color: '#64748b', fontSize: '0.75rem' }}>{route.completedStops}/{route.totalStops} stops</span>
                </td>
                <td style={tdStyle}>
                  {route.estimatedCompletion
                    ? new Date(route.estimatedCompletion).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    : '—'}
                </td>
                <td style={tdStyle}>
                  <button
                    onClick={() => onAssign(route.routeId)}
                    style={{
                      background: '#1e3a5f', border: '1px solid #3b82f6', borderRadius: 4,
                      color: '#3b82f6', fontSize: '0.75rem', padding: '0.25rem 0.5rem', cursor: 'pointer',
                    }}
                  >
                    Assign →
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const thStyle: React.CSSProperties = { padding: '0.5rem', textAlign: 'left', fontWeight: 600 };
const tdStyle: React.CSSProperties = { padding: '0.5rem', verticalAlign: 'middle' };