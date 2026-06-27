// src/components/ImpersonationBanner.tsx
// Persistent security banner shown at the top of every page while impersonating.
// This is a critical security UX element — must be visually prominent and impossible to miss.

import React, { useState } from 'react';
import { useImpersonation } from '../contexts/ImpersonationContext';
import { endImpersonationSession } from '../api';

function timeRemaining(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return 'Expired';
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins}m ${secs}s remaining`;
}

export default function ImpersonationBanner() {
  const { session, endImpersonation } = useImpersonation();
  const [ending, setEnding] = useState(false);
  const [error, setError] = useState('');

  if (!session) return null;

  async function handleEnd() {
    if (!session) return;
    setEnding(true);
    setError('');
    const activeSession = session;
    try {
      await endImpersonationSession(activeSession.sessionId);
      endImpersonation();
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to end impersonation');
      setEnding(false);
    }
  }

  return (
    <div
      role="alert"
      aria-live="assertive"
      style={{
        background: 'linear-gradient(135deg, #7c2d12 0%, #991b1b 50%, #b91c1c 100%)',
        borderBottom: '1px solid #ef4444',
        color: '#fef2f2',
        padding: '0.6rem 1.5rem',
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        fontSize: '0.875rem',
        fontWeight: 500,
        position: 'sticky',
        top: 0,
        zIndex: 9999,
        flexWrap: 'wrap',
      }}
    >
      {/* Warning icon */}
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
           strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
           style={{ flexShrink: 0, color: '#fca5a5' }}>
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
        <line x1="12" y1="9" x2="12" y2="13"/>
        <line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>

      {/* Message */}
      <span style={{ flex: 1, minWidth: 0 }}>
        <strong>Impersonating:</strong>{' '}
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
          {session.impersonatedUser.email}
        </span>
        {' '}({session.impersonatedUser.role}) &mdash;{' '}
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
          {timeRemaining(session.expiresAt)}
        </span>
        {' '}&mdash; All actions are being logged.
      </span>

      {/* Error message */}
      {error && (
        <span style={{ color: '#fca5a5', fontSize: '0.8rem' }}>{error}</span>
      )}

      {/* End impersonation button */}
      <button
        onClick={handleEnd}
        disabled={ending}
        style={{
          background: 'rgba(255,255,255,0.15)',
          border: '1px solid rgba(255,255,255,0.3)',
          borderRadius: 'var(--radius-md)',
          color: '#fff',
          cursor: ending ? 'not-allowed' : 'pointer',
          fontSize: '0.8rem',
          fontWeight: 600,
          padding: '0.3rem 0.75rem',
          whiteSpace: 'nowrap',
          opacity: ending ? 0.7 : 1,
          flexShrink: 0,
        }}
      >
        {ending ? 'Ending…' : 'End Impersonation'}
      </button>
    </div>
  );
}
