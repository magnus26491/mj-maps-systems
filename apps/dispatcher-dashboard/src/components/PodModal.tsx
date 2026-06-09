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
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        {/* Close button */}
        <button onClick={onClose} style={closeBtn}>
          &times;
        </button>

        <h2 style={titleStyle}>Proof of Delivery</h2>

        {loading && (
          <div style={centerStyle}>
            <div style={spinnerStyle} />
            <span style={{ color: '#94a3b8', marginTop: '0.5rem' }}>Loading...</span>
          </div>
        )}

        {error && (
          <div style={errorBoxStyle}>
            {error}
          </div>
        )}

        {podData && (
          <div style={{ textAlign: 'center' }}>
            <img
              src={podData.podUrl}
              alt="Proof of delivery"
              style={{ maxWidth: '100%', maxHeight: '70vh', borderRadius: 8, display: 'block', margin: '0 auto' }}
            />
            <p style={{ color: '#94a3b8', fontSize: '0.875rem', marginTop: '0.75rem' }}>
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
};

const modalStyle: React.CSSProperties = {
  background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12,
  padding: '1.5rem', width: '100%', maxWidth: 700, position: 'relative',
};

const closeBtn: React.CSSProperties = {
  position: 'absolute', top: 12, right: 16, background: 'transparent', border: 'none',
  color: '#94a3b8', fontSize: '1.5rem', cursor: 'pointer', lineHeight: 1,
};

const titleStyle: React.CSSProperties = {
  color: '#f1f5f9', fontSize: '1.125rem', fontWeight: 600, margin: '0 0 1rem',
};

const centerStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '2rem 0',
};

const spinnerStyle: React.CSSProperties = {
  width: 32, height: 32, border: '3px solid #1e293b', borderTop: '3px solid #3b82f6',
  borderRadius: '50%', animation: 'spin 1s linear infinite',
};

const errorBoxStyle: React.CSSProperties = {
  background: '#1e293b', border: '1px solid #ef4444', borderRadius: 8,
  padding: '1rem', color: '#ef4444', textAlign: 'center',
};