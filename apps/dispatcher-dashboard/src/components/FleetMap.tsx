import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import { useEffect, useRef } from 'react';
import type { Route } from '../types';

// Fix broken default marker icons in Vite
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)['_getIconUrl'];
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

// ── Status colour helper ─────────────────────────────────────────────────────
function getStatus(lastPing: string | null): 'live' | 'stale' | 'offline' {
  if (!lastPing) return 'offline';
  const ageMs = Date.now() - new Date(lastPing).getTime();
  if (ageMs < 30_000) return 'live';
  if (ageMs < 120_000) return 'stale';
  return 'offline';
}

function makeIcon(status: 'live' | 'stale' | 'offline'): L.DivIcon {
  const colour =
    status === 'live' ? '#22c55e' :
    status === 'stale' ? '#f59e0b' :
    '#6b7280';
  return L.divIcon({
    className: '',
    html: `<div style="width:14px;height:14px;border-radius:50%;
                       background:${colour};border:2px solid #fff;
                       box-shadow:0 0 6px ${colour}"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

function timeAgo(lastPing: string | null): string {
  if (!lastPing) return 'Unknown';
  const secs = Math.floor((Date.now() - new Date(lastPing).getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  return `${mins}m ago`;
}

// ── LiveMarkers — imperative marker management ──────────────────────────────
interface LiveMarkersProps { routes: Route[]; }

function LiveMarkers({ routes }: LiveMarkersProps) {
  const map = useMap();
  const markersRef = useRef<Map<string, L.Marker>>(new Map());

  useEffect(() => {
    const currentIds = new Set<string>();

    for (const route of routes) {
      if (route.currentLat === 0 && route.currentLon === 0) continue;
      const id = route.routeId;
      currentIds.add(id);

      const status = getStatus(route.lastPing);
      const icon = makeIcon(status);
      const pos: L.LatLngExpression = [route.currentLat, route.currentLon];

      if (markersRef.current.has(id)) {
        // Update position and icon in-place (no flicker)
        markersRef.current.get(id)!.setLatLng(pos).setIcon(icon);
      } else {
        // Create new marker with popup
        const heading = (route as unknown as { heading?: number }).heading;
        const headingStr = heading != null ? `<br/>Heading: ${heading}°` : '';
        const marker = L.marker(pos, { icon }).bindPopup(`
          <div style="font-family:sans-serif;line-height:1.5;min-width:140px">
            <strong>${route.driverName}</strong><br/>
            ${route.vehicleLabel}<br/>
            ${route.completedStops}/${route.totalStops} stops<br/>
            Last seen: ${timeAgo(route.lastPing)}${headingStr}
          </div>
        `, { maxWidth: 200 });
        marker.addTo(map);
        markersRef.current.set(id, marker);
      }
    }

    // Remove stale markers
    for (const [id, marker] of markersRef.current) {
      if (!currentIds.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    }
  }, [routes, map]);

  return null;
}

// ── FleetMap ─────────────────────────────────────────────────────────────────
interface Props { routes: Route[]; }

export default function FleetMap({ routes }: Props) {
  return (
    <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, overflow: 'hidden', height: 400 }}>
      <MapContainer
        center={[54.0, -2.0]}
        zoom={6}
        style={{ height: '100%', width: '100%' }}
        zoomControl={true}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, &copy; <a href="https://carto.com">CARTO</a>'
          subdomains="abcd"
          maxZoom={19}
        />
        <LiveMarkers routes={routes} />
      </MapContainer>
    </div>
  );
}
