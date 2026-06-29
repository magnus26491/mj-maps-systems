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
    <div style={{ minHeight: '100vh', background: '#030712', padding: '1rem' }}>
      {/* Nav bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: '1rem', padding: '0.75rem 1rem', background: '#0f172a',
        border: '1px solid #1e293b', borderRadius: 8,
      }}>
        <span style={{ color: '#f1f5f9', fontWeight: 700, fontSize: '1.125rem' }}>MJ Maps Dispatcher</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button onClick={handleSignOut} style={{
            background: 'transparent', border: '1px solid #334155', borderRadius: 6,
            color: '#94a3b8', fontSize: '0.875rem', padding: '0.5rem 0.75rem', cursor: 'pointer',
            minHeight: 44,
          }}>
            Sign out
          </button>
        </div>
      </div>

      {/* KPI bar */}
      <KpiBar stats={stats} isLoading={statsLoading} />

      {/* Responsive 2-col grid — stacks to 1-col on mobile */}
      <div className="dashboard-grid">
        {/* Left: map + route list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <FleetMap routes={routes} />
          <div>
            <h3 style={{ color: '#f1f5f9', fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>Active Routes</h3>
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
          {/* Tab bar */}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              onClick={() => setRightTab('alerts')}
              style={{
                ...tabStyle,
                background: rightTab === 'alerts' ? '#1e3a5f' : 'transparent',
                color: rightTab === 'alerts' ? '#3b82f6' : '#64748b',
                border: `1px solid ${rightTab === 'alerts' ? '#3b82f6' : '#1e293b'}`,
              }}
            >
              Alerts
            </button>
            <button
              onClick={() => setRightTab('analytics')}
              style={{
                ...tabStyle,
                background: rightTab === 'analytics' ? '#1e3a5f' : 'transparent',
                color: rightTab === 'analytics' ? '#3b82f6' : '#64748b',
                border: `1px solid ${rightTab === 'analytics' ? '#3b82f6' : '#1e293b'}`,
              }}
            >
              Analytics
            </button>
            <button
              onClick={() => setRightTab('drivers')}
              style={{
                ...tabStyle,
                background: rightTab === 'drivers' ? '#1e3a5f' : 'transparent',
                color: rightTab === 'drivers' ? '#3b82f6' : '#64748b',
                border: `1px solid ${rightTab === 'drivers' ? '#3b82f6' : '#1e293b'}`,
              }}
            >
              Drivers
            </button>
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

const tabStyle: React.CSSProperties = {
  borderRadius: 6,
  padding: '0.25rem 0.75rem',
  fontSize: '0.875rem',
  cursor: 'pointer',
  fontWeight: 600,
};