import { useState } from 'react';
import { useDrivers } from '../hooks/useDrivers';
import { assignRoute } from '../api';

interface Props {
  routeId: string;
  onClose: () => void;
}

export default function AssignModal({ routeId, onClose }: Props) {
  const { drivers, isLoading } = useDrivers();
  const [selected, setSelected] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setSubmitting(true);
    try {
      await assignRoute(routeId, selected, note || undefined);
      onClose();
    } catch {
      alert('Failed to assign route. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const noAccess = !isLoading && drivers.length === 0;

  return (
    <div className="modal-overlay">
      <div className="modal-box modal-box-sm">
        <h2 style={{ color: '#f1f5f9', fontSize: '1.125rem', fontWeight: 600, marginTop: 0 }}>Assign Route</h2>

        {noAccess ? (
          <div style={{ background: '#1e293b', border: '1px solid #ef4444', borderRadius: 8, padding: '1rem', color: '#ef4444' }}>
            Enterprise plan required to assign routes. Upgrade at your pricing page.
          </div>
        ) : isLoading ? (
          <div style={{ color: '#64748b' }}>Loading drivers...</div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', color: '#94a3b8', fontSize: '0.875rem', marginBottom: '0.25rem' }}>
                Select Driver
              </label>
              <select
                value={selected}
                onChange={e => setSelected(e.target.value)}
                required
                style={selectStyle}
              >
                <option value="">— Choose a driver —</option>
                {drivers.map(d => (
                  <option key={d.id} value={d.id}>{d.name} ({d.planId})</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', color: '#94a3b8', fontSize: '0.875rem', marginBottom: '0.25rem' }}>
                Note (optional)
              </label>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                rows={3}
                style={selectStyle}
                placeholder="Any instructions for the driver..."
              />
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button type="button" onClick={onClose} style={cancelBtn}>Cancel</button>
              <button type="submit" disabled={!selected || submitting} style={submitBtn}>
                {submitting ? 'Assigning...' : 'Assign'}
              </button>
            </div>
          </form>
        )}

        {!noAccess && !isLoading && (
          <button onClick={onClose} style={{ ...cancelBtn, marginTop: '0.5rem', width: '100%' }}>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  background: '#1e293b', border: '1px solid #334155', borderRadius: 8,
  padding: '0.5rem', color: '#f1f5f9', fontSize: '0.875rem', width: '100%',
};
const cancelBtn: React.CSSProperties = {
  background: 'transparent', border: '1px solid #334155', borderRadius: 6,
  color: '#94a3b8', padding: '0.5rem 1rem', cursor: 'pointer', minHeight: 44,
};
const submitBtn: React.CSSProperties = {
  background: '#3b82f6', border: 'none', borderRadius: 6,
  color: '#fff', padding: '0.5rem 1rem', fontWeight: 600, cursor: 'pointer', minHeight: 44,
};