import { useState } from 'react';
import { useAnalytics } from '../hooks/useAnalytics';
import RouteDetailModal from './RouteDetailModal';

export default function AnalyticsPanel() {
  const { summary, routes, isLoading, error } = useAnalytics();
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);

  if (isLoading) {
    return <div style={mutedStyle}>Loading analytics...</div>;
  }

  const isEnterpriseError = error && (error as string).includes('ENTERPRISE_REQUIRED');

  if (isEnterpriseError) {
    return (
      <div style={enterpriseBoxStyle}>
        Fleet analytics require an Enterprise plan.
      </div>
    );
  }

  if (error) {
    return <div style={{ ...mutedStyle, color: '#ef4444' }}>{error}</div>;
  }

  if (!summary) return null;

  const successRate = summary.totalStopsDelivered + summary.totalStopsFailed > 0
    ? Math.round((summary.totalStopsDelivered / (summary.totalStopsDelivered + summary.totalStopsFailed)) * 100)
    : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
        <KpiCard label="Routes completed" value={summary.completedRoutes} />
        <KpiCard label="Delivery success" value={`${successRate}%`} />
        <KpiCard label="POD capture rate" value={`${Math.round(summary.podCaptureRate * 100)}%`} />
        <KpiCard label="On-time rate" value={`${Math.round(summary.onTimeRate * 100)}%`} />
      </div>

      {/* Additional stats */}
      <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.75rem', color: '#64748b' }}>
        <span>Avg completion: {summary.avgCompletionMins}m</span>
        <span>🔴 {summary.redAlertCount}</span>
        <span>🟡 {summary.amberAlertCount}</span>
      </div>

      {/* Route history table */}
      <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem', color: '#f1f5f9' }}>
          <thead>
            <tr style={{ background: '#1e293b', color: '#94a3b8' }}>
              <th style={thStyle}>Driver</th>
              <th style={thStyle}>Stops</th>
              <th style={thStyle}>Failed</th>
              <th style={thStyle}>Alerts</th>
              <th style={thStyle}>POD</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Shift</th>
            </tr>
          </thead>
          <tbody>
            {routes.map(route => (
              <tr
                key={route.routeId}
                style={{ borderBottom: '1px solid #1e293b', cursor: 'pointer' }}
                onClick={() => setSelectedRouteId(route.routeId)}
              >
                <td style={tdStyle}>
                  <div>{route.driverName ?? 'Unassigned'}</div>
                  <div style={{ color: '#64748b', fontSize: '0.75rem' }}>{route.vehicleLabel ?? '—'}</div>
                </td>
                <td style={tdStyle}>{route.completedStops}/{route.totalStops}</td>
                <td style={{ ...tdStyle, color: route.failedStops > 0 ? '#ef4444' : '#64748b' }}>
                  {route.failedStops}
                </td>
                <td style={tdStyle}>
                  {route.redAlerts > 0 && <span style={{ color: '#ef4444' }}>🔴 {route.redAlerts} </span>}
                  {route.amberAlerts > 0 && <span style={{ color: '#eab308' }}>🟡 {route.amberAlerts}</span>}
                  {route.redAlerts === 0 && route.amberAlerts === 0 && '—'}
                </td>
                <td style={tdStyle}>
                  {route.podCount > 0 ? `📷 ${route.podCount}` : '—'}
                </td>
                <td style={tdStyle}>
                  <span style={{
                    ...badgeStyle,
                    background: route.status === 'active' ? '#1e3a5f' : '#14532d',
                    color: route.status === 'active' ? '#3b82f6' : '#22c55e',
                    border: `1px solid ${route.status === 'active' ? '#3b82f6' : '#22c55e'}`,
                  }}>
                    {route.status}
                  </span>
                </td>
                <td style={tdStyle}>
                  {route.shiftStart ? new Date(route.shiftStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <RouteDetailModal routeId={selectedRouteId} onClose={() => setSelectedRouteId(null)} />
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={cardStyle}>
      <div style={{ color: '#64748b', fontSize: '0.75rem', marginBottom: '0.25rem' }}>{label}</div>
      <div style={{ color: '#f1f5f9', fontSize: '1.5rem', fontWeight: 700 }}>{value}</div>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: '#0f172a',
  border: '1px solid #1e293b',
  borderRadius: 8,
  padding: '0.75rem',
};

const thStyle: React.CSSProperties = { padding: '0.5rem', textAlign: 'left', fontWeight: 600 };
const tdStyle: React.CSSProperties = { padding: '0.5rem', verticalAlign: 'middle' };

const badgeStyle: React.CSSProperties = {
  borderRadius: 4,
  padding: '0.125rem 0.375rem',
  fontSize: '0.75rem',
  fontWeight: 600,
};

const mutedStyle: React.CSSProperties = { color: '#64748b', padding: '0.5rem' };

const enterpriseBoxStyle: React.CSSProperties = {
  background: '#1e293b',
  border: '1px solid #f59e0b',
  borderRadius: 8,
  padding: '1rem',
  color: '#f59e0b',
  fontSize: '0.875rem',
  textAlign: 'center',
};