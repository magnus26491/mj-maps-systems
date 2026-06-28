import { useState } from 'react';

/** Wrapper around the Vite-proxied /api base — mirrors api.ts internal pattern */
async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = localStorage.getItem('mj_dispatcher_token') ?? '';
  const resp = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  return resp;
}

interface DriverOption {
  driverId: string;
  driverName: string;
  vehicleLabel: string;
}

interface Props {
  /** Route-level: pre-fill with that route's driver */
  prefillDriver?: DriverOption;
  /** Close callback */
  onClose: () => void;
  /** Called after successful send */
  onSent?: (count: number) => void;
}

/** Inline API call — avoids a full api.ts change for one endpoint */
async function sendDispatcherMessage(
  driverIds: string[],
  message: string,
): Promise<{ sent: number; queued: number }> {
  const resp = await apiFetch('/api/v1/dispatcher/message', {
    method: 'POST',
    body: JSON.stringify({ driverIds, message }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error((err as { error?: string }).error ?? 'Send failed');
  }
  return resp.json() as Promise<{ sent: number; queued: number }>;
}

export default function MessageDriverModal({ prefillDriver, onClose, onSent }: Props) {
  const [selectedDrivers, setSelectedDrivers] = useState<Set<string>>(() =>
    prefillDriver ? new Set([prefillDriver.driverId]) : new Set(),
  );
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isValid = selectedDrivers.size > 0 && message.trim().length > 0 && message.trim().length <= 200;
  const remaining = 200 - message.trim().length;

  async function handleSend() {
    if (!isValid || sending) return;
    setSending(true);
    setError(null);
    try {
      const result = await sendDispatcherMessage(
        Array.from(selectedDrivers),
        message.trim(),
      );
      const total = result.sent + result.queued;
      setSuccess(`Message sent to ${total} driver${total !== 1 ? 's' : ''} (${result.sent} live, ${result.queued} queued).`);
      setTimeout(() => {
        onSent?.(total);
        onClose();
      }, 1_500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send. Please try again.');
    } finally {
      setSending(false);
    }
  }

  function toggleDriver(driverId: string) {
    setSelectedDrivers((prev: Set<string>) => {
      const next = new Set(prev);
      if (next.has(driverId)) next.delete(driverId); else next.add(driverId);
      return next;
    });
  }

  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.65)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000,
  };
  const modal: React.CSSProperties = {
    background: '#12151B',
    border: '1px solid #1e293b',
    borderRadius: 12,
    width: '100%',
    maxWidth: 480,
    margin: '1rem',
    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
  };
  const header: React.CSSProperties = {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '1rem 1.25rem',
    borderBottom: '1px solid #1e293b',
  };
  const body: React.CSSProperties = { padding: '1.25rem' };
  const footer: React.CSSProperties = {
    display: 'flex', justifyContent: 'flex-end', gap: '0.5rem',
    padding: '1rem 1.25rem',
    borderTop: '1px solid #1e293b',
  };

  return (
    <div style={overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={modal} role="dialog" aria-modal="true" aria-labelledby="msg-modal-title">

        {/* Header */}
        <div style={header}>
          <span id="msg-modal-title" style={{ color: '#f1f5f9', fontWeight: 700, fontSize: '1rem' }}>
            Message Driver
          </span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: '1.25rem', lineHeight: 1 }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={body}>

          {/* Recipients */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', color: '#94a3b8', fontSize: '0.875rem', marginBottom: '0.5rem', fontWeight: 600 }}>
              Recipients
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {/* Prefill from route */}
              {prefillDriver && (
                <label style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  background: '#0f172a', border: '1px solid #00C2A840',
                  borderRadius: 8, padding: '0.625rem 0.75rem', cursor: 'pointer',
                }}>
                  <input
                    type="checkbox"
                    checked={selectedDrivers.has(prefillDriver.driverId)}
                    onChange={() => toggleDriver(prefillDriver.driverId)}
                    style={{ accentColor: '#00C2A8', width: 16, height: 16 }}
                  />
                  <div>
                    <div style={{ color: '#f1f5f9', fontSize: '0.875rem', fontWeight: 600 }}>{prefillDriver.driverName}</div>
                    <div style={{ color: '#64748b', fontSize: '0.75rem' }}>{prefillDriver.vehicleLabel}</div>
                  </div>
                </label>
              )}
              {!prefillDriver && (
                <div style={{ color: '#64748b', fontSize: '0.875rem' }}>
                  Select a route from the list to message its driver.
                </div>
              )}
            </div>
          </div>

          {/* Message */}
          <div style={{ marginBottom: '1rem' }}>
            <label htmlFor="msg-text" style={{ display: 'block', color: '#94a3b8', fontSize: '0.875rem', marginBottom: '0.5rem', fontWeight: 600 }}>
              Message <span style={{ color: '#64748b', fontWeight: 400 }}>(max 200 chars)</span>
            </label>
            <textarea
              id="msg-text"
              ref={messageRef}
              value={message}
              onChange={e => setMessage(e.target.value)}
              maxLength={200}
              rows={4}
              placeholder="e.g. Skip stop 7 — customer cancelled. Continue to next."
              style={{
                width: '100%', background: '#0f172a', border: '1px solid #334155',
                borderRadius: 8, color: '#f1f5f9', fontSize: '0.9375rem',
                fontFamily: 'inherit', padding: '0.75rem', resize: 'none',
                outline: 'none', boxSizing: 'border-box',
              }}
              onFocus={e => { (e.target as HTMLTextAreaElement).style.borderColor = '#00C2A8'; }}
              onBlur={e => { (e.target as HTMLTextAreaElement).style.borderColor = '#334155'; }}
            />
            <div style={{
              textAlign: 'right', color: remaining < 20 ? '#f59e0b' : '#64748b',
              fontSize: '0.75rem', marginTop: '0.25rem',
            }}>
              {remaining} remaining
            </div>
          </div>

          {/* Error */}
          {error && (
            <div style={{
              background: '#3f1515', border: '1px solid #ef444440',
              borderRadius: 8, padding: '0.625rem 0.75rem',
              color: '#ef4444', fontSize: '0.875rem', marginBottom: '0.75rem',
            }}>
              {error}
            </div>
          )}

          {/* Success */}
          {success && (
            <div style={{
              background: '#0f2e1e', border: '1px solid #10B98140',
              borderRadius: 8, padding: '0.625rem 0.75rem',
              color: '#10B981', fontSize: '0.875rem', marginBottom: '0.75rem',
            }}>
              {success}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={footer}>
          <button
            onClick={onClose}
            style={{
              background: 'transparent', border: '1px solid #334155',
              color: '#94a3b8', borderRadius: 8, padding: '0.5rem 1rem',
              fontSize: '0.875rem', cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={!isValid || sending}
            style={{
              background: !isValid || sending ? '#1e293b' : '#00C2A8',
              border: 'none',
              color: !isValid || sending ? '#64748b' : '#0f1923',
              borderRadius: 8, padding: '0.5rem 1rem',
              fontSize: '0.875rem', fontWeight: 700,
              cursor: !isValid || sending ? 'not-allowed' : 'pointer',
            }}
          >
            {sending ? 'Sending…' : 'Send Message'}
          </button>
        </div>
      </div>
    </div>
  );
}