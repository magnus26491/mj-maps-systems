// src/pages/TrialsPage.tsx
import React, { useEffect, useState } from 'react';
import { getTrials } from '../api';

export default function TrialsPage() {
  const [trials, setTrials] = useState<Array<{
    id: string; email: string; role: string;
    trialEndsAt: string; daysRemaining: number; planStatus: string;
    joinedAt: string; lastLogin: string | null;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getTrials()
      .then(r => setTrials(r.trials))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <div className="page-header">
        <h1>Trials</h1>
        <p>Users currently on free trial — sorted by expiry (soonest first)</p>
      </div>
      <div className="page-body">
        {error && <div className="login-error">{error}</div>}
        {loading ? (
          <div className="loading">Loading…</div>
        ) : trials.length === 0 ? (
          <div className="empty-state">
            <p>No users currently on trial.</p>
          </div>
        ) : (
          <div className="data-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Days Left</th>
                  <th>Trial Ends</th>
                  <th>Joined</th>
                  <th>Last Login</th>
                </tr>
              </thead>
              <tbody>
                {trials.map(t => (
                  <tr key={t.id}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{t.email}</td>
                    <td><span className="badge muted">{t.role}</span></td>
                    <td>
                      <span className={`badge ${t.daysRemaining <= 1 ? 'red' : t.daysRemaining <= 3 ? 'amber' : 'green'}`}>
                        {t.daysRemaining}d
                      </span>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
                      {new Date(t.trialEndsAt).toLocaleString()}
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
                      {new Date(t.joinedAt).toLocaleDateString()}
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
                      {t.lastLogin ? new Date(t.lastLogin).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}