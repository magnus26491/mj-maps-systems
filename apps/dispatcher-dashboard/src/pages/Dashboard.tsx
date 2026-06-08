import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { logout } from '../api';
import KpiBar from '../components/KpiBar';
import FleetMap from '../components/FleetMap';
import RouteList from '../components/RouteList';
import AlertPanel from '../components/AlertPanel';
import AssignModal from '../components/AssignModal';
import { useStats } from '../hooks/useStats';
import { useRoutes } from '../hooks/useRoutes';

export default function Dashboard() {
  const navigate = useNavigate();
  const { stats, isLoading: statsLoading } = useStats();
  const { routes, isLoading: routesLoading } = useRoutes();
  const [assignModalRouteId, setAssignModalRouteId] = useState<string | null>(null);

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
          <span style={{ color: '#64748b', fontSize: '0.875rem' }}>Dispatcher</span>
          <button onClick={handleSignOut} style={{
            background: 'transparent', border: '1px solid #334155', borderRadius: 6,
            color: '#94a3b8', fontSize: '0.875rem', padding: '0.25rem 0.75rem', cursor: 'pointer',
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
            <h3 style={{ color: '#f1f5f9', fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>Active Routes</h3>
            <RouteList
              routes={routes}
              isLoading={routesLoading}
              onAssign={routeId => setAssignModalRouteId(routeId)}
            />
          </div>
        </div>
        {/* Right: alert panel */}
        <AlertPanel />
      </div>

      {/* Assign modal */}
      {assignModalRouteId && (
        <AssignModal routeId={assignModalRouteId} onClose={() => setAssignModalRouteId(null)} />
      )}
    </div>
  );
}