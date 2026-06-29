'use client';

import { useState, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Bell, LayoutList, RefreshCw, LogOut, Map } from 'lucide-react';
import { FleetOverview } from '@/components/FleetOverview';
import { AlertFeed } from '@/components/AlertFeed';
import { RoutePanel } from '@/components/RoutePanel';
import { useActiveRoutes, useFleetStats, useRouteDetail } from '@/hooks/useFleetData';
import { useAlerts } from '@/hooks/useAlerts';
import { isLoggedIn, logout } from '@/lib/auth';
import clsx from 'clsx';

// Leaflet must be dynamically imported (no SSR)
const LiveMap = dynamic(
  () => import('@/components/LiveMap').then((m) => m.LiveMap),
  { ssr: false, loading: () => <div className="w-full h-full bg-[#171614] rounded-xl flex items-center justify-center text-zinc-600 text-sm">Loading map...</div> }
);

type RightPanel = 'alerts' | 'route';
type MobileView = 'map' | 'panel';

export default function DispatcherDashboard() {
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [rightPanel, setRightPanel] = useState<RightPanel>('alerts');
  const [mobileView, setMobileView] = useState<MobileView>('map');
  const [authChecked, setAuthChecked] = useState(false);

  // All hooks must be called unconditionally before any early return
  const { routes, isLoading: routesLoading, refresh: refreshRoutes } = useActiveRoutes();
  const { stats, isLoading: statsLoading } = useFleetStats();
  const { route: selectedRoute } = useRouteDetail(selectedRouteId);
  const { alerts, connected, dismiss, undismissedCount } = useAlerts();

  const handleSelectRoute = useCallback((routeId: string) => {
    setSelectedRouteId(routeId);
    setRightPanel('route');
    setMobileView('panel');
  }, []);

  const handleReplan = useCallback(async (routeId: string) => {
    await fetch(`/api/replan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ routeId }),
    });
    refreshRoutes();
  }, [refreshRoutes]);

  useEffect(() => {
    if (!isLoggedIn()) {
      window.location.href = '/dispatcher/login';
    } else {
      setAuthChecked(true);
    }
  }, []);

  if (!authChecked) {
    return (
      <div className="flex h-full items-center justify-center bg-[#0d1117]">
        <div className="text-zinc-600 text-sm">Checking access…</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#171614] overflow-hidden">
      {/* Top nav */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-[#1c1b19] flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          {/* Logo mark */}
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-label="MJ Maps" className="flex-shrink-0">
            <rect width="28" height="28" rx="7" fill="#01696f"/>
            <path d="M7 20L11.5 9L14 15L16.5 11L21 20" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <circle cx="21" cy="9" r="2.5" fill="#a0e0e0"/>
          </svg>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-zinc-100 leading-tight">MJ Maps</div>
            <div className="text-xs text-zinc-500 leading-tight hidden sm:block">Dispatcher Console</div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-4">
          {/* Mobile view toggle — map vs panel */}
          <div className="flex md:hidden items-center rounded-lg border border-zinc-700 overflow-hidden">
            <button
              onClick={() => setMobileView('map')}
              className={clsx(
                'flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium transition-colors',
                mobileView === 'map' ? 'bg-brand-500 text-white' : 'text-zinc-400 hover:text-zinc-200'
              )}
              aria-label="Show map"
            >
              <Map size={13} />
              <span className="hidden xs:inline">Map</span>
            </button>
            <button
              onClick={() => setMobileView('panel')}
              className={clsx(
                'flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium transition-colors relative',
                mobileView === 'panel' ? 'bg-brand-500 text-white' : 'text-zinc-400 hover:text-zinc-200'
              )}
              aria-label="Show alerts panel"
            >
              <Bell size={13} />
              <span className="hidden xs:inline">Panel</span>
              {undismissedCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center">
                  {undismissedCount > 9 ? '9+' : undismissedCount}
                </span>
              )}
            </button>
          </div>

          {/* Live indicator */}
          <div className="flex items-center gap-1.5 text-xs">
            <div className={clsx(
              'w-2 h-2 rounded-full flex-shrink-0',
              connected ? 'bg-emerald-400 animate-pulse' : 'bg-red-500'
            )} />
            <span className="text-zinc-500 hidden sm:inline">{connected ? 'Live' : 'Reconnecting'}</span>
          </div>

          <button
            onClick={() => refreshRoutes()}
            className="p-2 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
            aria-label="Refresh"
          >
            <RefreshCw size={15} />
          </button>

          <button
            onClick={() => logout()}
            className="p-2 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut size={15} />
          </button>
        </div>
      </header>

      {/* KPI bar */}
      <div className="px-4 py-3 border-b border-zinc-800 flex-shrink-0">
        <FleetOverview stats={stats} isLoading={statsLoading} />
      </div>

      {/* Main content: map + right panel */}
      {/* Desktop: side-by-side | Mobile: stacked with view toggle */}
      <div className="flex flex-col md:flex-row flex-1 min-h-0 overflow-hidden">
        {/* Map area — visible on mobile only when mobileView==='map' */}
        <div className={clsx(
          'flex-1 min-w-0 p-3',
          mobileView === 'panel' ? 'hidden md:flex' : 'flex',
        )}>
          <LiveMap
            routes={routes}
            selectedRouteId={selectedRouteId}
            onSelectRoute={handleSelectRoute}
          />
        </div>

        {/* Right panel — visible on mobile only when mobileView==='panel' */}
        <div className={clsx(
          'md:w-80 xl:w-96 md:flex-shrink-0 md:border-l border-zinc-800 flex flex-col bg-[#1c1b19]',
          'w-full flex-1',
          mobileView === 'map' ? 'hidden md:flex' : 'flex',
        )}>
          {/* Panel tabs */}
          <div className="flex border-b border-zinc-800 flex-shrink-0">
            <button
              onClick={() => setRightPanel('alerts')}
              className={clsx(
                'flex items-center gap-1.5 flex-1 justify-center py-3 text-xs font-medium transition-colors relative',
                rightPanel === 'alerts'
                  ? 'text-brand-400 border-b-2 border-brand-500'
                  : 'text-zinc-500 hover:text-zinc-300'
              )}
            >
              <Bell size={13} />
              Alerts
              {undismissedCount > 0 && (
                <span className="absolute top-1.5 right-6 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                  {undismissedCount > 9 ? '9+' : undismissedCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setRightPanel('route')}
              className={clsx(
                'flex items-center gap-1.5 flex-1 justify-center py-3 text-xs font-medium transition-colors',
                rightPanel === 'route'
                  ? 'text-brand-400 border-b-2 border-brand-500'
                  : 'text-zinc-500 hover:text-zinc-300'
              )}
            >
              <LayoutList size={13} />
              Route Detail
            </button>
          </div>

          {/* Panel content */}
          <div className="flex-1 min-h-0 overflow-hidden">
            {rightPanel === 'alerts' && (
              <AlertFeed
                alerts={alerts}
                connected={connected}
                onDismiss={dismiss}
                onReplan={handleReplan}
              />
            )}
            {rightPanel === 'route' && (
              <RoutePanel
                route={selectedRoute}
                onClose={() => { setRightPanel('alerts'); setMobileView('map'); }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
