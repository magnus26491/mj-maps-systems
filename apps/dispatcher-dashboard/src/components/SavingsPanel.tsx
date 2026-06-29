/**
 * components/SavingsPanel.tsx
 * Fleet-wide savings dashboard — Enterprise plan only.
 * Shows quantified time/fuel/risk savings with methodology disclosure.
 */
import { useState, useEffect, useCallback } from 'react';
import { getSavingsDetail, getSavingsSummary, type SavingsDetail, type SavingsSummary } from '../api';

function SavingsCard({ label, value, unit, color = 'var(--color-text-primary)', mono = true }: {
  label: string; value: number | string; unit?: string;
  color?: string; mono?: boolean;
}) {
  return (
    <div style={{
      background: 'var(--color-surface-2)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--r-lg)',
      padding: '0.875rem 1rem',
      textAlign: 'center',
    }}>
      <div style={{
        fontFamily: mono ? 'var(--font-mono)' : 'var(--font-display)',
        fontSize: '1.375rem',
        fontWeight: 700,
        color,
        lineHeight: 1.1,
        marginBottom: 4,
      }}>
        {typeof value === 'number' ? value.toLocaleString() : value}
        {unit && <span style={{ fontSize: '0.875rem', marginLeft: 2, fontWeight: 400 }}>{unit}</span>}
      </div>
      <div style={{
        fontFamily: 'var(--font-body)',
        fontSize: '0.6875rem',
        color: 'var(--color-text-muted)',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
      }}>{label}</div>
    </div>
  );
}

function ConfidenceBadge({ level }: { level: 'low' | 'medium' | 'high' }) {
  const cfg = {
    low:    { label: 'LOW CONFIDENCE',   color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
    medium: { label: 'MEDIUM CONFIDENCE', color: '#64748B', bg: 'rgba(100,116,139,0.12)' },
    high:   { label: 'HIGH CONFIDENCE',   color: '#10B981', bg: 'rgba(16,185,129,0.12)' },
  };
  const c = cfg[level];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontFamily: 'var(--font-mono)', fontSize: 10,
      color: c.color, background: c.bg,
      padding: '2px 8px', borderRadius: 4,
      border: `1px solid ${c.color}40`,
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: 3,
        background: c.color,
      }} />
      {c.label}
    </span>
  );
}

function TurnBar({ red, amber, green, unknown }: {
  red: number; amber: number; green: number; unknown: number;
}) {
  const total = red + amber + green + unknown || 1;
  return (
    <div>
      <div style={{
        display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden',
        background: 'var(--color-surface-2)', gap: 1,
      }}>
        {green  > 0 && <div style={{ flex: green,   background: '#10B981' }} />}
        {amber  > 0 && <div style={{ flex: amber,   background: '#F59E0B' }} />}
        {red    > 0 && <div style={{ flex: red,     background: '#EF4444' }} />}
        {unknown> 0 && <div style={{ flex: unknown, background: '#334155' }} />}
      </div>
      <div style={{
        display: 'flex', gap: '0.75rem', marginTop: 6,
        fontFamily: 'var(--font-mono)', fontSize: '0.6875rem',
        color: 'var(--color-text-muted)',
      }}>
        <span style={{ color: '#10B981' }}>● {green}%</span>
        <span style={{ color: '#F59E0B' }}>● {amber}%</span>
        <span style={{ color: '#EF4444' }}>● {red}%</span>
        <span style={{ color: '#64748B' }}>● {unknown}%</span>
      </div>
    </div>
  );
}

export default function SavingsPanel() {
  const [summary, setSummary] = useState<SavingsSummary | null>(null);
  const [detail,  setDetail]  = useState<SavingsDetail | null>(null);
  const [loading,  setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [showMethodology, setShowMethodology] = useState(false);
  const [period,  setPeriod]  = useState<'7' | '30' | '90'>('30');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const days = period === '7' ? 7 : period === '30' ? 30 : 90;
      const to   = new Date();
      const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
      const [sum, det] = await Promise.all([
        getSavingsSummary(),
        getSavingsDetail({ from: from.toISOString(), to: to.toISOString() }),
      ]);
      setSummary(sum);
      setDetail(det);
    } catch (e) {
      if (e instanceof Error && 'code' in e && (e as any).code === 'ENTERPRISE_REQUIRED') {
        setError('ENTERPRISE_REQUIRED');
      } else {
        setError(e instanceof Error ? e.message : 'Failed to load savings');
      }
    } finally {
      setLoading(false);
    }
  }, [period]);

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
              Fleet Savings — Enterprise Plan Required
            </div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
              Quantified savings data requires an Enterprise plan. Upgrade to access fleet-wide time, fuel, and risk savings insights.
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)', fontFamily: 'var(--font-body)', fontSize: '0.875rem' }}>
        Loading savings...
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

  const { savings, actual, estimatedBaseline, confidence } = detail ?? {
    savings: summary?.metrics,
    actual: null,
    estimatedBaseline: null,
    confidence: 'low' as const,
  };

  return (
    <div>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        marginBottom: '1rem',
      }}>
        <div>
          <h3 style={{
            fontFamily: 'var(--font-display)', fontWeight: 700,
            fontSize: '0.9375rem', color: 'var(--color-text-primary)', marginBottom: 4,
          }}>
            Fleet Savings
          </h3>
          {summary && (
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: '0.8125rem',
              color: 'var(--color-teal)', fontWeight: 600,
            }}>
              {summary.headline}
            </div>
          )}
        </div>
        <ConfidenceBadge level={confidence ?? 'low'} />
      </div>

      {/* Period selector */}
      <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1rem' }}>
        {(['7', '30', '90'] as const).map(p => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            style={{
              fontFamily: 'var(--font-display)', fontSize: '0.75rem', fontWeight: 600,
              padding: '3px 10px', borderRadius: 'var(--r-sm)',
              background: period === p ? 'var(--color-teal)' : 'var(--color-surface-2)',
              color: period === p ? '#fff' : 'var(--color-text-secondary)',
              border: period === p ? 'none' : '1px solid var(--color-border)',
              cursor: 'pointer',
            }}
          >
            {p}d
          </button>
        ))}
      </div>

      {/* Main savings metric */}
      {savings && (
        <>
          <div style={{
            background: 'rgba(16,185,129,0.08)',
            border: '1px solid rgba(16,185,129,0.20)',
            borderRadius: 'var(--r-xl)',
            padding: '1rem 1.25rem',
            marginBottom: '1rem',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '0.75rem',
          }}>
            <SavingsCard
              label="Minutes Saved"
              value={savings.durationMin}
              unit="min"
              color="var(--color-green)"
            />
            <SavingsCard
              label="Risky Turns Avoided"
              value={savings.riskyTurnsAvoided}
              color="#10B981"
            />
            <SavingsCard
              label="Fuel Saved"
              value={savings.fuelLitres}
              unit="L"
              color="var(--color-teal)"
            />
            <SavingsCard
              label="Distance Saved"
              value={savings.distanceKm}
              unit="km"
              color="var(--color-teal)"
            />
          </div>

          {/* Actual vs Baseline comparison */}
          {actual && estimatedBaseline && (
            <div style={{
              background: 'var(--color-surface-2)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--r-lg)',
              padding: '0.875rem 1rem',
              marginBottom: '1rem',
            }}>
              <div style={{
                fontFamily: 'var(--font-body)', fontSize: '0.75rem',
                color: 'var(--color-text-muted)', marginBottom: '0.5rem',
                textTransform: 'uppercase', letterSpacing: '0.5px',
              }}>
                Actual vs naive postcode-centroid baseline
              </div>
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr',
                gap: '0.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.8125rem',
              }}>
                <div>
                  <div style={{ color: 'var(--color-text-secondary)' }}>Actual distance</div>
                  <div style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
                    {actual.totalDistanceKm.toFixed(1)} km
                  </div>
                </div>
                <div>
                  <div style={{ color: 'var(--color-text-secondary)' }}>Baseline distance</div>
                  <div style={{ color: 'var(--color-text-muted)', textDecoration: 'line-through' }}>
                    {estimatedBaseline.totalDistanceKm.toFixed(1)} km
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Completed routes count */}
          {actual && (
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              fontFamily: 'var(--font-body)', fontSize: '0.8125rem',
              color: 'var(--color-text-muted)', marginBottom: '0.75rem',
            }}>
              <span>Based on {actual.completedRoutes} completed route{actual.completedRoutes !== 1 ? 's' : ''}</span>
              <span style={{ color: '#EF4444' }}>RED {actual.redTurns}</span>
              <span style={{ color: '#F59E0B' }}>AMBER {actual.amberTurns}</span>
            </div>
          )}
        </>
      )}

      {/* Methodology disclosure */}
      <div style={{ marginTop: '0.5rem' }}>
        <button
          onClick={() => setShowMethodology(v => !v)}
          style={{
            background: 'none', border: 'none',
            fontFamily: 'var(--font-mono)', fontSize: '0.6875rem',
            color: 'var(--color-text-muted)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 4,
            padding: 0,
          }}
        >
          <span style={{ color: 'var(--color-teal)' }}>{showMethodology ? '−' : '+'}</span>
          How we calculate this
        </button>
        {showMethodology && detail?.methodology && (
          <div style={{
            marginTop: '0.5rem',
            background: 'var(--color-surface-1)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--r-md)',
            padding: '0.75rem',
            fontFamily: 'var(--font-body)', fontSize: '0.75rem',
            color: 'var(--color-text-secondary)', lineHeight: 1.6,
          }}>
            <div style={{ marginBottom: 6 }}>
              <strong style={{ color: 'var(--color-text-primary)' }}>Baseline model:</strong>{' '}
              {detail.methodology.description}
            </div>
            <div>
              <strong style={{ color: 'var(--color-text-primary)' }}>Confidence:</strong>{' '}
              High ≥5 routes + good GPS; Medium ≥3 routes; Low = sparse data.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
