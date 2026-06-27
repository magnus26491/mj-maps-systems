/**
 * components/ReasonModal.tsx
 * Shared confirmation modal for sensitive admin actions.
 * Requires the admin to type a reason string before proceeding.
 * Used for: plan change, impersonation start, feature flag toggle.
 */
import { useState } from 'react';

interface Props {
  title:       string;
  actionLabel: string;
  actionColor?: 'teal' | 'red' | 'amber';
  defaultValue?: string;
  placeholder?: string;
  minLength?:   number;
  onConfirm: (reason: string) => Promise<void>;
  onCancel:  () => void;
  /** Optional danger message shown in a red box */
  dangerMessage?: string;
}

const ACTION_COLORS = {
  teal:  { bg: 'var(--color-teal)',     hover: 'var(--color-teal-bright)' },
  red:   { bg: 'var(--color-red)',       hover: '#f87171' },
  amber: { bg: 'var(--color-amber)',     hover: '#fbbf24' },
};

export default function ReasonModal({
  title,
  actionLabel,
  actionColor = 'teal',
  defaultValue = '',
  placeholder = 'Describe why you are performing this action (min. 10 characters)...',
  minLength = 10,
  onConfirm,
  onCancel,
  dangerMessage,
}: Props) {
  const [reason, setReason] = useState(defaultValue);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isValid = reason.trim().length >= minLength;

  const handleConfirm = async () => {
    if (!isValid || loading) return;
    setLoading(true);
    setError(null);
    try {
      await onConfirm(reason.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
      setLoading(false);
    }
  };

  const colors = ACTION_COLORS[actionColor];

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.80)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 2000,
      }}
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="reason-modal-title"
    >
      <div
        style={{
          background: 'var(--color-surface-1)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--r-xl)',
          padding: '1.5rem',
          width: '100%',
          maxWidth: 480,
          boxShadow: 'var(--elevation-xl)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Title */}
        <h2
          id="reason-modal-title"
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1.125rem',
            fontWeight: 700,
            color: 'var(--color-text-primary)',
            marginBottom: '0.75rem',
          }}
        >
          {title}
        </h2>

        {/* Danger warning */}
        {dangerMessage && (
          <div style={{
            background: 'rgba(239,68,68,0.10)',
            border: '1px solid rgba(239,68,68,0.30)',
            borderRadius: 'var(--r-md)',
            padding: '0.75rem',
            marginBottom: '1rem',
            fontFamily: 'var(--font-body)',
            fontSize: '0.875rem',
            color: 'var(--color-red)',
          }}>
            {dangerMessage}
          </div>
        )}

        {/* Reason input */}
        <label
          htmlFor="reason-input"
          style={{
            display: 'block',
            fontFamily: 'var(--font-body)',
            fontSize: '0.875rem',
            color: 'var(--color-text-secondary)',
            marginBottom: '0.5rem',
          }}
        >
          Reason <span style={{ color: 'var(--color-red)' }}>*</span>
          <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
            (minimum {minLength} characters — required for audit log)
          </span>
        </label>

        <textarea
          id="reason-input"
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder={placeholder}
          rows={3}
          style={{
            width: '100%',
            background: 'var(--color-surface-2)',
            border: `1px solid ${!isValid && reason.length > 0 ? 'var(--color-red)' : 'var(--color-border)'}`,
            borderRadius: 'var(--r-md)',
            color: 'var(--color-text-primary)',
            fontFamily: 'var(--font-body)',
            fontSize: '0.875rem',
            padding: '0.75rem',
            resize: 'vertical',
            minHeight: 80,
            outline: 'none',
            boxSizing: 'border-box',
          }}
          onFocus={e => {
            e.target.style.borderColor = 'var(--color-teal)';
            e.target.style.boxShadow = 'var(--focus-ring)';
          }}
          onBlur={e => {
            e.target.style.borderColor = 'var(--color-border)';
            e.target.style.boxShadow = 'none';
          }}
        />

        {/* Char count */}
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '0.75rem',
          color: !isValid ? 'var(--color-red)' : 'var(--color-text-muted)',
          textAlign: 'right',
          marginTop: '0.25rem',
          marginBottom: '0.75rem',
        }}>
          {reason.trim().length} / {minLength} min
        </div>

        {/* Error */}
        {error && (
          <div style={{
            background: 'rgba(239,68,68,0.10)',
            border: '1px solid rgba(239,68,68,0.30)',
            borderRadius: 'var(--r-sm)',
            padding: '0.5rem 0.75rem',
            marginBottom: '0.75rem',
            fontFamily: 'var(--font-body)',
            fontSize: '0.875rem',
            color: 'var(--color-red)',
          }}>
            {error}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            disabled={loading}
            className="d-btn d-btn--ghost"
            style={{ opacity: loading ? 0.5 : 1 }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!isValid || loading}
            style={{
              background: !isValid ? 'var(--color-surface-2)' : colors.bg,
              color: '#fff',
              opacity: !isValid || loading ? 0.5 : 1,
              cursor: !isValid || loading ? 'not-allowed' : 'pointer',
              padding: '8px 16px',
              borderRadius: 'var(--r-md)',
              fontFamily: 'var(--font-display)',
              fontWeight: 600,
              fontSize: '0.875rem',
              border: 'none',
              transition: 'background 150ms',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            {loading ? (
              <>
                <span style={{
                  width: 14, height: 14,
                  border: '2px solid rgba(255,255,255,0.3)',
                  borderTopColor: '#fff',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                  display: 'inline-block',
                }} />
                Processing...
              </>
            ) : actionLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
