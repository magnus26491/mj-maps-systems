// src/pages/TicketsPage.tsx
import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getTickets } from '../api';
import type { Ticket, Pagination } from '../types';

export default function TicketsPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState('1');

  const load = useCallback(async (s: string, p: string) => {
    setLoading(true);
    try {
      const res = await getTickets({ status: s, page: p });
      setTickets(res.tickets);
      setPagination(res.pagination);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(status, page); }, [load, status, page]);

  return (
    <>
      <div className="page-header">
        <h1>Support Tickets</h1>
        <p>All support tickets — filter by status to focus on open or pending items</p>
      </div>
      <div className="page-body">
        <div className="search-bar">
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {['', 'open', 'pending', 'closed'].map(s => (
              <button
                key={s}
                className={`btn btn-sm ${status === s ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => { setStatus(s); setPage('1'); }}
              >
                {s === '' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {error && <div className="login-error">{error}</div>}

        <div className="data-table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Subject</th>
                <th>User</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Assignee</th>
                <th>Updated</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="loading">Loading…</td></tr>
              ) : tickets.length === 0 ? (
                <tr><td colSpan={8} className="empty-state"><p>No tickets found</p></td></tr>
              ) : tickets.map(t => (
                <tr key={t.id}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>{t.id.slice(0, 8)}…</td>
                  <td>{t.subject}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{t.userEmail}</td>
                  <td>
                    <span className={`badge ${t.status === 'open' ? 'red' : t.status === 'pending' ? 'amber' : 'green'}`}>
                      {t.status}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${t.priority === 'urgent' ? 'red' : t.priority === 'high' ? 'amber' : 'muted'}`}>
                      {t.priority}
                    </span>
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
                    {t.assigneeEmail ?? '—'}
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
                    {new Date(t.updatedAt).toLocaleDateString()}
                  </td>
                  <td>
                    <Link to={`/tickets/${t.id}`} className="btn btn-sm btn-secondary">View →</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {pagination && (
          <div className="pagination">
            <span>Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)</span>
            <div className="pagination-btns">
              <button className="btn btn-sm btn-secondary" disabled={pagination.page <= 1} onClick={() => setPage(String(pagination.page - 1))}>← Prev</button>
              <button className="btn btn-sm btn-secondary" disabled={pagination.page >= pagination.totalPages} onClick={() => setPage(String(pagination.page + 1))}>Next →</button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}