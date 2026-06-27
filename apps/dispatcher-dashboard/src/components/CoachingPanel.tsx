/**
 * components/CoachingPanel.tsx
 * Driver coaching insights — Enterprise plan only.
 * Shows turn-score distribution, top coaching patterns, fleet comparison.
 */
import { useState, useEffect, useCallback } from 'react';
import { getDriverInsights, type DriverInsights } from '../api';

const SEVERITY_STYLES = {
  high:   { bg: 'rgba(239,68,68,0.10)',  border: 'rgba(239,68,68,0.30)',  color: '#EF4444', label: 'HIGH' },
  medium: { bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.30)', color: '#F59E0B', label: 'MED'  },
  low:    { bg: 'rgba(16,185,129,0.08)',  border: 'rgba(16,185,129,0.20)', color: '#10B981', label: 'LOW'  },
};

const TREND_ICONS: Record<string, string> = {
  improving:  '↑',
  stable:     '→',
  declining:  '↓',
};
const TREND_COLORS: Record<string, string> = {
  improving: '#10B981',
  stable:    '#64748B',
  declining: '#EF4444',
};

function TurnBar({ distribution }: {
  distribution: { green: number; amber: number; red: number; unknown: number };
}) {
  const { green, amber, red, unknown } = distribution;
  const total = green + amber + red + unknown || 1;
  const pct = (n: number) => Math.round((n / total) * 100);

  return (
    <div>
      <div style={{
        display: 'flex', height: 12, borderRadius: 6, overflow: 'hidden',
        background: 'var(--color-surface-2)', gap: 2,
      }}>
        {green   > 0 && <div style={{ flex: green,   background: '#10B981' }} />}
        {amber   > 0 && <div style={{ flex: amber,   background: '#F59E0B' }} />}
        {red     > 0 && <div style={{ flex: red,     background: '#EF4444' }} />}
        {unknown > 0 && <div style={{ flex: unknown, background: '#334155' }} />}
      </div>
      <div style={{
        display: 'flex', gap: '0.75rem', marginTop: 6,
        fontFamily: 'var(--font-mono)', fontSize: '0.6875rem',
        color: 'var(--color-text-muted)',
      }}>
        <span style={{ color: '#10B981' }}>● {pct(green)}%</span>
        <span style={{ color: '#F59E0B' }}>● {pct(amber)}%</span>
        <span style={{ color: '#EF4444' }}>● {pct(red)}%</span>
        <span style={{ color: '#64748B' }}>● {pct(unknown)}%</span>
      </div>
    </div>
  );
}

function PatternCard({ pattern }: { pattern: DriverInsights['topPatterns'][0] }) {
  const sev = SEVERITY_STYLES[pattern.severity] ?? SEVERITY_STYLES.low;

  return (
    <div style={{
      background: sev.bg,
      border: `1px solid ${sev.border}`,
      borderRadius: 'var(--r-lg)',
      padding: '0.875rem 1rem',
      marginBottom: '0.5rem',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 10,
          color: sev.color, fontWeight: 600, letterSpacing: '0.5px',
        }}>
          {sev.label} PRIORITY
        </div>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 10,
          color: 'var(--color-text-muted)',
        }}>
          #{pattern.count}
        </span>
      </div>
      <div style={{
        fontFamily: 'var(--font-body)', fontSize: '0.8125rem',
        color: 'var(--color-text-primary)', lineHeight: 1.5,
        marginBottom: 8,
      }}>
        {pattern.description}
      </div>
      <div style={{
        fontFamily: 'var(--font-body)', fontSize: '0.75rem',
        color: 'var(--color-text-secondary)', lineHeight: 1.5,
        paddingTop: 6,
        borderTop: `1px solid ${sev.border}40`,
      }}>
        <span style={{ color: sev.color, fontWeight: 600, marginRight: 4 }}>→</span>
        {pattern.recommendation}
      </div>
    </div>
  );
}

export default function CoachingPanel({ driverId }: { driverId: string }) {
  const [insights, setInsights] = useState<DriverInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,  setError]  = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getDriverInsights(driverId);
      setInsights(data);
    } catch (e) {
      if (e instanceof Error && 'code' in e && (e as any).code === 'ENTERPRISE_REQUIRED') {
        setError('ENTERPRISE_REQUIRED');
      } else {
        setError(e instanceof Error ? e.message : 'Failed to load coaching insights');
      }
    } finally {
      setLoading(false);
    }
  }, [driverId]);

  useEffect(() => { load(); }, [load]);

  if (error === 'ENTERPRISE_REQUIRED') {
    return (
      <div style={{
        background: 'rgba(245,158,11,0.08)',
        border: '1px solid rgba(245,158,11,0.25)',
        borderRadius: 'var(--r-lg)',
        padding: '1.5rem',
        fontFamily: 'var(--font-body)',
      }}>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0, marginTop: 2 }}>
            <path d="M10 2L1 17h18L10 2z" stroke="#F59E0B" strokeWidth="1.5" strokeLinejoin="round"/>
            <path d="M10 8v4M10 14.5v.5" stroke="#F59E0B" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: '#F59E0B', marginBottom: 4, fontSize: '0.9375rem' }}>
              Coaching Insights — Enterprise Plan Required
            </div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
              Per-driver coaching insights require an Enterprise plan. Upgrade to access turn-score coaching for your fleet.
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)', fontFamily: 'var(--font-body)', fontSize: '0.875rem' }}>
        Loading coaching insights...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.30)',
        borderRadius: 'var(--r-md)', padding: '0.875rem',
        color: 'var(--color-red)', fontFamily: 'var(--font-body)', fontSize: '0.875rem',
      }}>
        {error}
        <button onClick={load} style={{ marginLeft: 8, color: 'var(--color-teal)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-display)', fontSize: '0.875rem' }}>
          Retry
        </button>
      </div>
    );
  }

  if (!insights || insights.totalRoutes === 0) {
    return (
      <div style={{
        textAlign: 'center', padding: '2rem',
        fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: 'var(--color-text-muted)',
      }}>
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none" style={{ marginBottom: 8 }}>
          <circle cx="16" cy="16" r="14" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M16 9v8M16 19.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
        <div style={{ color: 'var(--color-text-secondary)', marginBottom: 4 }}>No completed routes yet</div>
        <div>Complete at least one route to see coaching insights.</div>
      </div>
    );
  }

  const { turnScoreDistribution, improvementTrend, comparedToFleetAverage, fleetAverageGreenRate } = insights;
  const fleetOrBetter = comparedToFleetAverage >= 0;

  return (
    <div>
      {/* Driver identity */}
      <div style={{ marginBottom: '1rem' }}>
        <div style={{
          fontFamily: 'var(--font-display)', fontWeight: 700,
          fontSize: '0.9375rem', color: 'var(--color-text-primary)', marginBottom: 2,
        }}>
          {insights.driver.name ?? insights.driver.email}
        </div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
          {insights.totalRoutes} completed route{insights.totalRoutes !== 1 ? 's' : ''} ·{' '}
          {insights.completedStops} stops delivered
        </div>
      </div>

      {/* Trend + fleet comparison */}
      <div style={{
        display: 'flex', gap: '0.75rem', marginBottom: '1rem',
        flexWrap: 'wrap',
      }}>
        <div style={{
          background: 'var(--color-surface-2)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--r-lg)',
          padding: '0.5rem 0.875rem',
          display: 'flex', alignItems: 'center', gap: 6,
          flex: 1, minWidth: 120,
        }}>
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: '1rem',
            color: TREND_COLORS[improvementTrend] ?? '#64748B',
          }}>
            {TREND_ICONS[improvementTrend]}
          </span>
          <span style={{
            fontFamily: 'var(--font-body)', fontSize: '0.8125rem',
            color: TREND_COLORS[improvementTrend] ?? '#64748B', fontWeight: 600,
          }}>
            {improvementTrend.charAt(0).toUpperCase() + improvementTrend.slice(1)}
          </span>
        </div>

        <div style={{
          background: 'var(--color-surface-2)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--r-lg)',
          padding: '0.5rem 0.875rem',
          flex: 1, minWidth: 120,
        }}>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.6875rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            vs Fleet Avg
          </div>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: '0.9375rem', fontWeight: 700,
            color: fleetOrBetter ? 'var(--color-green)' : 'var(--color-red)',
          }}>
            {fleetOrBetter ? '+' : ''}{comparedToFleetAverage.toFixed(1)} pp
          </div>
        </div>

        <div style={{
          background: 'var(--color-surface-2)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--r-lg)',
          padding: '0.5rem 0.875rem',
          flex: 1, minWidth: 120,
        }}>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.6875rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Fleet Avg
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9375rem', fontWeight: 700, color: 'var(--color-text-secondary)' }}>
            {fleetAverageGreenRate.toFixed(1)}%
          </div>
        </div>
      </div>

      {/* Turn score distribution */}
      <div style={{
        background: 'var(--color-surface-2)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--r-lg)',
        padding: '0.875rem 1rem',
        marginBottom: '1rem',
      }}>
        <div style={{
          fontFamily: 'var(--font-body)', fontSize: '0.75rem',
          color: 'var(--color-text-muted)', textTransform: 'uppercase',
          letterSpacing: '0.5px', marginBottom: 8,
        }}>
          Turn Score Distribution
        </div>
        <TurnBar distribution={turnScoreDistribution} />
      </div>

      {/* Headline */}
      <div style={{
        fontFamily: 'var(--font-body)', fontSize: '0.875rem',
        color: 'var(--color-text-secondary)', lineHeight: 1.5,
        marginBottom: '1rem', padding: '0.75rem',
        background: 'rgba(0,194,168,0.05)',
        border: '1px solid rgba(0,194,168,0.15)',
        borderRadius: 'var(--r-md)',
      }}>
        {insights.headline}
      </div>

      {/* Coaching patterns */}
      {insights.topPatterns.length > 0 && (
        <div>
          <div style={{
            fontFamily: 'var(--font-body)', fontSize: '0.75rem',
            color: 'var(--color-text-muted)', textTransform: 'uppercase',
            letterSpacing: '0.5px', marginBottom: 8,
          }}>
            Coaching Observations
          </div>
          {insights.topPatterns.map((p, i) => (
            <PatternCard key={i} pattern={p} />
          ))}
        </div>
      )}

      {/* Refresh */}
      <button
        onClick={load}
        style={{
          marginTop: '1rem', background: 'none',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--r-md)',
          color: 'var(--color-text-muted)',
          fontFamily: 'var(--font-display)', fontSize: '0.75rem',
          padding: '4px 12px', cursor: 'pointer',
          display: 'block',
        }}
      >
        ↻ Refresh
      </button>
    </div>
  );
}
