// src/pages/AuditLogPage.tsx
// Enhanced audit log with:
// - Action type filter, admin filter, target filter, date range, text search
// - Improved impersonation event display
// - CSV export of current filtered view

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { getAuditLog, getAdmins } from '../api';
import type { AuditLogEntry, Pagination, Admin } from '../types';

// ── Action type options ───────────────────────────────────────────────────────
const ACTION_OPTIONS = [
  { value: '', label: 'All actions' },
  { value: 'plan_change', label: 'Plan change' },
  { value: 'impersonation_start', label: 'Impersonation start' },
  { value: 'impersonation_end', label: 'Impersonation end' },
  { value: 'role_change', label: 'Role change' },
  { value: 'trial_view', label: 'Trial view' },
  { value: 'user_update', label: 'User update' },
  { value: 'subscription_change', label: 'Subscription change' },
  { value: 'admin_add', label: 'Admin added' },
  { value: 'admin_remove', label: 'Admin removed' },
  { value: 'user_delete', label: 'User delete' },
  { value: 'ticket_reply', label: 'Ticket reply' },
  { value: 'ticket_update', label: 'Ticket update' },
  { value: 'error_view', label: 'Error view' },
  { value: 'overview_view', label: 'Overview view' },
  { value: 'audit_log_view', label: 'Audit log view' },
];

// ── Action badge colours ──────────────────────────────────────────────────────
function actionBadgeColor(action: string): string {
  if (action === 'impersonation_start' || action === 'impersonation_end') return 'amber';
  if (action === 'role_change' || action === 'admin_add' || action === 'admin_remove') return 'teal';
  if (action === 'user_delete') return 'red';
  if (action === 'plan_change' || action === 'subscription_change') return 'blue';
  return 'muted';
}

// ── Impersonation detail ──────────────────────────────────────────────────────
function ImpersonationDetail({ log }: { log: AuditLogEntry }) {
  const isStart = log.action === 'impersonation_start';
  return (
    <div style={{ fontSize: '0.8rem', color: 'var(--color-amber)', marginTop: '0.25rem' }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>
        {isStart ? '→ Started' : '← Ended'} impersonating user {log.impersonatedUserId?.slice(0, 8) ?? '?'}…
      </span>
      {log.impersonating && (
        <span className="badge amber" style={{ marginLeft: '0.5rem', fontSize: '0.65rem' }}>
          during impersonation
        </span>
      )}
    </div>
  );
}

// ── Export to CSV ─────────────────────────────────────────────────────────────
function exportToCsv(logs: AuditLogEntry[]) {
  const headers = ['When', 'Admin ID', 'Action', 'Target Type', 'Target ID', 'Reason', 'IP Address', 'Impersonating', 'Impersonated User'];
  const rows = logs.map(log => [
    new Date(log.createdAt).toISOString(),
    log.adminId,
    log.action,
    log.targetType ?? '',
    log.targetId ?? '',
    (log.reason ?? '').replace(/"/g, '""'),
    log.ipAddress ?? '',
    String(log.impersonating),
    log.impersonatedUserId ?? '',
  ]);
  const csv = [headers, ...rows]
    .map(row => row.map(cell => `"${cell}"`).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `audit-log-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);

  // Filters
  const [action, setAction] = useState('');
  const [adminId, setAdminId] = useState('');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Admins list for filter dropdown
  const [admins, setAdmins] = useState<Admin[]>([]);

  const loadedLogsRef = useRef<AuditLogEntry[]>([]);

  const loadAdmins = useCallback(async () => {
    try {
      const res = await getAdmins();
      setAdmins(res.admins);
    } catch { /* non-critical */ }
  }, []);

  useEffect(() => { loadAdmins(); }, [loadAdmins]);

  const load = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const res = await getAuditLog({
        action: action || undefined,
        adminId: adminId || undefined,
        search: search || undefined,
        from: dateFrom || undefined,
        to: dateTo || undefined,
        page: String(p),
        limit: '50',
      });
      setLogs(res.logs);
      setPagination(res.pagination);
      loadedLogsRef.current = res.logs;
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [action, adminId, search, dateFrom, dateTo]);

  useEffect(() => { setPage(1); }, [action, adminId, search, dateFrom, dateTo]);
  useEffect(() => { load(page); }, [load, page]);

  async function handleExport() {
    if (loadedLogsRef.current.length === 0) return;
    setExporting(true);
    try {
      // Fetch all pages for export (up to 500 rows)
      const allLogs: AuditLogEntry[] = [];
      for (let p = 1; p <= Math.min((pagination?.totalPages ?? 1), 10); p++) {
        const res = await getAuditLog({
          action: action || undefined,
          adminId: adminId || undefined,
          search: search || undefined,
          from: dateFrom || undefined,
          to: dateTo || undefined,
          page: String(p),
          limit: '50',
        });
        allLogs.push(...res.logs);
        if (res.logs.length < 50) break;
      }
      exportToCsv(allLogs);
    } finally {
      setExporting(false);
    }
  }

  function clearFilters() {
    setAction('');
    setAdminId('');
    setSearch('');
    setDateFrom('');
    setDateTo('');
  }

  const hasFilters = action || adminId || search || dateFrom || dateTo;

  return (
    <>
      <div className="page-header">
        <h1>Audit Log</h1>
        <p>Immutable record of every admin action — newest first</p>
      </div>

      <div className="page-body">
        {/* ── Filters ── */}
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end' }}>
            {/* Action type */}
            <div className="form-group" style={{ minWidth: 160 }}>
              <label>Action</label>
              <select value={action} onChange={e => setAction(e.target.value)}>
                {ACTION_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            {/* Admin */}
            <div className="form-group" style={{ minWidth: 200 }}>
              <label>Admin</label>
              <select value={adminId} onChange={e => setAdminId(e.target.value)}>
                <option value="">All admins</option>
                {admins.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.email} {a.isOwner ? '(owner)' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Text search */}
            <div className="form-group" style={{ flex: 1, minWidth: 180 }}>
              <label>Search</label>
              <input
                type="text"
                placeholder="Reason, target ID, action…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>

            {/* Date from */}
            <div className="form-group" style={{ minWidth: 140 }}>
              <label>From</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
            </div>

            {/* Date to */}
            <div className="form-group" style={{ minWidth: 140 }}>
              <label>To</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button className="btn btn-sm btn-secondary" onClick={clearFilters} disabled={!hasFilters}>
                Clear
              </button>
              <button
                className="btn btn-sm btn-secondary"
                onClick={handleExport}
                disabled={exporting || logs.length === 0}
              >
                {exporting ? 'Exporting…' : 'Export CSV'}
              </button>
            </div>
          </div>

          {hasFilters && (
            <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--color-teal)' }}>
              Filters active — {pagination?.total ?? '?'} matching entries
            </div>
          )}
        </div>

        {error && <div className="login-error">{error}</div>}

        {/* ── Table ── */}
        <div className="data-table-wrap">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Admin</th>
                <th>Action</th>
                <th>Target</th>
                <th>Reason</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="loading">Loading…</td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={6} className="empty-state">
                  <p>No audit log entries match your filters.</p>
                </td></tr>
              ) : logs.map(log => (
                <React.Fragment key={log.id}>
                  <tr>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', whiteSpace: 'nowrap' }}>
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }} title={log.adminId}>
                      {log.adminId.slice(0, 8)}…
                    </td>
                    <td>
                      <span className={`badge ${actionBadgeColor(log.action)}`}
                            style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem' }}>
                        {log.action}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }} title={log.targetId ? `${log.targetType}:${log.targetId}` : undefined}>
                      {log.targetType && log.targetId ? `${log.targetType}:${String(log.targetId).slice(0, 10)}…` : '—'}
                    </td>
                    <td style={{ fontSize: '0.8rem', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={log.reason ?? undefined}>
                      {log.reason ?? <span style={{ color: 'var(--color-text-dim)' }}>—</span>}
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>
                      {log.ipAddress ?? '—'}
                    </td>
                  </tr>
                  {/* Expanded impersonation detail row */}
                  {(log.action === 'impersonation_start' || log.action === 'impersonation_end') && (
                    <tr>
                      <td colSpan={6} style={{ padding: '0.25rem 0.75rem', background: 'rgba(245,158,11,0.05)', borderTop: 'none' }}>
                        <ImpersonationDetail log={log} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── Pagination ── */}
        {pagination && (
          <div className="pagination">
            <span>Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)</span>
            <div className="pagination-btns">
              <button className="btn btn-sm btn-secondary" disabled={pagination.page <= 1} onClick={() => setPage(pagination.page - 1)}>← Prev</button>
              <button className="btn btn-sm btn-secondary" disabled={pagination.page >= pagination.totalPages} onClick={() => setPage(pagination.page + 1)}>Next →</button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
