import type { Stats } from '../types';

interface Props { stats: Stats | undefined; isLoading: boolean; }

export default function KpiBar({ stats, isLoading }: Props) {
  if (isLoading || !stats) {
    return (
      <div style={{ display: 'flex', gap: '1rem', padding: '0 0 1rem', flexWrap: 'wrap' }}>
        <span style={{ color: '#64748b' }}>Loading KPIs...</span>
      </div>
    );
  }

  const cards = [
    { label: 'Active Routes', value: stats.activeRoutes, color: '#3b82f6', bg: '#0f172a' },
    { label: 'Drivers', value: stats.totalDrivers, color: '#22c55e', bg: '#0f172a' },
    { label: 'Completed', value: stats.completedStopsToday, color: '#22c55e', bg: '#0f172a' },
    { label: 'Failed', value: stats.failedStopsToday, color: '#f59e0b', bg: '#0f172a' },
    {
      label: 'Red Alerts',
      value: stats.redAlerts,
      color: stats.redAlerts > 0 ? '#ef4444' : '#64748b',
      bg: stats.redAlerts > 0 ? '#7f1d1d' : '#0f172a',
      border: stats.redAlerts > 0 ? '#ef4444' : '#1e293b',
    },
  ];

  return (
    <div style={{ display: 'flex', gap: '1rem', padding: '0 0 1rem', flexWrap: 'wrap' }}>
      {cards.map(c => (
        <div
          key={c.label}
          style={{
            background: c.bg ?? '#0f172a',
            border: `1px solid ${c.border ?? '#1e293b'}`,
            borderRadius: 8,
            padding: '0.75rem 1.25rem',
            minWidth: 120,
          }}
        >
          <div style={{ color: c.color, fontSize: '1.5rem', fontWeight: 700 }}>{c.value}</div>
          <div style={{ color: '#64748b', fontSize: '0.75rem', marginTop: '0.25rem' }}>{c.label}</div>
        </div>
      ))}
    </div>
  );
}
