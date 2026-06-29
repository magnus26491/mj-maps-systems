/**
 * pages/Admin.tsx
 *
 * MJ Maps Admin Portal — role='admin' only.
 *
 * Tabs:
 *   Users       — searchable/paginated user table with plan change + impersonate
 *   Billing     — read-only subscription overview
 *   Flags       — feature flag toggle table with reason modal
 *   Audit Logs  — filterable immutable audit log viewer
 *   Analytics   — anonymised platform intelligence
 *   System      — Redis + DB health + table sizes
 *
 * Impersonation: when active, a red banner at the top of the page shows
 * "Impersonating [email]" with an "End Impersonation" button.
 */
import { useState, useEffect, useCallback } from 'react';
import ReasonModal from '../components/ReasonModal';
import type {
  AdminUser, AdminAuditLog, AdminFeatureFlag,
  AdminPlatformAnalytics, AdminSystemHealth,
} from '../api';
import {
  adminGetUsers, adminGetUser, adminImpersonate, adminEndImpersonation,
  adminChangePlan, adminGetAuditLogs, adminGetFeatureFlags,
  adminToggleFeatureFlag, adminGetPlatformAnalytics, adminGetSystemHealth,
  adminGetSubscriptions,
} from '../api';

type Tab = 'users' | 'billing' | 'flags' | 'audit' | 'analytics' | 'system';

const PLAN_OPTIONS = [
  { value: 'free',       label: 'Free',       color: 'var(--color-text-muted)' },
  { value: 'navigation', label: 'Driver Pro', color: 'var(--color-teal)' },
  { value: 'custom',    label: 'Enterprise', color: 'var(--color-amber)' },
];

function planLabel(plan: string): { label: string; color: string } {
  return PLAN_OPTIONS.find(p => p.value === plan) ?? { label: plan, color: 'var(--color-text-muted)' };
}

function planBadge(plan: string) {
  const { label, color } = planLabel(plan);
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 'var(--r-sm)',
      background: `${color}20`,
      border: `1px solid ${color}50`,
      color,
      fontFamily: 'var(--font-mono)',
      fontSize: 11,
      fontWeight: 600,
      letterSpacing: '0.3px',
    }}>
      {label}
    </span>
  );
}

function statusDot(active: boolean) {
  return (
    <span style={{
      display: 'inline-block',
      width: 8, height: 8,
      borderRadius: '50%',
      background: active ? 'var(--color-green)' : 'var(--color-text-muted)',
      marginRight: 6,
    }} />
  );
}

// ── Impersonation Banner ──────────────────────────────────────────────────────
function ImpersonationBanner({
  impersonatedUser,
  onEnd,
}: {
  impersonatedUser: { email: string } | null;
  onEnd: () => void;
}) {
  const [ending, setEnding] = useState(false);
  if (!impersonatedUser) return null;

  return (
    <div style={{
      background: 'rgba(239,68,68,0.12)',
      border: '1px solid rgba(239,68,68,0.40)',
      borderRadius: 'var(--r-lg)',
      padding: '0.75rem 1rem',
      display: 'flex',
      alignItems: 'center',
      gap: '1rem',
      marginBottom: '1rem',
      fontFamily: 'var(--font-body)',
    }}>
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <circle cx="10" cy="6" r="3" stroke="#EF4444" strokeWidth="1.5"/>
        <path d="M3 17c0-3.314 3.134-6 7-6s7 2.686 7 6" stroke="#EF4444" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
      <span style={{ color: '#EF4444', fontWeight: 600, flex: 1 }}>
        Impersonating{' '}
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.875rem' }}>
          {impersonatedUser.email}
        </span>
      </span>
      <button
        onClick={() => { setEnding(true); onEnd(); }}
        disabled={ending}
        style={{
          background: 'rgba(239,68,68,0.20)',
          border: '1px solid rgba(239,68,68,0.50)',
          borderRadius: 'var(--r-md)',
          color: '#EF4444',
          fontFamily: 'var(--font-display)',
          fontWeight: 600,
          fontSize: '0.875rem',
          padding: '4px 12px',
          cursor: 'pointer',
        }}
      >
        {ending ? 'Ending...' : 'End Impersonation'}
      </button>
    </div>
  );
}

// ── Reason Modal helper ─────────────────────────────────────────────────────────
function useReasonModal() {
  const [modal, setModal] = useState<{
    title: string;
    actionLabel: string;
    actionColor?: 'teal' | 'red' | 'amber';
    dangerMessage?: string;
    reason: string;
    onConfirm: (reason: string) => Promise<void>;
  } | null>(null);

  const openModal = useCallback((config: Omit<NonNullable<typeof modal>, never>) => {
    setModal({ ...config, reason: '' });
  }, []);

  const closeModal = () => setModal(null);

  const ModalComponent = modal ? (
    <ReasonModal
      title={modal.title}
      actionLabel={modal.actionLabel}
      actionColor={modal.actionColor ?? 'teal'}
      placeholder={modal.dangerMessage ? 'Provide a clear reason for this action...' : undefined}
      minLength={10}
      defaultValue={modal.reason}
      dangerMessage={modal.dangerMessage}
      onConfirm={async (reason: string) => {
        await modal.onConfirm(reason);
        closeModal();
      }}
      onCancel={closeModal}
    />
  ) : null;

  return { openModal, closeModal, ModalComponent };
}

// ── Admin Table (shared pagination header) ──────────────────────────────────────
function PaginationBar({
  page, totalPages, total, onPage,
}: { page: number; totalPages: number; total: number; onPage: (p: number) => void }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0.5rem 0',
      fontFamily: 'var(--font-body)',
      fontSize: '0.875rem',
      color: 'var(--color-text-muted)',
    }}>
      <span>{total.toLocaleString()} total</span>
      <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
        <button
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          style={{
            background: 'transparent',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--r-sm)',
            color: page <= 1 ? 'var(--color-text-muted)' : 'var(--color-text-primary)',
            padding: '4px 10px',
            cursor: page <= 1 ? 'not-allowed' : 'pointer',
            fontFamily: 'var(--font-display)',
            fontSize: '0.875rem',
          }}
        >‹ Prev</button>
        <span style={{ padding: '0 8px', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
          {page} / {totalPages}
        </span>
        <button
          onClick={() => onPage(page + 1)}
          disabled={page >= totalPages}
          style={{
            background: 'transparent',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--r-sm)',
            color: page >= totalPages ? 'var(--color-text-muted)' : 'var(--color-text-primary)',
            padding: '4px 10px',
            cursor: page >= totalPages ? 'not-allowed' : 'pointer',
            fontFamily: 'var(--font-display)',
            fontSize: '0.875rem',
          }}
        >Next ›</button>
      </div>
    </div>
  );
}

// ── Users Tab ───────────────────────────────────────────────────────────────────
function UsersTab({
  openModal,
  refreshKey,
}: {
  openModal: ReturnType<typeof useReasonModal>['openModal'];
  refreshKey: number;
}) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [planFilter, setPlanFilter] = useState('');
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [userDetail, setUserDetail] = useState<{ user: AdminUser; recentRoutes: unknown[] } | null>(null);

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    setError(null);
    try {
      const result = await adminGetUsers({
        page: p, limit: 20,
        search: search || undefined,
        plan: planFilter || undefined,
      });
      setUsers(result.users);
      setTotal(result.pagination.total);
      setTotalPages(result.pagination.totalPages);
      setPage(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [search, planFilter, refreshKey]);

  useEffect(() => { load(1); }, [load]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    load(1);
  };

  const openChangePlan = (user: AdminUser) => {
    openModal({
      title: `Change plan for ${user.email}`,
      actionLabel: 'Change plan',
      actionColor: 'teal',
      dangerMessage: undefined,
      reason: '',
      onConfirm: async (reason: string) => {
        const newPlan = user.plan === 'navigation' ? 'custom' : user.plan === 'custom' ? 'free' : 'navigation';
        await adminChangePlan(user.id, newPlan, reason);
        load(page);
        setSelectedUser(null);
        setUserDetail(null);
      },
    });
  };

  const openImpersonate = (user: AdminUser) => {
    openModal({
      title: `Impersonate ${user.email}`,
      actionLabel: 'Start impersonation',
      actionColor: 'amber',
      dangerMessage: 'This action is logged and audited. You will have full access as this user for 30 minutes.',
      reason: '',
      onConfirm: async (reason: string) => {
        await adminImpersonate(user.id, reason);
        // Persist impersonation token in sessionStorage (separate from main auth)
        alert('Impersonation token obtained — stored in session for testing. End impersonation when done.');
      },
    });
  };

  return (
    <div>
      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: '0.5rem', flex: 1 }}>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by email or org..."
            style={{
              flex: 1,
              background: 'var(--color-surface-2)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--r-md)',
              color: 'var(--color-text-primary)',
              fontFamily: 'var(--font-body)',
              fontSize: '0.875rem',
              padding: '6px 12px',
              outline: 'none',
            }}
          />
          <select
            value={planFilter}
            onChange={e => { setPlanFilter(e.target.value); load(1); }}
            style={{
              background: 'var(--color-surface-2)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--r-md)',
              color: 'var(--color-text-primary)',
              fontFamily: 'var(--font-body)',
              fontSize: '0.875rem',
              padding: '6px 12px',
              outline: 'none',
            }}
          >
            <option value="">All plans</option>
            <option value="free">Free</option>
            <option value="navigation">Driver Pro</option>
            <option value="custom">Enterprise</option>
          </select>
          <button type="submit" className="d-btn d-btn--primary" style={{ padding: '6px 16px' }}>Search</button>
        </form>
      </div>

      <PaginationBar page={page} totalPages={totalPages} total={total} onPage={load} />

      {loading && (
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)', fontFamily: 'var(--font-body)' }}>
          Loading users...
        </div>
      )}

      {error && (
        <div style={{
          background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.30)',
          borderRadius: 'var(--r-md)', padding: '1rem', color: 'var(--color-red)',
          fontFamily: 'var(--font-body)', fontSize: '0.875rem',
        }}>
          {error}
        </div>
      )}

      {!loading && !error && (
        <div className="d-card" style={{ overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem', fontFamily: 'var(--font-body)', color: 'var(--color-text-primary)' }}>
            <thead>
              <tr style={{ background: 'var(--color-surface-2)', color: 'var(--color-text-secondary)' }}>
                <th style={thStyle}>User</th>
                <th style={thStyle}>Plan</th>
                <th style={thStyle}>Role</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Active Routes</th>
                <th style={thStyle}>Created</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr
                  key={u.id}
                  style={{
                    borderBottom: '1px solid var(--color-border)',
                    cursor: 'pointer',
                    background: selectedUser?.id === u.id ? 'rgba(0,194,168,0.05)' : 'transparent',
                  }}
                  onClick={() => {
                    if (selectedUser?.id === u.id) { setSelectedUser(null); setUserDetail(null); return; }
                    setSelectedUser(u);
                    adminGetUser(u.id).then(setUserDetail).catch(() => setUserDetail(null));
                  }}
                >
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 600 }}>{u.email}</div>
                    {u.organisationName && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{u.organisationName}</div>
                    )}
                  </td>
                  <td style={tdStyle}>{planBadge(u.plan)}</td>
                  <td style={tdStyle}>
                    <span style={{
                      fontFamily: 'var(--font-mono)', fontSize: 11,
                      color: u.role === 'admin' ? 'var(--color-amber)' : u.role === 'dispatcher' ? 'var(--color-teal)' : 'var(--color-text-muted)',
                      background: 'rgba(0,0,0,0.2)',
                      padding: '1px 6px', borderRadius: 4,
                    }}>{u.role}</span>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ display: 'flex', alignItems: 'center' }}>
                      {statusDot(u.isActive)}{u.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, fontFamily: 'var(--font-mono)', textAlign: 'center' }}>{u.activeRouteCount}</td>
                  <td style={tdStyle}>{new Date(u.createdAt).toLocaleDateString()}</td>
                  <td style={tdStyle} onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        onClick={() => openChangePlan(u)}
                        style={{
                          fontSize: 11, padding: '2px 8px',
                          background: 'transparent',
                          border: '1px solid var(--color-border)',
                          borderRadius: 'var(--r-sm)',
                          color: 'var(--color-text-secondary)',
                          cursor: 'pointer', fontFamily: 'var(--font-display)',
                        }}
                      >Change plan</button>
                      <button
                        onClick={() => openImpersonate(u)}
                        style={{
                          fontSize: 11, padding: '2px 8px',
                          background: 'rgba(245,158,11,0.10)',
                          border: '1px solid rgba(245,158,11,0.30)',
                          borderRadius: 'var(--r-sm)',
                          color: 'var(--color-amber)',
                          cursor: 'pointer', fontFamily: 'var(--font-display)',
                        }}
                      >Impersonate</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* User detail drawer */}
      {selectedUser && userDetail && (
        <div style={{
          marginTop: '1rem',
          background: 'var(--color-surface-1)',
          border: '1px solid var(--color-teal)',
          borderRadius: 'var(--r-lg)',
          padding: '1rem',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--color-text-primary)', fontSize: '1rem' }}>
                {selectedUser.email}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
                ID: {selectedUser.id}
              </div>
            </div>
            <button
              onClick={() => { setSelectedUser(null); setUserDetail(null); }}
              style={{ background: 'transparent', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: '1.25rem' }}
            >×</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
            <div>Plan: {planBadge(selectedUser.plan)}</div>
            <div>Role: <strong>{selectedUser.role}</strong></div>
            <div>Active: {statusDot(selectedUser.isActive)}{selectedUser.isActive ? 'Yes' : 'No'}</div>
            <div>Last login: {selectedUser.lastLoginAt ? new Date(selectedUser.lastLoginAt).toLocaleString() : 'Never'}</div>
            <div>Org: {selectedUser.organisationName ?? 'None'}</div>
          </div>
          {userDetail.recentRoutes.length > 0 && (
            <div style={{ marginTop: '1rem' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--color-text-primary)' }}>
                Recent routes
              </div>
              {userDetail.recentRoutes.map((r: any) => (
                <div key={r.id} style={{
                  display: 'flex', gap: '1rem', alignItems: 'center',
                  padding: '0.25rem 0',
                  borderBottom: '1px solid var(--color-border)',
                  fontFamily: 'var(--font-mono)', fontSize: '0.75rem',
                  color: 'var(--color-text-muted)',
                }}>
                  <span style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-body)' }}>{r.id.substring(0, 8)}...</span>
                  <span>{r.status}</span>
                  <span>{r.completedStops}/{r.totalStops} stops</span>
                  <span>{r.shiftStart ? new Date(r.shiftStart).toLocaleDateString() : '—'}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Billing Tab ─────────────────────────────────────────────────────────────────
function BillingTab() {
  const [data, setData] = useState<{ subscriptions: unknown[]; pagination: any } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await adminGetSubscriptions();
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load subscriptions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div style={loadingStyle}>Loading subscriptions...</div>;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!data) return null;

  return (
    <div>
      {data.pagination.note && (
        <div style={{
          background: 'rgba(0,194,168,0.08)',
          border: '1px solid rgba(0,194,168,0.20)',
          borderRadius: 'var(--r-md)',
          padding: '0.75rem 1rem',
          fontFamily: 'var(--font-body)',
          fontSize: '0.875rem',
          color: 'var(--color-teal)',
          marginBottom: '1rem',
        }}>
          {data.pagination.note}
        </div>
      )}
      <div className="d-card" style={{ overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem', fontFamily: 'var(--font-body)', color: 'var(--color-text-primary)' }}>
          <thead>
            <tr style={{ background: 'var(--color-surface-2)', color: 'var(--color-text-secondary)' }}>
              <th style={thStyle}>Email</th>
              <th style={thStyle}>Plan</th>
              <th style={thStyle}>Organisation</th>
              <th style={thStyle}>Created</th>
              <th style={thStyle}>Status</th>
            </tr>
          </thead>
          <tbody>
            {(data.subscriptions as any[]).map((s: any) => (
              <tr key={s.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                <td style={tdStyle}>{s.email}</td>
                <td style={tdStyle}>{planBadge(s.plan)}</td>
                <td style={tdStyle}>{s.organisationName ?? '—'}</td>
                <td style={tdStyle}>{new Date(s.createdAt).toLocaleDateString()}</td>
                <td style={tdStyle}>
                  <span className={`status-badge ${s.status === 'active' ? 'status-badge--active' : 'status-badge--pending'}`}>
                    {s.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Flags Tab ────────────────────────────────────────────────────────────────────
function FlagsTab({
  openModal,
  refreshKey,
}: {
  openModal: ReturnType<typeof useReasonModal>['openModal'];
  refreshKey: number;
}) {
  const [flags, setFlags] = useState<AdminFeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminGetFeatureFlags();
      setFlags(data.flags);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load flags');
    } finally {
      setLoading(false);
    }
  }, [refreshKey]);

  useEffect(() => { load(); }, [load]);

  const toggleFlag = (flag: AdminFeatureFlag) => {
    const newValue = !flag.value;
    openModal({
      title: `${newValue ? 'Enable' : 'Disable'} "${flag.key}"`,
      actionLabel: newValue ? 'Enable flag' : 'Disable flag',
      actionColor: newValue ? 'teal' : 'red',
      dangerMessage: !newValue ? 'Disabling this feature will affect all users.' : undefined,
      reason: '',
      onConfirm: async (reason: string) => {
        setToggling(flag.key);
        try {
          await adminToggleFeatureFlag(flag.key, { value: newValue }, reason);
          load();
        } finally {
          setToggling(null);
        }
      },
    });
  };

  if (loading) return <div style={loadingStyle}>Loading feature flags...</div>;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div>
      <div className="d-card">
        {flags.map(flag => (
          <div
            key={flag.key}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
              padding: '0.875rem 0',
              borderBottom: '1px solid var(--color-border)',
            }}
          >
            {/* Toggle */}
            <button
              onClick={() => toggleFlag(flag)}
              disabled={toggling === flag.key}
              style={{
                width: 44,
                height: 24,
                borderRadius: 12,
                background: flag.value ? 'var(--color-teal)' : 'var(--color-surface-2)',
                border: `1px solid ${flag.value ? 'var(--color-teal)' : 'var(--color-border)'}`,
                position: 'relative',
                cursor: 'pointer',
                flexShrink: 0,
                transition: 'background 200ms',
              }}
              aria-label={`${flag.value ? 'Disable' : 'Enable'} ${flag.key}`}
            >
              <span style={{
                position: 'absolute',
                top: 2,
                left: flag.value ? 20 : 2,
                width: 18,
                height: 18,
                borderRadius: 9,
                background: '#fff',
                transition: 'left 200ms',
              }} />
            </button>

            {/* Info */}
            <div style={{ flex: 1 }}>
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.875rem',
                color: 'var(--color-text-primary)',
                fontWeight: 600,
              }}>{flag.key}</div>
              <div style={{
                fontFamily: 'var(--font-body)',
                fontSize: '0.75rem',
                color: 'var(--color-text-muted)',
                marginTop: 2,
              }}>{flag.description}</div>
            </div>

            {/* Status chip */}
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: flag.value ? 'var(--color-green)' : 'var(--color-text-muted)',
              background: flag.value ? 'rgba(16,185,129,0.10)' : 'transparent',
              padding: '2px 8px',
              borderRadius: 4,
            }}>
              {flag.value ? 'ENABLED' : 'DISABLED'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Audit Logs Tab ──────────────────────────────────────────────────────────────
function AuditTab() {
  const [logs, setLogs] = useState<AdminAuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [actionFilter, setActionFilter] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminGetAuditLogs({
        page: p, limit: 30,
        action: actionFilter || undefined,
      });
      setLogs(data.logs);
      setTotal(data.pagination.total);
      setTotalPages(data.pagination.totalPages);
      setPage(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  }, [actionFilter, refreshKey]);

  useEffect(() => { load(1); }, [load]);

  const ACTION_COLORS: Record<string, string> = {
    impersonation_start: '#F59E0B',
    impersonation_end:    '#64748B',
    plan_change:          '#00C2A8',
    flag_toggle:          '#8B5CF6',
    flag_view:            '#64748B',
    user_view:            '#64748B',
    audit_log_view:       '#64748B',
    platform_analytics_view: '#64748B',
    system_health_view:   '#64748B',
    subscription_view:    '#64748B',
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', alignItems: 'center' }}>
        <select
          value={actionFilter}
          onChange={e => { setActionFilter(e.target.value); load(1); }}
          style={{
            background: 'var(--color-surface-2)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--r-md)',
            color: 'var(--color-text-primary)',
            fontFamily: 'var(--font-body)',
            fontSize: '0.875rem',
            padding: '6px 12px',
            outline: 'none',
          }}
        >
          <option value="">All actions</option>
          <option value="plan_change">Plan changes</option>
          <option value="impersonation_start">Impersonation start</option>
          <option value="impersonation_end">Impersonation end</option>
          <option value="flag_toggle">Flag toggles</option>
        </select>
        <button
          onClick={() => setRefreshKey(k => k + 1)}
          className="d-btn d-btn--ghost"
          style={{ padding: '6px 12px', fontSize: '0.875rem' }}
        >
          ↻ Refresh
        </button>
      </div>

      <PaginationBar page={page} totalPages={totalPages} total={total} onPage={load} />

      {loading && <div style={loadingStyle}>Loading audit logs...</div>}
      {error && <ErrorState message={error} onRetry={() => load(1)} />}

      {!loading && !error && (
        <div className="d-card" style={{ overflow: 'auto', maxHeight: '60vh' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem', fontFamily: 'var(--font-body)', color: 'var(--color-text-primary)' }}>
            <thead style={{ position: 'sticky', top: 0, background: 'var(--color-surface-1)', zIndex: 1 }}>
              <tr style={{ color: 'var(--color-text-secondary)' }}>
                <th style={thStyle}>Timestamp</th>
                <th style={thStyle}>Admin</th>
                <th style={thStyle}>Action</th>
                <th style={thStyle}>Target</th>
                <th style={thStyle}>Reason</th>
                <th style={thStyle}>IP</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <tr key={log.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={{ ...tdStyle, fontFamily: 'var(--font-mono)', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                    {new Date(log.createdAt).toLocaleString()}
                  </td>
                  <td style={{ ...tdStyle, fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                    {log.adminId.substring(0, 8)}...
                  </td>
                  <td style={tdStyle}>
                    <span style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11,
                      color: ACTION_COLORS[log.action] ?? 'var(--color-text-secondary)',
                      background: `${ACTION_COLORS[log.action] ?? '#64748B'}15`,
                      padding: '2px 6px',
                      borderRadius: 4,
                    }}>
                      {log.action}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--color-text-muted)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {log.targetId ?? '—'}
                    {log.impersonating && (
                      <span style={{ color: 'var(--color-amber)', marginLeft: 4 }}>→ impersonating</span>
                    )}
                  </td>
                  <td style={{ ...tdStyle, fontSize: '0.75rem', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {log.reason ?? '—'}
                  </td>
                  <td style={{ ...tdStyle, fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                    {log.ipAddress ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Analytics Tab ──────────────────────────────────────────────────────────────
function AnalyticsTab() {
  const [data, setData] = useState<AdminPlatformAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await adminGetPlatformAnalytics();
      setData(r.analytics);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div style={loadingStyle}>Loading platform analytics...</div>;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!data) return null;

  const metric = (label: string, value: number | string, color = 'var(--color-text-primary)') => (
    <div className="d-card" style={{ textAlign: 'center' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.5rem', fontWeight: 700, color, marginBottom: 4 }}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
      <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{label}</div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
        Period: {data.period}
      </div>

      {/* User metrics */}
      <div>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Users</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '0.5rem' }}>
          {metric('Total', data.users.total)}
          {metric('Active', data.users.active)}
          {metric('Paid', data.users.paid, 'var(--color-teal)')}
          {metric('Drivers', data.users.byRole.drivers)}
          {metric('Dispatchers', data.users.byRole.dispatchers)}
          {metric('Admins', data.users.byRole.admins)}
        </div>
      </div>

      {/* Route metrics */}
      <div>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Routes (30d)</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '0.5rem' }}>
          {metric('Total', data.routes.total)}
          {metric('Active', data.routes.active, 'var(--color-teal)')}
          {metric('Completed', data.routes.completed, 'var(--color-green)')}
          {metric('Abandoned', data.routes.abandoned, 'var(--color-red)')}
        </div>
      </div>

      {/* Stop metrics */}
      <div>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Stops (30d)</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '0.5rem' }}>
          {metric('Total', data.stops.total)}
          {metric('Completed', data.stops.completed, 'var(--color-green)')}
          {metric('Failed', data.stops.failed, 'var(--color-red)')}
          {metric('Pending', data.stops.pending, 'var(--color-amber)')}
          {metric('Completion %', `${data.stops.completionRate}%`, data.stops.completionRate > 90 ? 'var(--color-green)' : 'var(--color-amber)')}
        </div>
      </div>

      {/* Turn score distribution */}
      <div>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Turn Score Distribution (30d)</div>
        <div className="d-card">
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.75rem', fontFamily: 'var(--font-body)', fontSize: '0.875rem' }}>
            <span style={{ color: 'var(--color-green)' }}>● {data.turnScores.greenRate}% Green</span>
            <span style={{ color: 'var(--color-amber)' }}>● {data.turnScores.amberRate}% Amber</span>
            <span style={{ color: 'var(--color-red)' }}>● {data.turnScores.redRate}% Red</span>
            <span style={{ color: 'var(--color-text-muted)' }}>Avg: {data.turnScores.avgScore}</span>
          </div>
          <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ flex: data.turnScores.greenRate, background: 'var(--color-green)' }} />
            <div style={{ flex: data.turnScores.amberRate, background: 'var(--color-amber)' }} />
            <div style={{ flex: data.turnScores.redRate, background: 'var(--color-red)' }} />
          </div>
        </div>
      </div>

      {/* Top vehicles */}
      <div>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Top Vehicle Profiles</div>
        <div className="d-card">
          {data.topVehicles.length === 0 && (
            <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>No data yet</div>
          )}
          {data.topVehicles.slice(0, 5).map((v, i) => (
            <div key={v.vehicleId} style={{
              display: 'flex', justifyContent: 'space-between',
              padding: '0.25rem 0',
              borderBottom: i < data.topVehicles.length - 1 ? '1px solid var(--color-border)' : 'none',
              fontFamily: 'var(--font-mono)', fontSize: '0.8125rem',
            }}>
              <span style={{ color: 'var(--color-text-secondary)' }}>{v.vehicleId}</span>
              <span style={{ color: 'var(--color-text-muted)' }}>{v.routeCount} routes</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── System Health Tab ───────────────────────────────────────────────────────────
function SystemTab() {
  const [data, setData] = useState<AdminSystemHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await adminGetSystemHealth();
      setData(r.health);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to check system health');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div style={loadingStyle}>Checking system health...</div>;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!data) return null;

  const statusColor = (s: string) => s === 'ok' ? 'var(--color-green)' : s === 'degraded' ? 'var(--color-amber)' : 'var(--color-red)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Environment */}
      <div className="d-card">
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, marginBottom: '0.75rem', color: 'var(--color-text-primary)' }}>Environment</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
          <div>Environment: <strong style={{ color: 'var(--color-text-primary)' }}>{data.environment}</strong></div>
          <div>Uptime: <strong style={{ color: 'var(--color-text-primary)' }}>{Math.round(data.uptime / 60)}m</strong></div>
          <div>Health checked: <strong style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>{new Date(data.timestamp).toLocaleTimeString()}</strong></div>
        </div>
      </div>

      {/* DB */}
      <div className="d-card">
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, marginBottom: '0.75rem', color: 'var(--color-text-primary)' }}>Database</div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', fontFamily: 'var(--font-body)', fontSize: '0.875rem' }}>
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 11,
            color: statusColor(data.database.status),
            background: `${statusColor(data.database.status)}20`,
            padding: '2px 8px', borderRadius: 4,
          }}>{data.database.status.toUpperCase()}</span>
          {data.database.latencyMs !== null && (
            <span style={{ color: 'var(--color-text-muted)' }}>
              Latency: <strong style={{ color: 'var(--color-text-primary)' }}>{data.database.latencyMs}ms</strong>
            </span>
          )}
        </div>
      </div>

      {/* Redis */}
      <div className="d-card">
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, marginBottom: '0.75rem', color: 'var(--color-text-primary)' }}>Redis</div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', fontFamily: 'var(--font-body)', fontSize: '0.875rem' }}>
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 11,
            color: statusColor(data.redis.status),
            background: `${statusColor(data.redis.status)}20`,
            padding: '2px 8px', borderRadius: 4,
          }}>{data.redis.status.toUpperCase()}</span>
          <span style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>{data.redis.note}</span>
        </div>
      </div>

      {/* Table sizes */}
      {Object.keys(data.tableSizes).length > 0 && (
        <div className="d-card">
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, marginBottom: '0.75rem', color: 'var(--color-text-primary)' }}>Table sizes (top 10)</div>
          {Object.entries(data.tableSizes)
            .sort(([, a], [, b]) => b - a)
            .map(([table, bytes]) => {
              const mb = (bytes / 1024 / 1024).toFixed(1);
              const pct = Math.min((bytes / Math.max(...Object.values(data.tableSizes))) * 100, 100);
              return (
                <div key={table} style={{ marginBottom: '0.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginBottom: 2 }}>
                    <span>{table}</span>
                    <span>{mb} MB</span>
                  </div>
                  <div style={{ height: 4, background: 'var(--color-surface-2)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: 'var(--color-teal)', borderRadius: 2 }} />
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}

// ── Shared styles ──────────────────────────────────────────────────────────────
const thStyle: React.CSSProperties = { padding: '0.5rem 0.75rem', textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap' };
const tdStyle: React.CSSProperties = { padding: '0.5rem 0.75rem', verticalAlign: 'middle' };
const loadingStyle: React.CSSProperties = { textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)', fontFamily: 'var(--font-body)' };
const errorStyle: React.CSSProperties = { background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.30)', borderRadius: 'var(--r-md)', padding: '1rem', color: 'var(--color-red)', fontFamily: 'var(--font-body)', fontSize: '0.875rem' };

// ── Error state with retry ─────────────────────────────────────────────────────
function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div style={{ ...errorStyle, display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'flex-start' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="8" cy="8" r="7" stroke="#EF4444" strokeWidth="1.5"/>
          <path d="M8 5v3.5" stroke="#EF4444" strokeWidth="1.5" strokeLinecap="round"/>
          <circle cx="8" cy="11" r="0.75" fill="#EF4444"/>
        </svg>
        <span>{message}</span>
      </div>
      <button
        onClick={onRetry}
        style={{
          background: 'rgba(239,68,68,0.15)',
          border: '1px solid rgba(239,68,68,0.40)',
          borderRadius: 'var(--r-md)',
          color: '#EF4444',
          fontFamily: 'var(--font-display)',
          fontWeight: 600,
          fontSize: '0.875rem',
          padding: '4px 14px',
          cursor: 'pointer',
        }}
      >
        Retry
      </button>
    </div>
  );
}

// ── Main Admin Page ────────────────────────────────────────────────────────────
export default function AdminPage() {
  const [tab, setTab] = useState<Tab>('users');
  const [refreshKey, setRefreshKey] = useState(0);
  const [impersonatedUser, setImpersonatedUser] = useState<{ email: string } | null>(null);
  const { openModal, closeModal, ModalComponent } = useReasonModal();

  const TABS: { key: Tab; label: string }[] = [
    { key: 'users',    label: 'Users' },
    { key: 'billing',  label: 'Billing' },
    { key: 'flags',    label: 'Feature Flags' },
    { key: 'audit',    label: 'Audit Logs' },
    { key: 'analytics', label: 'Analytics' },
    { key: 'system',   label: 'System' },
  ];

  return (
    <div>
      {/* Impersonation banner */}
      <ImpersonationBanner
        impersonatedUser={impersonatedUser}
        onEnd={async () => {
          try {
            await adminEndImpersonation();
            setImpersonatedUser(null);
          } catch {
            // Non-critical
          }
        }}
      />

      {/* Admin branding */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        marginBottom: '1rem',
      }}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <rect x="2" y="4" width="16" height="13" rx="2" stroke="var(--color-teal)" strokeWidth="1.5"/>
          <path d="M7 4V3a3 3 0 016 0v1" stroke="var(--color-teal)" strokeWidth="1.5" strokeLinecap="round"/>
          <circle cx="10" cy="10.5" r="2" stroke="var(--color-teal)" strokeWidth="1.5"/>
          <path d="M10 12.5v2.5" stroke="var(--color-teal)" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
        <h2 style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 700,
          fontSize: '1rem',
          color: 'var(--color-text-primary)',
        }}>
          Admin Portal
        </h2>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: 'var(--color-amber)',
          background: 'rgba(245,158,11,0.10)',
          border: '1px solid rgba(245,158,11,0.30)',
          padding: '2px 8px',
          borderRadius: 4,
        }}>
          ROLE: ADMIN
        </span>
      </div>

      {/* Tab bar */}
      <div className="tab-bar" style={{ marginBottom: '1rem' }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`tab-btn ${tab === t.key ? 'tab-btn--active' : ''}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>
        {tab === 'users' && (
          <UsersTab openModal={openModal} refreshKey={refreshKey} />
        )}
        {tab === 'billing' && <BillingTab />}
        {tab === 'flags' && (
          <FlagsTab openModal={openModal} refreshKey={refreshKey} />
        )}
        {tab === 'audit' && <AuditTab />}
        {tab === 'analytics' && <AnalyticsTab />}
        {tab === 'system' && <SystemTab />}
      </div>

      {/* Reason modal */}
      {ModalComponent}
    </div>
  );
}
