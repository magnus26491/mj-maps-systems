/**
 * MJ Maps — Dispatcher Console
 * Simulated data layer + full UI logic
 *
 * In production: replace MOCK_DATA fetches with WebSocket
 * subscriptions to the route-engine and replan-engine APIs.
 */

'use strict';

// ══════════════════════════════════════════════════════════════════
// MOCK DATA — simulates live fleet state
// ══════════════════════════════════════════════════════════════════

const VEHICLES = [
  { id: 'swb_van',  label: 'SWB Van' },
  { id: 'lwb_van',  label: 'LWB Van' },
  { id: 'luton',    label: 'Luton Van' },
  { id: 'hgv_75t',  label: '7.5t HGV' },
];

const DRIVERS = [
  { id: 'd1', name: 'James Hartley',  vehicle: 'SWB Van',  status: 'on_time',  stops: 42, completed: 18, failed: 1, eta: '14:32', lat: 32, lng: 28, alertLevel: 'green' },
  { id: 'd2', name: 'Sophie Clarke',  vehicle: 'LWB Van',  status: 'delayed',  stops: 38, completed: 22, failed: 0, eta: '15:10', lat: 55, lng: 60, alertLevel: 'amber' },
  { id: 'd3', name: 'Ravi Patel',     vehicle: 'Luton Van', status: 'on_time', stops: 55, completed: 31, failed: 2, eta: '13:58', lat: 70, lng: 40, alertLevel: 'green' },
  { id: 'd4', name: 'Emma Watson',    vehicle: '7.5t HGV', status: 'blocked',  stops: 28, completed: 10, failed: 3, eta: '16:45', lat: 20, lng: 72, alertLevel: 'red' },
  { id: 'd5', name: 'Tom Bradley',    vehicle: 'SWB Van',  status: 'on_time',  stops: 47, completed: 29, failed: 0, eta: '14:15', lat: 80, lng: 20, alertLevel: 'green' },
];

const STOPS_DATA = [
  { seq: 1,  ref: 'MJM-001', address: '14 Thornton Way, Birmingham B12 8QR',    driver: 'James Hartley',  eta: '10:32', status: 'COMPLETED', turn: 'GREEN'  },
  { seq: 2,  ref: 'MJM-002', address: 'Oak Farm, Coventry Road, Meriden CV7 7JB', driver: 'Ravi Patel',    eta: '11:05', status: 'COMPLETED', turn: 'AMBER'  },
  { seq: 3,  ref: 'MJM-003', address: 'Unit 4, Apex Business Park, Halesowen',   driver: 'Sophie Clarke', eta: '11:40', status: 'COMPLETED', turn: 'GREEN'  },
  { seq: 4,  ref: 'MJM-004', address: '7 Priory Street, Dudley DY1 1EQ',         driver: 'Emma Watson',   eta: '12:15', status: 'FAILED',    turn: 'RED'    },
  { seq: 5,  ref: 'MJM-005', address: 'Rose Cottage, Church Lane, Lapworth',     driver: 'Tom Bradley',   eta: '12:45', status: 'EN_ROUTE',  turn: 'AMBER'  },
  { seq: 6,  ref: 'MJM-006', address: '23 Lichfield Road, Sutton Coldfield B74', driver: 'James Hartley', eta: '13:10', status: 'EN_ROUTE',  turn: 'GREEN'  },
  { seq: 7,  ref: 'MJM-007', address: 'The Old Barn, Henley-in-Arden B95 5QP',  driver: 'Emma Watson',   eta: '13:55', status: 'PENDING',   turn: 'RED'    },
  { seq: 8,  ref: 'MJM-008', address: '88 Stratford Road, Solihull B90 3AX',    driver: 'Ravi Patel',    eta: '14:20', status: 'PENDING',   turn: 'GREEN'  },
  { seq: 9,  ref: 'MJM-009', address: 'Manor Farm, Exhall Road, Alcester',       driver: 'Sophie Clarke', eta: '14:45', status: 'PENDING',   turn: 'AMBER'  },
  { seq: 10, ref: 'MJM-010', address: '55 New Road, Bromsgrove B60 2LT',         driver: 'Tom Bradley',   eta: '15:05', status: 'PENDING',   turn: 'GREEN'  },
  { seq: 11, ref: 'MJM-011', address: '3 Castle Street, Kenilworth CV8 1NB',     driver: 'James Hartley', eta: '15:30', status: 'PENDING',   turn: 'GREEN'  },
  { seq: 12, ref: 'MJM-012', address: 'Blythe Valley Pk, Solihull B90 8AJ',     driver: 'Emma Watson',   eta: '15:50', status: 'PENDING',   turn: 'RED'    },
];

const ALERTS_DATA = [
  { id: 'a1', severity: 'HIGH',   icon: '🚧', title: 'Emma Watson — Bridge restriction BLOCKED',    sub: 'Route to The Old Barn cannot be completed in 7.5t HGV. Reassign to smaller vehicle.', time: '12:18' },
  { id: 'a2', severity: 'HIGH',   icon: '❌', title: 'Emma Watson — Failed drop: 7 Priory St',      sub: 'Customer not in. Rebooked for tomorrow. Replan triggered.', time: '12:15' },
  { id: 'a3', severity: 'MEDIUM', icon: '⚠️', title: 'Sophie Clarke — Running 38 min late',         sub: 'Dwell overrun at Unit 4 Apex Business Park. ETAs updated.', time: '11:48' },
  { id: 'a4', severity: 'MEDIUM', icon: '🔄', title: 'Ravi Patel — Turn warning: Oak Farm',         sub: 'AMBER turn score on approach. Driver notified at 300m.', time: '11:03' },
  { id: 'a5', severity: 'LOW',    icon: 'ℹ️',  title: 'Tom Bradley — Route resequenced',             sub: 'STOP_INSERTED: urgent stop added at position 6.', time: '10:55' },
  { id: 'a6', severity: 'LOW',    icon: '🟢', title: 'James Hartley — On time, 18/42 stops done',   sub: 'All ETAs within window. No action needed.', time: '10:30' },
];

// ══════════════════════════════════════════════════════════════════
// STATE
// ══════════════════════════════════════════════════════════════════

let activeView    = 'fleet';
let selectedDriver = null;
let stopFilter    = 'all';
let stopSearch    = '';

// ══════════════════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initNav();
  initClock();
  renderFleet();
  renderStops();
  renderAlerts();
  renderAnalytics();
  initInjectModal();
  initDetailPanel();
  updateKpis();
  updateAlertBadge();

  document.getElementById('refresh-btn').addEventListener('click', () => {
    pulseRefresh();
  });

  // Stop search/filter
  document.getElementById('stop-search').addEventListener('input', e => {
    stopSearch = e.target.value.toLowerCase();
    renderStops();
  });
  document.getElementById('stop-filter').addEventListener('change', e => {
    stopFilter = e.target.value;
    renderStops();
  });
});

// ══════════════════════════════════════════════════════════════════
// THEME
// ══════════════════════════════════════════════════════════════════

function initTheme() {
  const toggle = document.querySelector('[data-theme-toggle]');
  const html   = document.documentElement;
  let theme    = 'dark';
  toggle && toggle.addEventListener('click', () => {
    theme = theme === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', theme);
    toggle.innerHTML = theme === 'dark'
      ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>'
      : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>';
  });
}

// ══════════════════════════════════════════════════════════════════
// NAV
// ══════════════════════════════════════════════════════════════════

function initNav() {
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      setView(view);
    });
  });
}

function setView(view) {
  activeView = view;
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === `view-${view}`));
  const titles = { fleet: 'Fleet Overview', stops: 'Stop Management', alerts: 'Alerts & Events', analytics: 'Analytics' };
  document.getElementById('page-title').textContent = titles[view] || view;
}

// ══════════════════════════════════════════════════════════════════
// CLOCK
// ══════════════════════════════════════════════════════════════════

function initClock() {
  const el = document.getElementById('shift-clock');
  function tick() {
    const now = new Date();
    el.textContent = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
  tick();
  setInterval(tick, 1000);
}

// ══════════════════════════════════════════════════════════════════
// KPIs
// ══════════════════════════════════════════════════════════════════

function updateKpis() {
  const active    = DRIVERS.filter(d => d.status !== 'done').length;
  const completed = STOPS_DATA.filter(s => s.status === 'COMPLETED').length;
  const failed    = STOPS_DATA.filter(s => s.status === 'FAILED').length;
  const blocked   = ALERTS_DATA.filter(a => a.severity === 'HIGH').length;
  document.getElementById('kpi-active').textContent    = active;
  document.getElementById('kpi-completed').textContent = completed;
  document.getElementById('kpi-failed').textContent    = failed;
  document.getElementById('kpi-blocked').textContent   = blocked;
}

function updateAlertBadge() {
  const badge = document.getElementById('alert-badge');
  const highCount = ALERTS_DATA.filter(a => a.severity === 'HIGH').length;
  badge.textContent = highCount;
  badge.setAttribute('data-count', highCount);
  badge.style.display = highCount > 0 ? 'flex' : 'none';
}

// ══════════════════════════════════════════════════════════════════
// FLEET VIEW
// ══════════════════════════════════════════════════════════════════

function renderFleet() {
  renderDriverList();
  renderMapMarkers();
  document.getElementById('driver-count').textContent = `${DRIVERS.length} drivers`;
}

function renderDriverList() {
  const list = document.getElementById('driver-list');
  list.innerHTML = '';
  DRIVERS.forEach(d => {
    const card = document.createElement('div');
    card.className = 'driver-card';
    card.innerHTML = `
      <div class="driver-card-top">
        <div>
          <div class="driver-name">${d.name}</div>
          <div class="driver-vehicle">${d.vehicle}</div>
        </div>
        <span class="status-pill pill-${d.alertLevel}">${statusLabel(d.status)}</span>
      </div>
      <div class="driver-card-stats">
        <div class="d-stat"><span class="d-stat-val">${d.completed}/${d.stops}</span><span class="d-stat-lbl">Stops</span></div>
        <div class="d-stat"><span class="d-stat-val">${d.failed}</span><span class="d-stat-lbl">Failed</span></div>
        <div class="d-stat"><span class="d-stat-val">${d.eta}</span><span class="d-stat-lbl">ETA done</span></div>
      </div>`;
    card.addEventListener('click', () => openDriverDetail(d));
    list.appendChild(card);
  });
}

function renderMapMarkers() {
  const container = document.getElementById('map-markers');
  const canvas    = document.getElementById('map-canvas');
  container.innerHTML = '';
  DRIVERS.forEach(d => {
    const pin = document.createElement('div');
    pin.className = `driver-pin ${d.alertLevel}`;
    // Convert pseudo lat/lng (0-100) to % positions on map
    pin.style.left = `${d.lng}%`;
    pin.style.top  = `${d.lat}%`;
    pin.textContent = d.name.split(' ').map(n => n[0]).join('');
    pin.title = `${d.name} — ${statusLabel(d.status)}`;
    pin.addEventListener('click', () => openDriverDetail(d));
    container.appendChild(pin);
  });
}

function statusLabel(s) {
  return { on_time: 'On Time', delayed: 'Delayed', blocked: 'Blocked', done: 'Done' }[s] || s;
}

// ══════════════════════════════════════════════════════════════════
// STOPS VIEW
// ══════════════════════════════════════════════════════════════════

function renderStops() {
  const tbody = document.getElementById('stops-tbody');
  tbody.innerHTML = '';

  const filtered = STOPS_DATA.filter(s => {
    const matchFilter = stopFilter === 'all' || s.status === stopFilter;
    const matchSearch = !stopSearch ||
      s.address.toLowerCase().includes(stopSearch) ||
      s.ref.toLowerCase().includes(stopSearch) ||
      s.driver.toLowerCase().includes(stopSearch);
    return matchFilter && matchSearch;
  });

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--color-text-faint)">No stops match filter</td></tr>`;
    return;
  }

  filtered.forEach(s => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="mono">${s.seq}</td>
      <td class="mono">${s.ref}</td>
      <td class="address" title="${s.address}">${s.address}</td>
      <td>${s.driver}</td>
      <td class="mono">${s.eta}</td>
      <td><span class="status-pill ${statusPillClass(s.status)}">${s.status}</span></td>
      <td><span class="turn-badge turn-${s.turn.toLowerCase()}">${s.turn}</span></td>
      <td>
        <button class="action-btn" data-ref="${s.ref}">Reassign</button>
      </td>`;
    tbody.appendChild(tr);
  });

  // Reassign buttons
  tbody.querySelectorAll('.action-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      pushAlert({ id: `ra-${Date.now()}`, severity: 'LOW', icon: '🔄', title: `Stop ${btn.dataset.ref} marked for reassignment`, sub: 'Dispatcher action logged', time: nowHHMM() });
      updateAlertBadge();
    });
  });
}

function statusPillClass(s) {
  return { COMPLETED: 'pill-green', EN_ROUTE: 'pill-blue', PENDING: 'pill-blue', FAILED: 'pill-red', BLOCKED: 'pill-red' }[s] || 'pill-blue';
}

// ══════════════════════════════════════════════════════════════════
// ALERTS VIEW
// ══════════════════════════════════════════════════════════════════

function renderAlerts() {
  const list = document.getElementById('alerts-list');
  list.innerHTML = '';

  if (!ALERTS_DATA.length) {
    list.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
        <h3>No active alerts</h3>
        <p>All drivers are operating within expected parameters.</p>
      </div>`;
    return;
  }

  ALERTS_DATA.forEach(a => {
    const card = document.createElement('div');
    card.className = `alert-card severity-${a.severity}`;
    card.innerHTML = `
      <div class="alert-icon ${a.severity}">${a.icon}</div>
      <div class="alert-content">
        <div class="alert-title">${a.title}</div>
        <div class="alert-sub">${a.sub}</div>
      </div>
      <div class="alert-time">${a.time}</div>`;
    list.appendChild(card);
  });
}

function pushAlert(alert) {
  ALERTS_DATA.unshift(alert);
  renderAlerts();
  updateAlertBadge();
}

// ══════════════════════════════════════════════════════════════════
// ANALYTICS VIEW
// ══════════════════════════════════════════════════════════════════

function renderAnalytics() {
  const completed  = STOPS_DATA.filter(s => s.status === 'COMPLETED').length;
  const failed     = STOPS_DATA.filter(s => s.status === 'FAILED').length;
  const total      = STOPS_DATA.length;
  const failRate   = total ? ((failed / total) * 100).toFixed(1) + '%' : '0%';
  const avgStops   = (DRIVERS.reduce((a, d) => a + d.stops, 0) / DRIVERS.length).toFixed(0);
  const turnAlerts = STOPS_DATA.filter(s => s.turn === 'AMBER' || s.turn === 'RED').length;

  document.getElementById('stat-completed').textContent  = completed;
  document.getElementById('stat-avg').textContent        = avgStops;
  document.getElementById('stat-fail-rate').textContent  = failRate;
  document.getElementById('stat-turn').textContent       = turnAlerts;
}

// ══════════════════════════════════════════════════════════════════
// INJECT STOP MODAL
// ══════════════════════════════════════════════════════════════════

function initInjectModal() {
  const overlay = document.getElementById('inject-modal');
  const open    = document.getElementById('inject-stop-btn');
  const close   = document.getElementById('inject-close');
  const cancel  = document.getElementById('inject-cancel');
  const confirm = document.getElementById('inject-confirm');
  const driverSel = document.getElementById('inject-driver');

  // Populate driver select
  DRIVERS.forEach(d => {
    const opt = document.createElement('option');
    opt.value = d.id;
    opt.textContent = `${d.name} (${d.vehicle})`;
    driverSel.appendChild(opt);
  });

  open.addEventListener('click', () => overlay.classList.add('open'));
  close.addEventListener('click', () => overlay.classList.remove('open'));
  cancel.addEventListener('click', () => overlay.classList.remove('open'));
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.classList.remove('open'); });

  confirm.addEventListener('click', () => {
    const addr   = document.getElementById('inject-address').value.trim();
    const drivId = driverSel.value;
    if (!addr) { document.getElementById('inject-address').focus(); return; }

    const driver = DRIVERS.find(d => d.id === drivId);
    const newRef = `MJM-${String(STOPS_DATA.length + 1).padStart(3, '0')}`;
    STOPS_DATA.push({
      seq:     STOPS_DATA.length + 1,
      ref:     newRef,
      address: addr,
      driver:  driver?.name ?? 'Unassigned',
      eta:     '—',
      status:  'PENDING',
      turn:    'GREEN',
    });

    pushAlert({
      id:       `inj-${Date.now()}`,
      severity: 'LOW',
      icon:     '📍',
      title:    `Stop injected: ${addr}`,
      sub:      `Assigned to ${driver?.name}. Route resequencing triggered.`,
      time:     nowHHMM(),
    });

    renderStops();
    updateKpis();
    overlay.classList.remove('open');
    document.getElementById('inject-address').value = '';
  });
}

// ══════════════════════════════════════════════════════════════════
// DRIVER DETAIL PANEL
// ══════════════════════════════════════════════════════════════════

function initDetailPanel() {
  document.getElementById('detail-close').addEventListener('click', closeDetail);
}

function openDriverDetail(driver) {
  selectedDriver = driver;
  const panel = document.getElementById('detail-panel');
  document.getElementById('detail-driver-name').textContent = driver.name;

  const driverStops = STOPS_DATA.filter(s => s.driver === driver.name);
  const body = document.getElementById('detail-body');

  body.innerHTML = `
    <div class="detail-section">
      <div class="detail-section-title">Status</div>
      <div class="detail-row"><span class="detail-key">Vehicle</span><span class="detail-val">${driver.vehicle}</span></div>
      <div class="detail-row"><span class="detail-key">Status</span><span class="detail-val">${statusLabel(driver.status)}</span></div>
      <div class="detail-row"><span class="detail-key">Stops done</span><span class="detail-val">${driver.completed} / ${driver.stops}</span></div>
      <div class="detail-row"><span class="detail-key">Failed drops</span><span class="detail-val">${driver.failed}</span></div>
      <div class="detail-row"><span class="detail-key">ETA (shift end)</span><span class="detail-val">${driver.eta}</span></div>
    </div>
    <div class="detail-section">
      <div class="detail-section-title">Stops on route</div>
      ${driverStops.map(s => `
        <div class="stop-row-detail">
          <span class="stop-seq">#${s.seq}</span>
          <span class="stop-addr">${s.address}</span>
          <span class="status-pill ${statusPillClass(s.status)}" style="font-size:0.6rem">${s.status}</span>
        </div>`).join('')}
      ${!driverStops.length ? '<div style="color:var(--color-text-faint);font-size:0.78rem">No stops assigned</div>' : ''}
    </div>
    <div class="detail-section">
      <div class="detail-section-title">Actions</div>
      <button class="btn btn-secondary" style="width:100%;margin-bottom:8px" onclick="pushAlert({id:'msg-'+Date.now(),severity:'LOW',icon:'💬',title:'Message sent to ${driver.name}',sub:'Dispatcher notification delivered',time:'${nowHHMM()}'});updateAlertBadge()">📨 Send Message</button>
      <button class="btn btn-secondary" style="width:100%" onclick="pushAlert({id:'rp-'+Date.now(),severity:'LOW',icon:'🔄',title:'Manual replan triggered for ${driver.name}',sub:'Route resequenced from current GPS position',time:'${nowHHMM()}'});updateAlertBadge()">↻ Manual Replan</button>
    </div>`;

  panel.classList.add('open');
}

function closeDetail() {
  document.getElementById('detail-panel').classList.remove('open');
  selectedDriver = null;
}

// ══════════════════════════════════════════════════════════════════
// UTILS
// ══════════════════════════════════════════════════════════════════

function nowHHMM() {
  return new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function pulseRefresh() {
  const btn = document.getElementById('refresh-btn');
  btn.textContent = '↻ Refreshing...';
  btn.disabled = true;
  setTimeout(() => {
    renderFleet();
    renderStops();
    renderAlerts();
    renderAnalytics();
    updateKpis();
    btn.textContent = '↻ Refresh';
    btn.disabled = false;
  }, 800);
}
