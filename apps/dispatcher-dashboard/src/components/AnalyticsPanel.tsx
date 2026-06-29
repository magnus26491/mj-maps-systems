/**
 * AnalyticsPanel — Fleet analytics view.
 * Uses new cartographic design tokens from globals.css.
 * Enterprise-only gate with premium upgrade prompt.
 */
import { useState } from 'react';
import { useAnalytics } from '../hooks/useAnalytics';
import RouteDetailModal from './RouteDetailModal';

export default function AnalyticsPanel() {
  const { summary, routes, isLoading, error } = useAnalytics();
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div style={{ color: 'var(--color-text-muted)', padding: '0.5rem', fontFamily: 'var(--font-body)' }}>
        Loading analytics...
      </div>
    );
  }

  const isEnterpriseError = error && (error as string).includes('ENTERPRISE_REQUIRED');

  if (isEnterpriseError) {
    return (
      <div className="plan-gate" role="alert">
        {/* Upgrade arrow icon */}
        <div className="plan-gate__icon">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M10 4v12M4 10l6-6 6 6" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <div className="plan-gate__title">Fleet analytics</div>
        <div className="plan-gate__body">
          This feature requires an Enterprise plan. Upgrade to access route intelligence, cost-per-stop reporting, and driver performance dashboards.
        </div>
        <div className="plan-gate__badge">Enterprise</div>
        <a href="/pricing" className="d-btn d-btn--primary" style={{ display: 'inline-flex', textDecoration: 'none' }}>
          View plans
        </a>
        <div className="plan-gate__footer">Cancel anytime · VAT inclusive pricing</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ color: 'var(--color-red)', padding: '0.5rem', fontFamily: 'var(--font-body)' }}>
        {error}
      </div>
    );
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
      <div style={{ display: 'flex', gap: '1rem', fontSize: '0.75rem', color: 'var(--color-text-muted)', fontFamily: 'var(--font-body)' }}>
        <span>Avg completion: {summary.avgCompletionMins}m</span>
        {summary.redAlertCount > 0 && (
          <span>
            <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--color-red)', marginRight: 4 }} />
            {summary.redAlertCount}
          </span>
        )}
        {summary.amberAlertCount > 0 && (
          <span>
            <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--color-amber)', marginRight: 4 }} />
            {summary.amberAlertCount}
          </span>
        )}
      </div>

      {/* Route history table */}
      <div className="d-card table-scroll">
        <table style={{ width: '100%', minWidth: 700, borderCollapse: 'collapse', fontSize: '0.875rem', color: 'var(--color-text-primary)', fontFamily: 'var(--font-body)' }}>
          <thead>
            <tr style={{ background: 'var(--color-surface-2)', color: 'var(--color-text-secondary)' }}>
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
                style={{ borderBottom: '1px solid var(--color-border)', cursor: 'pointer' }}
                onClick={() => setSelectedRouteId(route.routeId)}
              >
                <td style={tdStyle}>
                  <div>{route.driverName ?? 'Unassigned'}</div>
                  <div style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>{route.vehicleLabel ?? '—'}</div>
                </td>
                <td style={tdStyle}>{route.completedStops}/{route.totalStops}</td>
                <td style={{ ...tdStyle, color: route.failedStops > 0 ? 'var(--color-red)' : 'var(--color-text-muted)' }}>
                  {route.failedStops}
                </td>
                <td style={tdStyle}>
                  {route.redAlerts > 0 && (
                    <span style={{ color: 'var(--color-red)', marginRight: 4 }}>
                      <svg width="8" height="8" viewBox="0 0 8 8" style={{ verticalAlign: 'middle' }}><circle cx="4" cy="4" r="4" fill="var(--color-red)" /></svg>
                      {route.redAlerts}
                    </span>
                  )}
                  {route.amberAlerts > 0 && (
                    <span style={{ color: 'var(--color-amber)' }}>
                      <svg width="8" height="8" viewBox="0 0 8 8" style={{ verticalAlign: 'middle' }}><circle cx="4" cy="4" r="4" fill="var(--color-amber)" /></svg>
                      {route.amberAlerts}
                    </span>
                  )}
                  {route.redAlerts === 0 && route.amberAlerts === 0 && '—'}
                </td>
                <td style={tdStyle}>
                  {route.podCount > 0 ? (
                    <span style={{ color: 'var(--color-teal)' }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ verticalAlign: 'middle', marginRight: 4 }}><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                      {route.podCount}
                    </span>
                  ) : '—'}
                </td>
                <td style={tdStyle}>
                  <span className={`status-badge status-badge--${route.status === 'active' ? 'active' : route.status === 'completed' ? 'completed' : route.status === 'failed' ? 'failed' : 'pending'}`}>
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
    <div className="d-card">
      <div style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem', marginBottom: '0.25rem', fontFamily: 'var(--font-body)' }}>{label}</div>
      <div style={{ color: 'var(--color-text-primary)', fontSize: '1.5rem', fontWeight: 700, fontFamily: 'var(--font-display)' }}>{value}</div>
    </div>
  );
}

const thStyle: React.CSSProperties = { padding: '0.5rem', textAlign: 'left', fontWeight: 600 };
const tdStyle: React.CSSProperties = { padding: '0.5rem', verticalAlign: 'middle' };