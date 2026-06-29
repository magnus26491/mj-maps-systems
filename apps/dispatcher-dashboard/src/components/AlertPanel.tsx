import { useAlerts } from '../hooks/useAlerts';

export default function AlertPanel() {
  const { alerts, dismiss } = useAlerts();

  return (
    <div style={{
      background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8,
      padding: '1rem', maxHeight: 400, overflowY: 'auto',
    }}>
      <h3 style={{ color: '#f1f5f9', fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem', marginTop: 0 }}>
        Live Alerts
      </h3>
      {alerts.length === 0 ? (
        <p style={{ color: '#22c55e', fontSize: '0.875rem' }}>No active alerts</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {alerts.map(a => (
            <div key={a.alertId} style={{
              background: '#1e293b',
              borderLeft: `4px solid ${a.level === 'RED' ? '#ef4444' : '#f59e0b'}`,
              borderRadius: '0 4px 4px 0',
              padding: '0.5rem 0.75rem',
            }}>
              <div style={{ color: '#f1f5f9', fontSize: '0.8rem', fontWeight: 600 }}>
                {a.level === 'RED' ? 'RED' : 'AMBER'} {a.stopAddress}
              </div>
              <div style={{ color: '#64748b', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                Driver: {a.driverName} &middot; Vehicle: {a.vehicleLabel}
              </div>
              <button
                onClick={() => dismiss(a.alertId)}
                style={{
                  background: 'transparent', border: '1px solid #334155', borderRadius: 4,
                  color: '#94a3b8', fontSize: '0.75rem', padding: '0.625rem 0.75rem',
                  cursor: 'pointer', marginTop: '0.5rem', minHeight: 44,
                }}
              >
                Dismiss
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
