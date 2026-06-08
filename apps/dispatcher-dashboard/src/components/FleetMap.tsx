import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import type { Route } from '../types';

// Fix broken default marker icons in Vite
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)['_getIconUrl'];
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

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
        {routes.map(route => {
          if (route.currentLat === 0 && route.currentLon === 0) return null;
          return (
            <Marker key={route.routeId} position={[route.currentLat, route.currentLon]}>
              <Popup>
                <strong>{route.driverName}</strong><br />
                {route.vehicleLabel}<br />
                {route.completedStops}/{route.totalStops} stops
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
