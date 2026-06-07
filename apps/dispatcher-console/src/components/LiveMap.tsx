'use client';

import { useEffect, useRef } from 'react';
import type { ActiveRoute } from '@/types';

// Dynamically import Leaflet only on client
let L: typeof import('leaflet') | null = null;

if (typeof window !== 'undefined') {
  L = require('leaflet');
  require('leaflet/dist/leaflet.css');
}

const ALERT_COLOURS: Record<string, string> = {
  GREEN: '#10b981',
  AMBER: '#f59e0b',
  RED:   '#ef4444',
  pending:   '#6b7280',
  completed: '#10b981',
  failed:    '#ef4444',
  skipped:   '#a16207',
};

function makeDriverIcon(colour: string) {
  if (!L) return undefined;
  return L.divIcon({
    className: '',
    html: `<div style="
      width:32px;height:32px;
      background:${colour};
      border:3px solid white;
      border-radius:50% 50% 50% 0;
      transform:rotate(-45deg);
      box-shadow:0 2px 8px rgba(0,0,0,0.5);
    "></div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -34],
  });
}

function makeStopIcon(colour: string, seq: number) {
  if (!L) return undefined;
  return L.divIcon({
    className: '',
    html: `<div style="
      width:22px;height:22px;
      background:${colour};
      border:2px solid rgba(255,255,255,0.7);
      border-radius:50%;
      display:flex;align-items:center;justify-content:center;
      font-size:9px;font-weight:700;color:white;
      box-shadow:0 1px 4px rgba(0,0,0,0.4);
    ">${seq}</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    popupAnchor: [0, -13],
  });
}

interface LiveMapProps {
  routes: ActiveRoute[];
  selectedRouteId: string | null;
  onSelectRoute: (routeId: string) => void;
}

export function LiveMap({ routes, selectedRouteId, onSelectRoute }: LiveMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<import('leaflet').Map | null>(null);
  const layerGroupRef = useRef<import('leaflet').LayerGroup | null>(null);

  // Init map
  useEffect(() => {
    if (!L || !mapRef.current || mapInstanceRef.current) return;

    const map = L.map(mapRef.current, {
      center: [52.5, -1.5],  // UK centre
      zoom: 7,
      zoomControl: true,
      attributionControl: false,
    });

    // Dark CartoDB tile layer
    L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      { maxZoom: 19, subdomains: 'abcd' }
    ).addTo(map);

    L.control.attribution({ prefix: '© OpenStreetMap © CARTO' }).addTo(map);

    const group = L.layerGroup().addTo(map);
    layerGroupRef.current = group;
    mapInstanceRef.current = map;

    return () => { map.remove(); mapInstanceRef.current = null; };
  }, []);

  // Re-render markers & polylines when routes change
  useEffect(() => {
    if (!L || !layerGroupRef.current) return;
    const group = layerGroupRef.current;
    group.clearLayers();

    for (const route of routes) {
      const isSelected = route.routeId === selectedRouteId;
      const hasRed = route.stops.some(
        (s) => s.turnAlert?.level === 'RED' && s.status === 'pending'
      );

      // Route polyline from ordered pending/completed stops
      const latLngs = route.stops
        .filter((s) => s.pin.lat && s.pin.lon)
        .sort((a, b) => a.sequence - b.sequence)
        .map((s) => [s.pin.lat, s.pin.lon] as [number, number]);

      if (latLngs.length > 1) {
        L.polyline(latLngs, {
          color: isSelected ? '#01696f' : '#3f3f3f',
          weight: isSelected ? 3 : 1.5,
          opacity: isSelected ? 0.9 : 0.4,
          dashArray: isSelected ? undefined : '4 4',
        }).addTo(group);
      }

      // Stop markers
      for (const stop of route.stops) {
        if (!stop.pin.lat || !stop.pin.lon) continue;
        const colour = stop.turnAlert?.level
          ? (stop.status !== 'pending' ? ALERT_COLOURS[stop.status] : ALERT_COLOURS[stop.turnAlert.level])
          : ALERT_COLOURS[stop.status];

        const icon = makeStopIcon(colour, stop.sequence + 1);
        if (!icon) continue;

        L.marker([stop.pin.lat, stop.pin.lon], { icon })
          .bindPopup(`
            <div style="font:12px/1.5 system-ui;min-width:180px">
              <b>#${stop.sequence + 1} ${stop.address}</b><br/>
              Status: ${stop.status}<br/>
              ETA: ${new Date(stop.eta).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}<br/>
              ${stop.turnAlert ? `Turn: ${stop.turnAlert.level} (${(stop.turnAlert.score * 100).toFixed(0)}%)<br/>` : ''}
              ${stop.pin.last50mInstruction ? `<i>${stop.pin.last50mInstruction}</i>` : ''}
            </div>
          `)
          .addTo(group);
      }

      // Driver position marker
      if (route.currentLat && route.currentLon) {
        const driverColour = hasRed ? '#ef4444' : isSelected ? '#01696f' : '#6b7280';
        const icon = makeDriverIcon(driverColour);
        if (!icon) continue;

        L.marker([route.currentLat, route.currentLon], { icon })
          .bindPopup(`
            <div style="font:12px/1.5 system-ui">
              <b>${route.driverName}</b><br/>
              ${route.vehicleLabel}<br/>
              ${route.completedStops}/${route.totalStops} stops done
            </div>
          `)
          .on('click', () => onSelectRoute(route.routeId))
          .addTo(group);
      }
    }
  }, [routes, selectedRouteId, onSelectRoute]);

  return (
    <div
      ref={mapRef}
      className="w-full h-full rounded-xl overflow-hidden"
      style={{ background: '#171614' }}
    />
  );
}
