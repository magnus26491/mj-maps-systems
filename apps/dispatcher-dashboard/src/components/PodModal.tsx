import { useEffect, useState } from 'react';
import { getStopPod } from '../api';

interface Props {
  stopId: string | null;
  onClose: () => void;
}

export default function PodModal({ stopId, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [podData, setPodData] = useState<{ podUrl: string; podType: string; podCapturedAt: string } | null>(null);

  useEffect(() => {
    if (!stopId) {
      setPodData(null);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    setPodData(null);

    getStopPod(stopId)
      .then(data => {
        setPodData(data);
        setLoading(false);
      })
      .catch(err => {
        if ((err as { code?: string }).code === 'ENTERPRISE_REQUIRED') {
          setError('Enterprise plan required');
        } else if (err instanceof Error && err.message.includes('404')) {
          setError('No proof of delivery captured for this stop.');
        } else {
          setError('Failed to load proof of delivery.');
        }
        setLoading(false);
      });
  }, [stopId]);

  if (!stopId) return null;

  return (
    <div style={overlayStyle} onClick={onClose} role="dialog" aria-modal="true" aria-label="Proof of Delivery">
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        {/* Close button */}
        <button onClick={onClose} style={closeBtn} aria-label="Close">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </button>

        <h2 style={titleStyle}>Proof of Delivery</h2>

        {loading && (
          <div style={centerStyle}>
            <div style={spinnerStyle} />
            <span style={{ color: 'var(--color-text-secondary)', marginTop: '0.5rem', fontFamily: 'var(--font-body)' }}>Loading...</span>
          </div>
        )}

        {error && (
          <div style={errorBoxStyle} role="alert">
            {error}
          </div>
        )}

        {podData && (
          <div style={{ textAlign: 'center' }}>
            <img
              src={podData.podUrl}
              alt="Proof of delivery"
              style={{ maxWidth: '100%', maxHeight: '70vh', borderRadius: 'var(--r-lg)', display: 'block', margin: '0 auto' }}
            />
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem', marginTop: '0.75rem', fontFamily: 'var(--font-mono)' }}>
              Captured: {new Date(podData.podCapturedAt).toLocaleString()}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
  padding: '1rem', overflowY: 'auto',
};

const modalStyle: React.CSSProperties = {
  background: 'var(--color-surface-1)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--r-xl)',
  padding: '1.5rem',
  width: '100%',
  maxWidth: 700,
  maxHeight: '90vh',
  overflowY: 'auto',
  position: 'relative',
  boxShadow: 'var(--elevation-xl)',
};

const closeBtn: React.CSSProperties = {
  position: 'absolute', top: 4, right: 4,
  background: 'transparent', border: 'none',
  color: 'var(--color-text-secondary)', fontSize: '1.5rem',
  cursor: 'pointer', lineHeight: 1,
  minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center',
};

const titleStyle: React.CSSProperties = {
  color: 'var(--color-text-primary)',
  fontSize: '1.125rem',
  fontWeight: 600,
  margin: '0 0 1rem',
  fontFamily: 'var(--font-display)',
};

const centerStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '2rem 0',
};

const spinnerStyle: React.CSSProperties = {
  width: 32, height: 32,
  border: '3px solid var(--color-surface-2)',
  borderTop: '3px solid var(--color-teal)',
  borderRadius: '50%',
  animation: 'spin 1s linear infinite',
};

const errorBoxStyle: React.CSSProperties = {
  background: 'var(--color-surface-2)',
  border: '1px solid var(--color-red)',
  borderRadius: 'var(--r-md)',
  padding: '1rem',
  color: 'var(--color-red)',
  textAlign: 'center',
  fontFamily: 'var(--font-body)',
};