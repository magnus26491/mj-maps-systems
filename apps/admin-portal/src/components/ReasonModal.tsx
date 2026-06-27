// src/components/ReasonModal.tsx
// Reusable modal for mandatory reason on sensitive admin actions.

import React, { useState, useEffect, useRef } from 'react';

interface ReasonModalProps {
  title: string;
  description?: string;
  minLength?: number;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

export default function ReasonModal({
  title,
  description,
  minLength = 10,
  confirmLabel = 'Confirm',
  danger = false,
  onConfirm,
  onCancel,
}: ReasonModalProps) {
  const [reason, setReason] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const isValid = reason.trim().length >= minLength;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid) return;
    onConfirm(reason.trim());
  }

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onCancel]);

  const btnClass = danger ? 'btn btn-danger' : 'btn btn-primary';

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="modal-close" onClick={onCancel} aria-label="Close">x</button>
        </div>
        {description && (
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', marginBottom: '1rem' }}>
            {description}
          </p>
        )}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="reason">
              Reason{' '}
              <span style={{ color: 'var(--color-text-dim)', fontWeight: 400 }}>
                (minimum {minLength} characters)
              </span>
            </label>
            <textarea
              id="reason"
              ref={inputRef}
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Describe why you are making this change..."
              rows={4}
              style={{ resize: 'vertical' }}
            />
            <div style={{
              fontSize: '0.75rem',
              color: reason.trim().length >= minLength ? 'var(--color-green)' : 'var(--color-text-dim)',
              marginTop: '0.25rem',
              fontFamily: 'var(--font-mono)',
            }}>
              {reason.trim().length} / {minLength} characters
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
            <button type="submit" className={btnClass} disabled={!isValid}>{confirmLabel}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
