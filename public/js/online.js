import { qrSvg } from './qr.js';

// Online rooms: a WebSocket to /api/rooms/CODE/ws with automatic reconnect
// and a clock offset, so every device counts down to the same moment.

export const ROOM_KEY = 'taboo.online.v1'; // host: { code, hostKey, hostRole, watchers }
export const GUEST_KEY = 'taboo.guest.v1'; // guest: { ids: {CODE: id}, name, team }

export function loadJSON(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
export function saveJSON(key, val) {
  try { if (val == null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(val)); } catch { /* storage unavailable */ }
}

export const cleanCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
export const joinUrl = (code) => `${location.origin}/join?room=${code}`;
export const shortJoinHost = () => `${location.host}/join`;

/** Big-screen join card: a QR code to scan, plus the address and code to type. */
export function joinCardHtml(code, { compact = false } = {}) {
  const c = cleanCode(code);
  const host = String(shortJoinHost()).replace(/[&<>"]/g, '');
  return `<div class="cv-join ${compact ? 'compact' : ''}">${qrSvg(joinUrl(c), { title: `Scan to join room ${c}` })}
    <div class="cv-join-text"><span class="cv-join-scan">📷 Scan to join</span><span>or go to <b>${host}</b></span><span>code <b class="cv-code">${c}</b></span></div></div>`;
}

export async function createRoom() {
  const res = await fetch('/api/rooms', { method: 'POST' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.code) throw new Error(data.error || 'Could not make a room.');
  return data;
}

/**
 * connect({ code, role, key, id, name, team, on: { welcome, state, saved, lobby, roster, act, error, status } })
 * status(s): 'connecting' | 'online' | 'offline'
 */
export function connect(opts) {
  const on = opts.on || {};
  let ws = null;
  let stopped = false;
  let tries = 0;
  let offset = 0; // server clock − this device's clock
  let bestRtt = Infinity;
  let pingTimer = null;
  let params = { role: opts.role, key: opts.key, id: opts.id, name: opts.name, team: opts.team };

  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const status = (s) => on.status?.(s);

  function open() {
    if (stopped) return;
    status('connecting');
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') q.set(k, v);
    ws = new WebSocket(`${proto}//${location.host}/api/rooms/${opts.code}/ws?${q}`);
    const me = ws;
    me.onopen = () => { tries = 0; bestRtt = Infinity; ping(); clearInterval(pingTimer); pingTimer = setInterval(ping, 10000); };
    me.onmessage = (e) => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.type === 'pong') {
        const now = Date.now();
        const rtt = now - m.c;
        if (rtt <= bestRtt * 1.5 || rtt < 400) { bestRtt = Math.min(bestRtt, rtt); offset = m.t + rtt / 2 - now; }
        return;
      }
      if (m.type === 'welcome') { params.id = m.id; if (bestRtt === Infinity) offset = m.t - Date.now(); status('online'); on.welcome?.(m); return; }
      if (m.type === 'error') { stopped = ['no-room', 'bad-key', 'kicked', 'closed'].includes(m.code); on.error?.(m); return; }
      if (m.type === 'state') { on.state?.(toLocal(m.game)); return; }
      if (m.type === 'saved') { on.saved?.(toLocal(m.game)); return; }
      on[m.type]?.(m);
    };
    me.onclose = (ev) => {
      clearInterval(pingTimer);
      if (me !== ws) return;
      // Another tab or page took over as host of this room.
      if (ev?.code === 4002 && params.role === 'host') { stopped = true; status('taken'); on.takenOver?.(); return; }
      status('offline');
      if (stopped) return;
      tries += 1;
      setTimeout(open, Math.min(8000, 400 * 2 ** Math.min(tries, 5)));
    };
  }
  function ping() { if (ws?.readyState === 1) ws.send(JSON.stringify({ type: 'ping', c: Date.now() })); }

  // Times inside the game (endAt, flash.at) travel in server time.
  function shift(game, d) {
    if (!game) return game;
    const g = { ...game };
    if (g.endAt) g.endAt += d;
    if (g.flash?.at) g.flash = { ...g.flash, at: g.flash.at + d };
    return g;
  }
  const toLocal = (g) => shift(g, -offset);
  const toServer = (g) => shift(g, offset);

  function send(msg) {
    if (ws?.readyState !== 1) return false;
    ws.send(JSON.stringify(msg));
    return true;
  }

  open();
  return {
    sendState: (game) => send({ type: 'state', game: toServer(game) }),
    sendLobby: (lobby) => send({ type: 'lobby', lobby }),
    act: (a) => send({ type: 'act', ...a }),
    profile: (p) => { Object.assign(params, p); return send({ type: 'profile', ...p }); },
    kick: (id) => send({ type: 'kick', id }),
    assign: (moves) => send({ type: 'assign', moves }),
    closeRoom: () => { send({ type: 'close-room' }); stopped = true; },
    close: () => { stopped = true; clearInterval(pingTimer); try { ws?.close(); } catch { /* ignore */ } },
    reopen: () => { stopped = false; tries = 0; open(); },
    get id() { return params.id; },
    get open() { return ws?.readyState === 1; },
  };
}
