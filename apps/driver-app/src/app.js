/**
 * MJ Maps Driver App — main JS
 *
 * Architecture:
 *   state        — single source of truth (in-memory)
 *   render*()
 *   handlers     — user events
 *   initMap()    — Leaflet setup
 *   simulateTurnAlerts() — fires turn alerts based on proximity to stops
 *
 * In production:
 *   · state.route is fetched from /api/routes/:shiftId
 *   · GPS position comes from navigator.geolocation.watchPosition
 *   · Replan calls POST /api/replan
 *   · WebSocket heartbeat updates ETAs every 2 min
 */

// ── Demo data ──────────────────────────────────────────────────────────────

const VEHICLE_PROFILES = {
  swb_van:    { label: 'SWB Van',      heightM: 2.4, widthM: 2.0, weightT: 2.0, minRoadWidthTurn: 6.0 },
  lwb_van:    { label: 'LWB Van',      heightM: 2.6, widthM: 2.1, weightT: 2.5, minRoadWidthTurn: 6.5 },
  luton:      { label: 'Luton Van',    heightM: 3.2, widthM: 2.3, weightT: 3.5, minRoadWidthTurn: 7.5 },
  luton_tail: { label: 'Luton+Tail',   heightM: 3.2, widthM: 2.3, weightT: 3.8, minRoadWidthTurn: 8.0 },
  hgv_75t:    { label: '7.5t HGV',     heightM: 3.7, widthM: 2.5, weightT: 7.5, minRoadWidthTurn: 10.0 },
  hgv_18t:    { label: '18t Rigid',    heightM: 4.0, widthM: 2.5, weightT: 18,  minRoadWidthTurn: 12.0 },
  artic:      { label: 'Artic',        heightM: 4.0, widthM: 2.5, weightT: 40,  minRoadWidthTurn: 15.0 },
};

const DEMO_STOPS = [
  { id:'s01', seq:1,  address:'14 Orchard Lane, Chelmsford CM1 4PP',     lat:51.7361, lng:0.4798,  eta:'09:15', dist:'0.8 km',  turn:'GREEN',  roadWidthM:8.0,  status:'PENDING'   },
  { id:'s02', seq:2,  address:'Apex Business Park, Unit 7, CM2 6GP',     lat:51.7290, lng:0.4850,  eta:'09:32', dist:'1.4 km',  turn:'GREEN',  roadWidthM:12.0, status:'PENDING'   },
  { id:'s03', seq:3,  address:'Brook Farm, Writtle Road, CM1 3AA',        lat:51.7180, lng:0.4610,  eta:'09:51', dist:'2.1 km',  turn:'RED',    roadWidthM:3.5,  status:'PENDING'   },
  { id:'s04', seq:4,  address:'22 Riverside Close, Maldon CM9 4JB',      lat:51.7310, lng:0.6750,  eta:'10:18', dist:'3.6 km',  turn:'AMBER',  roadWidthM:5.5,  status:'PENDING'   },
  { id:'s05', seq:5,  address:'Tesco Extra, Princes Road, CM2 9TT',      lat:51.7220, lng:0.4920,  eta:'10:45', dist:'2.8 km',  turn:'GREEN',  roadWidthM:15.0, status:'PENDING'   },
  { id:'s06', seq:6,  address:'12 Willowbrook Drive, Springfield CM1 7PQ',lat:51.7450, lng:0.5100,  eta:'11:02', dist:'1.9 km',  turn:'AMBER',  roadWidthM:6.0,  status:'PENDING'   },
  { id:'s07', seq:7,  address:'Old Hall Farm, Danbury CM3 4NR',           lat:51.7060, lng:0.5550,  eta:'11:35', dist:'4.2 km',  turn:'RED',    roadWidthM:4.0,  status:'PENDING'   },
  { id:'s08', seq:8,  address:'44 Kings Road, Chelmsford CM1 1PA',        lat:51.7350, lng:0.4680,  eta:'12:00', dist:'5.1 km',  turn:'GREEN',  roadWidthM:9.0,  status:'PENDING'   },
  { id:'s09', seq:9,  address:'Chelmer Village Retail, CM2 6PH',          lat:51.7240, lng:0.5010,  eta:'12:20', dist:'1.3 km',  turn:'GREEN',  roadWidthM:11.0, status:'PENDING'   },
  { id:'s10', seq:10, address:'Galleywood Common, Stock Road CM2 8TU',    lat:51.7080, lng:0.4810,  eta:'12:45', dist:'2.7 km',  turn:'AMBER',  roadWidthM:5.8,  status:'PENDING'   },
  { id:'s11', seq:11, address:'New Street Works, Witham CM8 2AF',         lat:51.7981, lng:0.6394,  eta:'13:20', dist:'7.2 km',  turn:'GREEN',  roadWidthM:10.0, status:'PENDING'   },
  { id:'s12', seq:12, address:'78 Station Road, Braintree CM7 3QD',       lat:51.8780, lng:0.5480,  eta:'14:05', dist:'8.9 km',  turn:'GREEN',  roadWidthM:8.5,  status:'PENDING'   },
];

// ── State ───────────────────────────────────────────────────────────────────

const state = {
  stops:          DEMO_STOPS.map(s => ({...s})),
  currentStopIdx: 0,
  vehicleId:      'luton',
  activeView:     'map',
  activeDeliveryId: null,
  selectedFailReason: null,
  turnAlertsEnabled:  true,
  theme:              'dark',
  map:                null,
  markers:            [],
  driverMarker:       null,
  driverLat:          51.7400,
  driverLng:          0.4780,
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function currentStop() { return state.stops[state.currentStopIdx] || null; }

function pendingCount() { return state.stops.filter(s => s.status === 'PENDING').length; }

function turnIcon(level) {
  if (level === 'GREEN') return '🟢';
  if (level === 'AMBER') return '🟡';
  return '🔴';
}

function turnLabel(level, roadWidthM, vehicleId) {
  const v = VEHICLE_PROFILES[vehicleId];
  if (level === 'GREEN') return `Turn OK — road ${roadWidthM}m (need ${v.minRoadWidthTurn}m)`;
  if (level === 'AMBER') return `Tight — road ${roadWidthM}m, proceed carefully`;
  return `Cannot turn — road ${roadWidthM}m is too narrow for your ${v.label}`;
}

function turnScore(roadWidthM, vehicleId) {
  const v = VEHICLE_PROFILES[vehicleId];
  const ratio = roadWidthM / v.minRoadWidthTurn;
  if (ratio >= 0.75) return 'GREEN';
  if (ratio >= 0.40) return 'AMBER';
  return 'RED';
}

// Recompute turn levels whenever vehicle changes
function recomputeTurnScores() {
  state.stops = state.stops.map(s => ({
    ...s,
    turn: turnScore(s.roadWidthM, state.vehicleId),
  }));
}

// ── View navigation ─────────────────────────────────────────────────────────

function showView(viewId) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const el = document.getElementById(`view-${viewId}`);
  if (el) el.classList.add('active');

  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.view === viewId);
  });
  state.activeView = viewId;
}

// ── Render: next-stop card ───────────────────────────────────────────────────

function renderNextStopCard() {
  const stop = currentStop();
  if (!stop) return;
  const total   = state.stops.length;
  const pending = pendingCount();

  document.getElementById('stop-seq').textContent     = `${stop.seq} of ${total}`;
  document.getElementById('stop-address').textContent = stop.address;
  document.getElementById('stop-dist').textContent    = stop.dist;
  document.getElementById('stop-eta').textContent     = `ETA ${stop.eta}`;

  const turnEl = document.getElementById('stop-turn');
  turnEl.textContent = `${turnIcon(stop.turn)} Turn ${stop.turn === 'GREEN' ? 'OK' : stop.turn}`;
  turnEl.className = `meta-chip meta-chip--turn ${stop.turn.toLowerCase()}`;
}

// ── Render: stops list ──────────────────────────────────────────────────────

function renderStopsList() {
  const list = document.getElementById('stops-list');
  list.innerHTML = '';

  const totalDist = state.stops.reduce((acc, s) => acc + parseFloat(s.dist), 0).toFixed(1);
  const lastEta   = state.stops[state.stops.length - 1]?.eta || '--';
  document.getElementById('stops-summary').textContent =
    `${state.stops.length} stops · ${totalDist} km · ETA finish ${lastEta}`;

  state.stops.forEach((stop, idx) => {
    const li = document.createElement('li');
    li.className = `stop-item ${stop.status.toLowerCase()}`;
    li.dataset.id = stop.id;

    const isCurrent = idx === state.currentStopIdx && stop.status === 'PENDING';
    const seqClass  = stop.status === 'COMPLETED' ? 'done'
                    : stop.status === 'FAILED'    ? 'failed'
                    : isCurrent                   ? 'current' : '';

    li.innerHTML = `
      <div class="stop-item__seq ${seqClass}">${stop.seq}</div>
      <div class="stop-item__body">
        <div class="stop-item__addr">${stop.address}</div>
        <div class="stop-item__meta">ETA ${stop.eta} · ${stop.dist}</div>
      </div>
      <div class="stop-item__turn">${turnIcon(stop.turn)}</div>
    `;

    li.addEventListener('click', () => openDeliveryView(stop.id));
    list.appendChild(li);
  });
}

// ── Render: delivery view ───────────────────────────────────────────────────

function openDeliveryView(stopId) {
  const stop = state.stops.find(s => s.id === stopId);
  if (!stop) return;
  state.activeDeliveryId = stopId;

  document.getElementById('delivery-stop-title').textContent = `Stop ${stop.seq}`;
  document.getElementById('delivery-address').textContent    = stop.address;

  // Turn summary
  const ind  = document.getElementById('turn-indicator');
  const lbl  = document.getElementById('turn-label');
  const rec  = document.getElementById('turn-rec');
  const turnSummary = document.getElementById('turn-summary');
  ind.textContent = turnIcon(stop.turn);
  lbl.textContent = stop.turn === 'GREEN' ? 'Turn OK'
                  : stop.turn === 'AMBER' ? 'Tight turn — caution'
                  : 'Cannot turn — road too narrow';
  rec.textContent = turnLabel(stop.turn, stop.roadWidthM, state.vehicleId);

  turnSummary.className = `turn-summary ${stop.turn.toLowerCase()}`;

  document.getElementById('scan-input').value   = '';
  document.getElementById('delivery-notes').value = '';

  showView('delivery');
}

// ── Turn alert overlay ──────────────────────────────────────────────────────

function showTurnAlert(stop) {
  if (!state.turnAlertsEnabled) return;

  const overlay = document.getElementById('turn-alert');
  const icon    = document.getElementById('turn-alert-icon');
  const title   = document.getElementById('turn-alert-title');
  const sub     = document.getElementById('turn-alert-sub');

  if (stop.turn === 'GREEN') {
    overlay.className = 'turn-alert hidden';
    return;
  }

  icon.textContent  = turnIcon(stop.turn);
  title.textContent = stop.turn === 'AMBER' ? 'Tight road ahead' : 'Cannot turn here';
  sub.textContent   = turnLabel(stop.turn, stop.roadWidthM, state.vehicleId);
  overlay.className = `turn-alert ${stop.turn.toLowerCase()}`;

  if (stop.turn === 'RED') {
    // Auto-dismiss after 8s
    setTimeout(() => {
      if (!overlay.classList.contains('hidden')) overlay.className = 'turn-alert hidden';
    }, 8000);
  }
}

// ── Map ─────────────────────────────────────────────────────────────────────

function initMap() {
  if (typeof L === 'undefined') return;

  // Remove placeholder
  const placeholder = document.querySelector('.map-placeholder');
  if (placeholder) placeholder.remove();

  const map = L.map('map-container', {
    center:          [state.driverLat, state.driverLng],
    zoom:            13,
    zoomControl:     false,
    attributionControl: false,
  });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
  }).addTo(map);

  state.map = map;

  // Driver position marker
  const driverIcon = L.divIcon({
    className: '',
    html: '<div style="width:16px;height:16px;background:#00c2a8;border-radius:50%;border:3px solid #fff;box-shadow:0 0 0 4px rgba(0,194,168,0.25)"></div>',
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
  state.driverMarker = L.marker([state.driverLat, state.driverLng], { icon: driverIcon }).addTo(map);

  // Stop markers
  state.stops.forEach((stop, idx) => {
    const colour = stop.turn === 'GREEN' ? '#22c55e' : stop.turn === 'AMBER' ? '#f59e0b' : '#ef4444';
    const icon = L.divIcon({
      className: '',
      html: `<div style="width:26px;height:26px;background:${colour};border-radius:50%;border:2px solid rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#000;font-family:Inter,sans-serif">${stop.seq}</div>`,
      iconSize: [26, 26],
      iconAnchor: [13, 13],
    });
    const marker = L.marker([stop.lat, stop.lng], { icon }).addTo(map);
    marker.on('click', () => openDeliveryView(stop.id));
    state.markers.push(marker);
  });

  // Draw route polyline
  const latlngs = state.stops.map(s => [s.lat, s.lng]);
  L.polyline(latlngs, { color: '#00c2a8', weight: 2.5, opacity: 0.6, dashArray: '6 4' }).addTo(map);
}

// ── Handlers ────────────────────────────────────────────────────────────────

function handleArrived() {
  const stop = currentStop();
  if (!stop) return;
  openDeliveryView(stop.id);
}

function handleComplete() {
  const stop = state.stops.find(s => s.id === state.activeDeliveryId);
  if (!stop) return;
  stop.status = 'COMPLETED';

  // Advance to next pending stop
  const nextIdx = state.stops.findIndex((s, i) => i > state.stops.indexOf(stop) && s.status === 'PENDING');
  if (nextIdx !== -1) state.currentStopIdx = nextIdx;

  // Update map marker
  const markerIdx = state.stops.indexOf(stop);
  if (state.markers[markerIdx]) {
    const doneIcon = L.divIcon({
      className: '',
      html: `<div style="width:26px;height:26px;background:#22c55e;border-radius:50%;border:2px solid rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:14px;color:#000">✓</div>`,
      iconSize: [26, 26], iconAnchor: [13, 13],
    });
    state.markers[markerIdx].setIcon(doneIcon);
  }

  renderNextStopCard();
  renderStopsList();
  showView('map');

  // Show turn alert for next stop
  const next = currentStop();
  if (next) showTurnAlert(next);
}

function handleFailedConfirm() {
  const stop = state.stops.find(s => s.id === state.activeDeliveryId);
  if (!stop || !state.selectedFailReason) return;
  stop.status = 'FAILED';

  const nextIdx = state.stops.findIndex((s, i) => i > state.stops.indexOf(stop) && s.status === 'PENDING');
  if (nextIdx !== -1) state.currentStopIdx = nextIdx;

  renderNextStopCard();
  renderStopsList();
  state.selectedFailReason = null;
  document.querySelectorAll('.reason-btn').forEach(b => b.classList.remove('selected'));
  document.getElementById('btn-confirm-failed').disabled = true;
  showView('map');
}

function handleVehicleChange(vehicleId) {
  state.vehicleId = vehicleId;
  document.getElementById('vehicle-chip').textContent = VEHICLE_PROFILES[vehicleId].label;
  recomputeTurnScores();
  renderNextStopCard();
  renderStopsList();
  // Refresh map markers
  if (state.map) {
    state.markers.forEach((m, idx) => {
      const stop   = state.stops[idx];
      const colour = stop.turn === 'GREEN' ? '#22c55e' : stop.turn === 'AMBER' ? '#f59e0b' : '#ef4444';
      const icon = L.divIcon({
        className: '',
        html: `<div style="width:26px;height:26px;background:${colour};border-radius:50%;border:2px solid rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#000;font-family:Inter,sans-serif">${stop.seq}</div>`,
        iconSize: [26, 26], iconAnchor: [13, 13],
      });
      m.setIcon(icon);
    });
  }
}

// ── Boot ────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {

  // Initial render
  renderNextStopCard();
  renderStopsList();

  // Map (slight delay so DOM is painted)
  setTimeout(initMap, 100);

  // Show turn alert for first stop if needed
  const first = currentStop();
  if (first) setTimeout(() => showTurnAlert(first), 1200);

  // ── Event listeners ──────────────────────────────────────────────────────

  // Bottom nav
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.view) showView(btn.dataset.view);
    });
  });

  // Arrived button
  document.getElementById('btn-arrived').addEventListener('click', handleArrived);

  // Navigate button (opens external maps)
  document.getElementById('btn-navigate').addEventListener('click', () => {
    const stop = currentStop();
    if (!stop) return;
    const url = `https://maps.google.com/maps?daddr=${stop.lat},${stop.lng}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  });

  // Delivery view: back
  document.getElementById('btn-back-from-delivery').addEventListener('click', () => showView('map'));

  // Delivery view: complete
  document.getElementById('btn-complete').addEventListener('click', handleComplete);

  // Delivery view: report failed
  document.getElementById('btn-failed').addEventListener('click', () => showView('failed'));

  // Failed view: back
  document.getElementById('btn-back-from-failed').addEventListener('click', () => showView('delivery'));

  // Failed view: reason selection
  document.querySelectorAll('.reason-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.reason-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      state.selectedFailReason = btn.dataset.reason;
      document.getElementById('btn-confirm-failed').disabled = false;
    });
  });

  // Failed view: confirm
  document.getElementById('btn-confirm-failed').addEventListener('click', handleFailedConfirm);

  // Turn alert dismiss
  document.getElementById('turn-alert-dismiss').addEventListener('click', () => {
    document.getElementById('turn-alert').className = 'turn-alert hidden';
  });

  // Settings: vehicle
  document.getElementById('vehicle-select').addEventListener('change', e => {
    handleVehicleChange(e.target.value);
  });

  // Settings: turn alerts toggle
  document.getElementById('toggle-turn-alerts').addEventListener('click', function () {
    state.turnAlertsEnabled = !state.turnAlertsEnabled;
    this.textContent = state.turnAlertsEnabled ? 'ON' : 'OFF';
    this.setAttribute('aria-pressed', state.turnAlertsEnabled);
  });

  // Settings: theme toggle
  document.getElementById('toggle-theme').addEventListener('click', function () {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', state.theme);
    this.textContent = state.theme === 'dark' ? 'ON' : 'OFF';
    this.setAttribute('aria-pressed', state.theme === 'dark');
  });
});
