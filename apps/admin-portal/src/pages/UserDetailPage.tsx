// src/pages/UserDetailPage.tsx
import React, { useEffect, useState, FormEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getUser, updateUser, changeSubscription, changeRole, isOwner } from '../api';
import type { User } from '../types';

function ConfirmModal({ title, children, onConfirm, onCancel, confirmLabel = 'Confirm', danger = false }: {
  title: string; children: React.ReactNode; onConfirm: () => void; onCancel: () => void;
  confirmLabel?: string; danger?: boolean;
}) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header"><h2>{title}</h2><button className="modal-close" onClick={onCancel}>×</button></div>
        {children}
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

function ReasonForm({ onSubmit }: { onSubmit: (reason: string) => void }) {
  const [reason, setReason] = useState('');
  return (
    <>
      <div className="form-group">
        <label>Reason for this action (min 10 characters)</label>
        <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} placeholder="Describe why you're making this change…" />
      </div>
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={() => setReason('')}>Clear</button>
        <button className="btn btn-primary" disabled={reason.length < 10} onClick={() => { onSubmit(reason); setReason(''); }}>Save</button>
      </div>
    </>
  );
}

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'profile' | 'subscription' | 'role'>('profile');

  // Modal state
  const [modal, setModal] = useState<React.ReactNode>(null);
  const [saving, setSaving] = useState(false);

  // Subscription form state
  const [subPlanId, setSubPlanId] = useState('');
  const [trialDays, setTrialDays] = useState('');
  const [compMonths, setCompMonths] = useState('');
  const [cancelNow, setCancelNow] = useState(false);

  const owner = isOwner();

  useEffect(() => {
    if (!id) return;
    getUser(id)
      .then(r => { setUser(r.user); setSubPlanId(r.user.planId); })
      .catch((e: Error) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [id]);

  function showModal(node: React.ReactNode) { setModal(node); }
  function closeModal() { setModal(null); }

  async function handleSaveProfile(reason: string) {
    if (!id || !user) return;
    setSaving(true);
    try {
      await updateUser(id, { isActive: user.isActive, reason });
      closeModal();
    } catch (e: unknown) {
      alert((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive() {
    if (!user) return;
    showModal(
      <ConfirmModal
        title={user.isActive ? 'Deactivate User?' : 'Activate User?'}
        onConfirm={async () => {
          if (!id) return;
          setSaving(true);
          closeModal();
          try {
            await updateUser(id, { isActive: !user.isActive, reason: 'Toggled via admin portal' });
            setUser(u => u ? { ...u, isActive: !u.isActive } : u);
          } catch (e: unknown) {
            alert((e as Error).message);
          } finally {
            setSaving(false);
          }
        }}
        onCancel={closeModal}
        confirmLabel={user.isActive ? 'Deactivate' : 'Activate'}
        danger={user.isActive}
      >
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
          {user.isActive
            ? 'This user will immediately lose access to the platform. They can be reactivated at any time.'
            : 'This user will regain access immediately.'}
        </p>
      </ConfirmModal>
    );
  }

  async function handleSaveSubscription(reason: string) {
    if (!id) return;
    setSaving(true);
    closeModal();
    try {
      await changeSubscription(id, {
        planId: subPlanId || undefined,
        trialDays: trialDays ? parseInt(trialDays) : undefined,
        compMonths: compMonths ? parseInt(compMonths) : undefined,
        cancelAtPeriodEnd: cancelNow || undefined,
        reason,
      });
      setTrialDays('');
      setCompMonths('');
      setCancelNow(false);
      // Reload user
      const r = await getUser(id);
      setUser(r.user);
    } catch (e: unknown) {
      alert((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleChangeRole(role: string) {
    if (!id) return;
    showModal(
      <ConfirmModal
        title={`Change role to ${role}?`}
        onConfirm={async () => {
          closeModal();
          const reason = `Role change to ${role} via admin portal`;
          try {
            await changeRole(id, role, reason);
            const r = await getUser(id);
            setUser(r.user);
          } catch (e: unknown) {
            alert((e as Error).message);
          }
        }}
        onCancel={closeModal}
        confirmLabel={`Change to ${role}`}
      >
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
          {role === 'driver' ? 'This admin will be demoted to driver and deactivated.' :
           role === 'dispatcher' ? 'This user will become a dispatcher.' :
           'This user will become an admin.'}
        </p>
      </ConfirmModal>
    );
  }

  if (loading) return <div className="loading">Loading…</div>;
  if (error) return <div className="page-body"><div className="login-error">{error}</div></div>;
  if (!user) return null;

  return (
    <>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <button className="btn btn-sm btn-secondary" onClick={() => navigate('/users')} style={{ marginBottom: '0.5rem' }}>
              ← Users
            </button>
            <h1>{user.email}</h1>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--color-text-dim)' }}>{user.id}</p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {user.isActive
              ? <span className="badge green">Active</span>
              : <span className="badge muted">Inactive</span>}
            {user.isOwner && <span className="badge owner">Owner</span>}
          </div>
        </div>
      </div>

      <div className="page-body">
        <div className="tabs">
          <button className={`tab-btn${activeTab === 'profile' ? ' active' : ''}`} onClick={() => setActiveTab('profile')}>Profile</button>
          <button className={`tab-btn${activeTab === 'subscription' ? ' active' : ''}`} onClick={() => setActiveTab('subscription')}>Subscription</button>
          {owner && <button className={`tab-btn${activeTab === 'role' ? ' active' : ''}`} onClick={() => setActiveTab('role')}>Role & Access</button>}
        </div>

        {/* Profile tab */}
        {activeTab === 'profile' && (
          <div className="grid-2">
            <div className="card">
              <div className="card-title">Account Details</div>
              <table>
                <tbody>
                  <tr><td>Role</td><td><strong>{user.role}</strong></td></tr>
                  <tr><td>Plan</td><td>{user.planId}</td></tr>
                  <tr><td>Plan Status</td><td>{user.planStatus}</td></tr>
                  <tr><td>Organisation</td><td>{user.organisationName ?? '—'}</td></tr>
                  <tr><td>Joined</td><td>{new Date(user.createdAt).toLocaleDateString()}</td></tr>
                  <tr><td>Last Login</td><td>{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : '—'}</td></tr>
                </tbody>
              </table>
            </div>

            <div className="card">
              <div className="card-title">Account Actions</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>Account Status</div>
                  <button
                    className={`btn ${user.isActive ? 'btn-danger' : 'btn-primary'} btn-sm`}
                    onClick={handleToggleActive}
                    disabled={user.isOwner}
                  >
                    {user.isActive ? 'Deactivate Account' : 'Activate Account'}
                  </button>
                  {user.isOwner && <p style={{ fontSize: '0.75rem', color: 'var(--color-text-dim)', marginTop: '0.25rem' }}>Cannot deactivate the owner account.</p>}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Subscription tab */}
        {activeTab === 'subscription' && (
          <div className="card">
            <div className="card-title">Current Subscription</div>
            <table>
              <tbody>
                <tr><td>Plan</td><td>{user.planId}</td></tr>
                <tr><td>Status</td><td><span className={`badge ${user.planStatus === 'active' ? 'green' : user.planStatus === 'trialing' ? 'amber' : 'muted'}`}>{user.planStatus}</span></td></tr>
                {user.trialEndsAt && <tr><td>Trial Ends</td><td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{new Date(user.trialEndsAt).toLocaleString()}</td></tr>}
                {user.expiresAt && <tr><td>Expires</td><td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{new Date(user.expiresAt).toLocaleString()}</td></tr>}
              </tbody>
            </table>

            <hr style={{ border: 'none', borderTop: '1px solid var(--color-border-dim)', margin: '1.5rem 0' }} />
            <div className="card-title">Modify Subscription</div>
            <div className="form-row" style={{ marginBottom: '1rem' }}>
              <div className="form-group">
                <label>Plan</label>
                <select value={subPlanId} onChange={e => setSubPlanId(e.target.value)}>
                  <option value="navigation">Pro</option>
                  <option value="custom">Enterprise</option>
                </select>
              </div>
              <div className="form-group">
                <label>Grant trial (days)</label>
                <input type="number" min="1" max="90" placeholder="e.g. 14" value={trialDays} onChange={e => setTrialDays(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Comp months (free)</label>
                <input type="number" min="1" max="36" placeholder="e.g. 1" value={compMonths} onChange={e => setCompMonths(e.target.value)} />
              </div>
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.875rem' }}>
                <input type="checkbox" checked={cancelNow} onChange={e => setCancelNow(e.target.checked)} />
                Cancel subscription now (set to canceled status)
              </label>
            </div>
            <button
              className="btn btn-primary"
              disabled={saving}
              onClick={() => {
                showModal(
                  <ConfirmModal title="Confirm Subscription Change" onConfirm={() => {}} onCancel={closeModal} confirmLabel="Save Changes">
                    <ReasonForm onSubmit={handleSaveSubscription} />
                  </ConfirmModal>
                );
              }}
            >
              {saving ? 'Saving…' : 'Save Subscription Changes'}
            </button>
          </div>
        )}

        {/* Role tab */}
        {activeTab === 'role' && owner && (
          <div className="card">
            <div className="card-title">Role & Access Control</div>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
              Only the <strong>owner</strong> can change user roles. Admins cannot be assigned here — use the <a href="/admins">Admins page</a>.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              {['driver', 'dispatcher', 'admin'].map(role => (
                <button
                  key={role}
                  className={`btn ${user.role === role ? 'btn-primary' : 'btn-secondary'}`}
                  disabled={user.isOwner || user.role === role}
                  onClick={() => handleChangeRole(role)}
                >
                  Make {role.charAt(0).toUpperCase() + role.slice(1)}
                </button>
              ))}
            </div>
            {user.isOwner && (
              <p style={{ color: 'var(--color-amber)', fontSize: '0.8rem', marginTop: '1rem' }}>
                ⚠ The owner role cannot be changed. This is a security guard.
              </p>
            )}
          </div>
        )}
      </div>

      {modal}
    </>
  );
}