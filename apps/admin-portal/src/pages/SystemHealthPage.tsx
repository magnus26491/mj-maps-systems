// src/pages/SystemHealthPage.tsx
import React, { useEffect, useState } from 'react';
import { getSystemHealth } from '../api';

function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  return `${(bytes / 1e3).toFixed(1)} KB`;
}

export default function SystemHealthPage() {
  const [data, setData] = useState<{
    database: { status: string; latencyMs: number | null };
    redis: { status: string; note?: string };
    timestamp: string;
    uptime: number;
    environment: string;
    tableSizes: Record<string, number>;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getSystemHealth()
      .then(r => setData(r.health))
      .catch((e: Error) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading">Checking system health…</div>;
  if (error) return <div className="page-body"><div className="login-error">{error}</div></div>;
  if (!data) return null;

  const uptime = data.uptime;
  const uptimeStr = uptime >= 86400
    ? `${Math.floor(uptime / 86400)}d ${Math.floor((uptime % 86400) / 3600)}h`
    : uptime >= 3600
    ? `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`
    : `${Math.floor(uptime / 60)}m`;

  return (
    <>
      <div className="page-header">
        <h1>System Health</h1>
        <p>Database, cache, and infrastructure status · {new Date(data.timestamp).toLocaleString()}</p>
      </div>
      <div className="page-body">
        <div className="stat-grid" style={{ marginBottom: '2rem' }}>
          <div className="stat-card">
            <div className="stat-label">Environment</div>
            <div className="stat-value" style={{ fontSize: '1.25rem' }}>{data.environment}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Uptime</div>
            <div className="stat-value teal">{uptimeStr}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">DB Latency</div>
            <div className={`stat-value ${(data.database.latencyMs ?? 0) > 500 ? 'amber' : 'green'}`}>
              {data.database.latencyMs != null ? `${data.database.latencyMs}ms` : '—'}
            </div>
          </div>
        </div>

        <div className="grid-2">
          <div className="card">
            <div className="card-title">Services</div>
            <table>
              <tbody>
                <tr>
                  <td>PostgreSQL</td>
                  <td>
                    <span className={`badge ${data.database.status === 'ok' ? 'green' : data.database.status === 'degraded' ? 'amber' : 'red'}`}>
                      <span className={`status-dot ${data.database.status === 'ok' ? 'ok' : data.database.status === 'degraded' ? 'warn' : 'err'}`} style={{ marginRight: 4 }} />
                      {data.database.status}
                    </span>
                    {data.database.latencyMs != null && (
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', marginLeft: '0.5rem', color: 'var(--color-text-dim)' }}>
                        {data.database.latencyMs}ms
                      </span>
                    )}
                  </td>
                </tr>
                <tr>
                  <td>Redis</td>
                  <td>
                    <span className={`badge ${data.redis.status === 'ok' ? 'green' : 'amber'}`}>
                      <span className={`status-dot ${data.redis.status === 'ok' ? 'ok' : 'warn'}`} style={{ marginRight: 4 }} />
                      {data.redis.status}
                    </span>
                    {data.redis.note && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-dim)', marginTop: '0.25rem' }}>{data.redis.note}</div>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {Object.keys(data.tableSizes).length > 0 && (
            <div className="card">
              <div className="card-title">Table Sizes (Top 10)</div>
              <table>
                <tbody>
                  {Object.entries(data.tableSizes).slice(0, 10).map(([table, bytes]) => (
                    <tr key={table}>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{table}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', textAlign: 'right' }}>
                        <strong style={{ color: 'var(--color-text)' }}>{formatBytes(bytes)}</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}