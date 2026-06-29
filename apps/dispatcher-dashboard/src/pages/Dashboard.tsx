import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { logout } from '../api';
import KpiBar from '../components/KpiBar';
import FleetMap from '../components/FleetMap';
import RouteList from '../components/RouteList';
import AlertPanel from '../components/AlertPanel';
import AnalyticsPanel from '../components/AnalyticsPanel';
import DriversPanel from '../components/DriversPanel';
import SavingsPanel from '../components/SavingsPanel';
import CoachingPanel from '../components/CoachingPanel';
import AssignModal from '../components/AssignModal';
import AdminPage from './Admin';
import { useStats } from '../hooks/useStats';
import { useRoutes } from '../hooks/useRoutes';

export default function Dashboard() {
  const navigate = useNavigate();
  const [authChecked, setAuthChecked] = useState(false);
  const [assignModalRouteId, setAssignModalRouteId] = useState<string | null>(null);
  const [rightTab, setRightTab] = useState<'alerts' | 'analytics' | 'drivers' | 'savings' | 'coaching' | 'admin'>('alerts');
  const [mainTab, setMainTab] = useState<'fleet' | 'admin'>('fleet');

  // All data hooks must be called unconditionally — Rules of Hooks.
  // SWR returns null/loading until auth resolves; unauthenticated requests
  // return 401 and are handled gracefully by each hook.
  const { stats, isLoading: statsLoading } = useStats();
  const { routes, isLoading: routesLoading } = useRoutes();

  useEffect(() => {
    if (!localStorage.getItem('mj_dispatcher_token')) {
      navigate('/login');
      return;
    }
    setAuthChecked(true);
  }, [navigate]);

  if (!authChecked) return null;

  const isAdmin = localStorage.getItem('mj_user_role') === 'admin';

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
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{
            color: 'var(--color-text-primary)',
            fontWeight: 700,
            fontSize: '1.125rem',
            fontFamily: 'var(--font-display)',
          }}>
            MJ Maps
          </span>
          {isAdmin && (
            <div className="tab-bar" style={{ padding: '2px' }}>
              <button
                onClick={() => setMainTab('fleet')}
                className={`tab-btn ${mainTab === 'fleet' ? 'tab-btn--active' : ''}`}
                style={{ padding: '4px 12px', fontSize: '0.8125rem' }}
              >
                Fleet
              </button>
              <button
                onClick={() => setMainTab('admin')}
                className={`tab-btn ${mainTab === 'admin' ? 'tab-btn--active' : ''}`}
                style={{ padding: '4px 12px', fontSize: '0.8125rem', color: mainTab === 'admin' ? 'var(--color-amber)' : undefined }}
              >
                <svg width="12" height="12" viewBox="0 0 20 20" fill="none" style={{ verticalAlign: 'middle', marginRight: 4 }}>
                  <rect x="2" y="4" width="16" height="13" rx="2" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M7 4V3a3 3 0 016 0v1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  <circle cx="10" cy="10.5" r="2" stroke="currentColor" strokeWidth="1.5"/>
                </svg>
                Admin
              </button>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{
            color: mainTab === 'admin' ? 'var(--color-amber)' : 'var(--color-text-muted)',
            fontSize: '0.875rem',
            fontFamily: 'var(--font-body)',
          }}>
            {isAdmin ? 'Administrator' : 'Dispatcher'}
          </span>
          <button onClick={handleSignOut} style={{
            background: 'transparent',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--r-md)',
            color: 'var(--color-text-secondary)',
            fontSize: '0.875rem',
            padding: '0.25rem 0.75rem',
            cursor: 'pointer',
            fontFamily: 'var(--font-body)',
            minHeight: 44,
          }}>
            Sign out
          </button>
        </div>
      </div>

      {/* Admin Portal */}
      {mainTab === 'admin' ? (
        <AdminPage />
      ) : (
        <></>
      )}

      {/* Fleet view */}
      {mainTab === 'fleet' && (
      <>
      {/* KPI bar */}
      <KpiBar stats={stats} isLoading={statsLoading} />

      {/* Responsive 2-col grid — stacks to 1-col on mobile */}
      <div className="dashboard-grid">
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
          <div className="tab-bar" style={{ flexWrap: 'wrap' }}>
            {([
              ['alerts',    'Alerts'],
              ['analytics',  'Analytics'],
              ['savings',    'Savings'],
              ['coaching',   'Coaching'],
              ['drivers',    'Drivers'],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setRightTab(key)}
                className={`tab-btn ${rightTab === key ? 'tab-btn--active' : ''}`}
                aria-pressed={rightTab === key}
              >
                {label}
              </button>
            ))}
          </div>
          {rightTab === 'alerts'    ? <AlertPanel />    :
           rightTab === 'analytics'  ? <AnalyticsPanel /> :
           rightTab === 'savings'   ? <SavingsPanel />  :
           rightTab === 'coaching'  ? <CoachingPanel driverId="" /> :
           <DriversPanel />}
        </div>
      </div>

      {/* Assign modal */}
      {assignModalRouteId && (
        <AssignModal routeId={assignModalRouteId} onClose={() => setAssignModalRouteId(null)} />
      )}
      </>
      )}
    </div>
  );
}
