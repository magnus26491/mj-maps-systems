// src/pages/OverviewPage.tsx
import React, { useEffect, useState } from 'react';
import { getOverview } from '../api';
import type { Overview } from '../types';

function StatCard({ label, value, variant }: { label: string; value: number | string; variant?: string; sub?: string }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className={`stat-value${variant ? ` ${variant}` : ''}`}>{value}</div>
    </div>
  );
}

export default function OverviewPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getOverview()
      .then(r => setData(r.overview))
      .catch((e: Error) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading">Loading overview…</div>;
  if (error)   return <div className="page-body"><div className="login-error">{error}</div></div>;
  if (!data)   return null;

  const uptime = data.uptimeSeconds;
  const uptimeStr = uptime >= 86400
    ? `${Math.floor(uptime / 86400)}d ${Math.floor((uptime % 86400) / 3600)}h`
    : uptime >= 3600
    ? `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`
    : `${Math.floor(uptime / 60)}m`;

  return (
    <>
      <div className="page-header">
        <h1>Overview</h1>
        <p>Platform health and key metrics — last updated {new Date(data.timestamp).toLocaleTimeString()}</p>
      </div>
      <div className="page-body">
        <div className="stat-grid">
          <StatCard label="Total Users" value={data.users.total} variant="teal" />
          <StatCard label="Drivers" value={data.users.drivers} />
          <StatCard label="Dispatchers" value={data.users.dispatchers} />
          <StatCard label="Admins" value={data.users.admins} />
          <StatCard label="On Trial" value={data.trials.onTrial} variant="amber" />
          <StatCard label="New (7d)" value={data.newSignups.last7d} variant="green" />
          <StatCard label="New (30d)" value={data.newSignups.last30d} />
          <StatCard label="Open Tickets" value={data.tickets.open} variant={data.tickets.open > 0 ? 'amber' : undefined} />
          <StatCard label="Errors (24h)" value={data.errors24h} variant={data.errors24h > 0 ? 'red' : undefined} />
          <StatCard label="DB Size" value={data.dbSize} />
          <StatCard label="Uptime" value={uptimeStr} />
        </div>

        <div className="grid-2">
          <div className="card">
            <div className="card-title">Users by Role</div>
            <table>
              <tbody>
                <tr><td>Owners</td><td><span className="badge owner">Owner</span> {data.users.owners}</td></tr>
                <tr><td>Admins</td><td>{data.users.admins}</td></tr>
                <tr><td>Drivers</td><td>{data.users.drivers}</td></tr>
                <tr><td>Dispatchers</td><td>{data.users.dispatchers}</td></tr>
                <tr><td>Inactive</td><td>{data.users.inactive}</td></tr>
              </tbody>
            </table>
          </div>

          <div className="card">
            <div className="card-title">Plan Distribution</div>
            {data.plans.filter(p => p.planId !== 'all').length === 0 ? (
              <p style={{ color: 'var(--color-text-dim)', fontSize: '0.875rem' }}>No plan data available.</p>
            ) : (
              <table>
                <tbody>
                  {data.plans.filter(p => p.planId !== 'all' && p.planId !== null).map(p => (
                    <tr key={`${p.planId}-${p.planStatus}`}>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
                        {p.planId ?? '—'} / {p.planStatus ?? '—'}
                      </td>
                      <td><strong style={{ color: 'var(--color-text)' }}>{p.count}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </>
  );
}