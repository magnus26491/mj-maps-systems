import { useState } from 'react';
import { useDrivers } from '../hooks/useDrivers';
import { updateDriver, deleteDriver } from '../api';
import DriverDetailModal from './DriverDetailModal';
import type { DriverRow } from '../types';

const thStyle: React.CSSProperties = { padding: '0.5rem', textAlign: 'left', fontWeight: 600, color: '#94a3b8', fontSize: '0.75rem' };
const tdStyle: React.CSSProperties = { padding: '0.5rem', verticalAlign: 'middle' };
const mutedStyle: React.CSSProperties = { color: '#64748b', padding: '0.5rem' };
const inputStyle: React.CSSProperties = {
  background: '#1e293b', border: '1px solid #334155', borderRadius: 4,
  color: '#f1f5f9', padding: '0.25rem 0.5rem', fontSize: '0.875rem', width: '100%',
  boxSizing: 'border-box',
};
const actionBtnStyle: React.CSSProperties = {
  background: 'transparent', border: '1px solid #334155', color: '#94a3b8',
  borderRadius: 4, padding: '0.25rem 0.5rem', fontSize: '0.75rem', cursor: 'pointer',
};

function roleBadgeStyle(role: string): React.CSSProperties {
  const isDriver = role === 'driver';
  return {
    display: 'inline-block', padding: '0.125rem 0.5rem', borderRadius: 9999,
    fontSize: '0.75rem', fontWeight: 600,
    background: isDriver ? '#14532d' : '#1e3a5f',
    color: isDriver ? '#22c55e' : '#3b82f6',
    border: `1px solid ${isDriver ? '#22c55e' : '#3b82f6'}`,
  };
}

function statusDot(isActive: boolean): React.CSSProperties {
  return {
    display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
    background: isActive ? '#22c55e' : '#475569',
    marginRight: '0.375rem',
  };
}

export default function DriversPanel() {
  const { drivers, isLoading, error, refresh } = useDrivers();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFields, setEditFields] = useState<{ name: string; email: string; role: string }>({
    name: '', email: '', role: 'driver',
  });
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  function startEdit(driver: DriverRow) {
    setEditingId(driver.id);
    setEditFields({ name: driver.name, email: driver.email, role: driver.role });
  }

  async function handleSave(driverId: string) {
    setActionError(null);
    setSavingId(driverId);
    try {
      await updateDriver(driverId, {
        name: editFields.name || undefined,
        email: editFields.email || undefined,
        role: editFields.role || undefined,
      });
      setEditingId(null);
      refresh();
    } catch (err) {
      console.error('[DriversPanel] save failed:', err);
      setActionError(err instanceof Error ? err.message : 'Failed to save driver changes.');
    } finally {
      setSavingId(null);
    }
  }

  async function handleDelete(driverId: string) {
    setActionError(null);
    setDeletingId(driverId);
    try {
      await deleteDriver(driverId);
      refresh();
    } catch (err) {
      console.error('[DriversPanel] delete failed:', err);
      setActionError(err instanceof Error ? err.message : 'Failed to delete driver.');
    } finally {
      setDeletingId(null);
    }
  }

  if (isLoading) return <div style={mutedStyle}>Loading drivers...</div>;
  if (error) return <div style={{ ...mutedStyle, color: '#ef4444' }}>{error}</div>;
  if (drivers.length === 0) return <div style={mutedStyle}>No drivers found.</div>;

  return (
    <>
      {actionError && (
        <div style={{ color: '#ef4444', fontSize: '0.875rem', padding: '0.5rem 0', marginBottom: '0.25rem' }}>
          {actionError}
        </div>
      )}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem', color: '#f1f5f9' }}>
          <thead>
            <tr style={{ background: '#1e293b' }}>
              <th style={thStyle}>Name / Email</th>
              <th style={thStyle}>Role</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Routes Today</th>
              <th style={thStyle}>Last Seen</th>
              <th style={thStyle}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {drivers.map(driver => {
              const isEditing = editingId === driver.id;
              const isSaving = savingId === driver.id;
              const isDeleting = deletingId === driver.id;

              return (
                <tr key={driver.id} style={{ borderBottom: '1px solid #1e293b' }}>
                  {/* Name / Email */}
                  <td style={tdStyle}>
                    {isEditing ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        <input
                          value={editFields.name}
                          onChange={e => setEditFields(f => ({ ...f, name: e.target.value }))}
                          style={inputStyle}
                        />
                        <input
                          value={editFields.email}
                          onChange={e => setEditFields(f => ({ ...f, email: e.target.value }))}
                          style={inputStyle}
                        />
                      </div>
                    ) : (
                      <div>
                        <span
                          style={{ color: '#f1f5f9', fontWeight: 600, cursor: 'pointer' }}
                          onClick={() => setSelectedDriverId(driver.id)}
                        >
                          {driver.name}
                        </span>
                        <br />
                        <span style={{ color: '#64748b', fontSize: '0.75rem' }}>{driver.email}</span>
                      </div>
                    )}
                  </td>

                  {/* Role */}
                  <td style={tdStyle}>
                    {isEditing ? (
                      <select
                        value={editFields.role}
                        onChange={e => setEditFields(f => ({ ...f, role: e.target.value }))}
                        style={{ ...inputStyle, width: 'auto' }}
                      >
                        <option value="driver">driver</option>
                        <option value="dispatcher">dispatcher</option>
                        <option value="admin">admin</option>
                      </select>
                    ) : (
                      <span style={roleBadgeStyle(driver.role)}>{driver.role}</span>
                    )}
                  </td>

                  {/* Status */}
                  <td style={tdStyle}>
                    <span style={statusDot(driver.isActive)} />
                    {driver.isActive ? 'Active' : 'Offline'}
                  </td>

                  {/* Routes today */}
                  <td style={tdStyle}>
                    {driver.completedToday} done / {driver.activeRoutes} active
                  </td>

                  {/* Last seen */}
                  <td style={tdStyle}>
                    {driver.lastSeenAt
                      ? new Date(driver.lastSeenAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                      : '—'}
                  </td>

                  {/* Actions */}
                  <td style={tdStyle}>
                    {isEditing ? (
                      <>
                        <button
                          onClick={() => handleSave(driver.id)}
                          disabled={isSaving}
                          style={{
                            ...actionBtnStyle, marginRight: '0.25rem',
                            opacity: isSaving ? 0.5 : 1,
                            color: '#22c55e', borderColor: '#22c55e',
                          }}
                        >
                          {isSaving ? 'Saving...' : 'Save'}
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          style={actionBtnStyle}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => startEdit(driver)}
                          style={{ ...actionBtnStyle, marginRight: '0.25rem' }}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(driver.id)}
                          disabled={isDeleting}
                          style={{
                            background: 'transparent',
                            border: '1px solid #ef4444',
                            color: '#ef4444',
                            borderRadius: 4,
                            padding: '0.25rem 0.5rem',
                            fontSize: '0.75rem',
                            cursor: isDeleting ? 'not-allowed' : 'pointer',
                            opacity: isDeleting ? 0.5 : 1,
                          }}
                        >
                          {isDeleting ? 'Deleting...' : 'Delete'}
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <DriverDetailModal
        driverId={selectedDriverId}
        onClose={() => setSelectedDriverId(null)}
      />
    </>
  );
}
