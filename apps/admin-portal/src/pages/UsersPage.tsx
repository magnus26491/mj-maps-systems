// src/pages/UsersPage.tsx
import React, { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getUsers } from '../api';
import type { User, Pagination } from '../types';

function planBadge(planId: string) {
  if (planId === 'custom') return <span className="badge teal">Enterprise</span>;
  if (planId === 'navigation') return <span className="badge muted">Pro</span>;
  return <span className="badge muted">{planId}</span>;
}

function statusBadge(isActive: boolean) {
  return isActive
    ? <span className="badge green"><span className="status-dot ok" style={{ marginRight: 4 }} />Active</span>
    : <span className="badge muted">Inactive</span>;
}

function roleBadge(role: string, isOwner: boolean) {
  if (isOwner) return <span className="badge owner">Owner</span>;
  if (role === 'admin') return <span className="badge teal">Admin</span>;
  if (role === 'dispatcher') return <span className="badge amber">Dispatcher</span>;
  return <span className="badge muted">Driver</span>;
}

export default function UsersPage() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [plan, setPlan] = useState('');
  const [page, setPage] = useState(1);

  const load = useCallback(async (s: string, p: string, pageNum: number) => {
    setLoading(true);
    try {
      const res = await getUsers({ search: s, plan: p, page: pageNum, limit: 25 });
      setUsers(res.users);
      setPagination(res.pagination);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(search, plan, page); }, [load, search, plan, page]);

  return (
    <>
      <div className="page-header">
        <h1>Users</h1>
        <p>All registered drivers, dispatchers and admins</p>
      </div>
      <div className="page-body">
        <div className="search-bar">
          <input
            type="search"
            placeholder="Search by email or organisation…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
          />
          <select value={plan} onChange={e => { setPlan(e.target.value); setPage(1); }}>
            <option value="">All plans</option>
            <option value="navigation">Pro</option>
            <option value="custom">Enterprise</option>
          </select>
        </div>

        {error && <div className="login-error">{error}</div>}

        <div className="data-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Email</th>
                <th>Role</th>
                <th>Plan</th>
                <th>Status</th>
                <th>Joined</th>
                <th>Last Login</th>
                <th>Routes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="loading">Loading…</td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={8} className="empty-state"><p>No users found</p></td></tr>
              ) : users.map(u => (
                <tr key={u.id}>
                  <td>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{u.email}</span>
                    {u.organisationName && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-dim)' }}>{u.organisationName}</div>
                    )}
                  </td>
                  <td>{roleBadge(u.role, u.isOwner)}</td>
                  <td>{planBadge(u.planId)}</td>
                  <td>{statusBadge(u.isActive)}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
                    {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : '—'}
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', textAlign: 'center' }}>
                    {u.activeRouteCount ?? '—'}
                  </td>
                  <td>
                    <button className="btn btn-sm btn-secondary" onClick={() => navigate(`/users/${u.id}`)}>
                      View →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {pagination && (
          <div className="pagination">
            <span>
              Showing {(page - 1) * 25 + 1}–{Math.min(page * 25, pagination.total)} of {pagination.total}
            </span>
            <div className="pagination-btns">
              <button className="btn btn-sm btn-secondary" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
              <button className="btn btn-sm btn-secondary" disabled={page >= pagination.totalPages} onClick={() => setPage(p => p + 1)}>Next →</button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}