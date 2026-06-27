import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { logout } from '../api';
import KpiBar from '../components/KpiBar';
import FleetMap from '../components/FleetMap';
import RouteList from '../components/RouteList';
import AlertPanel from '../components/AlertPanel';
import AnalyticsPanel from '../components/AnalyticsPanel';
import DriversPanel from '../components/DriversPanel';
import AssignModal from '../components/AssignModal';
import { useStats } from '../hooks/useStats';
import { useRoutes } from '../hooks/useRoutes';

export default function Dashboard() {
  const navigate = useNavigate();
  const { stats, isLoading: statsLoading } = useStats();
  const { routes, isLoading: routesLoading } = useRoutes();
  const [assignModalRouteId, setAssignModalRouteId] = useState<string | null>(null);
  const [rightTab, setRightTab] = useState<'alerts' | 'analytics' | 'drivers'>('alerts');

  useEffect(() => {
    if (!localStorage.getItem('mj_dispatcher_token')) {
      navigate('/login');
    }
  }, [navigate]);

  function handleSignOut() {
    logout();
    navigate('/login');
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-base)', padding: '1rem' }}>
      {/* Nav bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: '1rem', padding: '0.75rem 1rem',
        background: 'var(--color-surface-1)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--r-lg)',
        boxShadow: 'var(--elevation-md)',
      }}>
        <span style={{
          color: 'var(--color-text-primary)',
          fontWeight: 700,
          fontSize: '1.125rem',
          fontFamily: 'var(--font-display)',
        }}>
          MJ Maps Dispatcher
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', fontFamily: 'var(--font-body)' }}>Dispatcher</span>
          <button onClick={handleSignOut} style={{
            background: 'transparent',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--r-md)',
            color: 'var(--color-text-secondary)',
            fontSize: '0.875rem',
            padding: '0.25rem 0.75rem',
            cursor: 'pointer',
            fontFamily: 'var(--font-body)',
          }}>
            Sign out
          </button>
        </div>
      </div>

      {/* KPI bar */}
      <KpiBar stats={stats} isLoading={statsLoading} />

      {/* 2-col grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: '1rem' }}>
        {/* Left: map + route list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <FleetMap routes={routes} />
          <div>
            <h3 style={{ color: 'var(--color-text-primary)', fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem', fontFamily: 'var(--font-display)' }}>Active Routes</h3>
            <RouteList
              routes={routes}
              isLoading={routesLoading}
              onAssign={routeId => setAssignModalRouteId(routeId)}
              onComplete={_routeId => { /* routes will refresh via SSE; no local state needed */ }}
            />
          </div>
        </div>
        {/* Right: tabbed panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {/* Tab bar — using .tab-bar and .tab-btn CSS classes */}
          <div className="tab-bar">
            {(['alerts', 'analytics', 'drivers'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setRightTab(tab)}
                className={`tab-btn ${rightTab === tab ? 'tab-btn--active' : ''}`}
                aria-pressed={rightTab === tab}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
          {rightTab === 'alerts' ? <AlertPanel /> : rightTab === 'analytics' ? <AnalyticsPanel /> : <DriversPanel />}
        </div>
      </div>

      {/* Assign modal */}
      {assignModalRouteId && (
        <AssignModal routeId={assignModalRouteId} onClose={() => setAssignModalRouteId(null)} />
      )}
    </div>
  );
}
