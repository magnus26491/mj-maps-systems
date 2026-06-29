// src/pages/AdminsPage.tsx
import React, { useEffect, useState } from 'react';
import { getAdmins, addAdmin, removeAdmin, createDispatcher, isOwner } from '../api';
import type { Admin } from '../types';

export default function AdminsPage() {
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [adding, setAdding] = useState(false);
  const [dispEmail,    setDispEmail]    = useState('');
  const [dispPassword, setDispPassword] = useState('');
  const [dispName,     setDispName]     = useState('');
  const [dispAdding,   setDispAdding]   = useState(false);
  const owner = isOwner();

  function load() {
    setLoading(true);
    getAdmins()
      .then(r => setAdmins(r.admins))
      .catch((e: Error) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newEmail.trim()) return;
    setAdding(true);
    try {
      await addAdmin(newEmail.trim(), `Promoted to admin via admin portal`);
      setNewEmail('');
      load();
    } catch (e: unknown) {
      alert((e as Error).message);
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(admin: Admin) {
    if (!confirm(`Remove ${admin.email} as admin? They will be demoted to driver and deactivated.`)) return;
    try {
      await removeAdmin(admin.id, `Demoted via admin portal`);
      load();
    } catch (e: unknown) {
      alert((e as Error).message);
    }
  }

  async function handleCreateDispatcher(e: React.FormEvent) {
    e.preventDefault();
    if (!dispEmail.trim() || !dispPassword.trim()) return;
    setDispAdding(true);
    try {
      await createDispatcher(dispEmail.trim(), dispPassword, dispName.trim() || undefined);
      alert(`Dispatcher account created for ${dispEmail.trim()}. They can now log in at /dispatcher.`);
      setDispEmail('');
      setDispPassword('');
      setDispName('');
    } catch (e: unknown) {
      alert((e as Error).message);
    } finally {
      setDispAdding(false);
    }
  }

  return (
    <>
      <div className="page-header">
        <h1>Admins</h1>
        <p>Manage who has admin access — only the owner can add or remove admins</p>
      </div>
      <div className="page-body">
        {error && <div className="login-error">{error}</div>}

        {owner && (
          <>
            <div className="card" style={{ marginBottom: '1.5rem' }}>
              <div className="card-title">Add New Admin</div>
              <form onSubmit={handleAdd} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>User email (must already have an account)</label>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={e => setNewEmail(e.target.value)}
                    placeholder="user@example.com"
                  />
                </div>
                <button type="submit" className="btn btn-primary" disabled={adding || !newEmail.trim()}>
                  {adding ? 'Adding…' : 'Add Admin'}
                </button>
              </form>
            </div>

            <div className="card" style={{ marginBottom: '1.5rem' }}>
              <div className="card-title">Create Dispatcher Account</div>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                Create a new dispatcher account directly. Dispatchers can log in at <code>/dispatcher</code> to manage routes and drivers.
              </p>
              <form onSubmit={handleCreateDispatcher} style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div className="form-group" style={{ flex: '1 1 200px' }}>
                  <label>Email address</label>
                  <input
                    type="email"
                    value={dispEmail}
                    onChange={e => setDispEmail(e.target.value)}
                    placeholder="dispatcher@company.com"
                    required
                  />
                </div>
                <div className="form-group" style={{ flex: '1 1 160px' }}>
                  <label>Password</label>
                  <input
                    type="password"
                    value={dispPassword}
                    onChange={e => setDispPassword(e.target.value)}
                    placeholder="Min 8 characters"
                    minLength={8}
                    required
                  />
                </div>
                <div className="form-group" style={{ flex: '1 1 160px' }}>
                  <label>Display name (optional)</label>
                  <input
                    type="text"
                    value={dispName}
                    onChange={e => setDispName(e.target.value)}
                    placeholder="e.g. Jane Smith"
                  />
                </div>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={dispAdding || !dispEmail.trim() || dispPassword.length < 8}
                >
                  {dispAdding ? 'Creating…' : 'Create Dispatcher'}
                </button>
              </form>
            </div>
          </>
        )}

        {loading ? (
          <div className="loading">Loading…</div>
        ) : (
          <div className="data-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Last Login</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {admins.map(a => (
                  <tr key={a.id}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{a.email}</td>
                    <td>{a.isOwner ? <span className="badge owner">Owner</span> : <span className="badge teal">Admin</span>}</td>
                    <td>{a.isActive ? <span className="badge green">Active</span> : <span className="badge muted">Inactive</span>}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{new Date(a.createdAt).toLocaleDateString()}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{a.lastLogin ? new Date(a.lastLogin).toLocaleDateString() : '—'}</td>
                    <td>
                      {!a.isOwner && owner && (
                        <button className="btn btn-sm btn-danger" onClick={() => handleRemove(a)}>
                          Remove
                        </button>
                      )}
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