// Taboo Online room server. Static files are served from ./public as before;
// only /api/* reaches this script. Each room code is one Durable Object holding the game.
import { DurableObject } from 'cloudflare:workers';
import { newRoom, apply, viewFor } from '../public/js/online-engine.js';

const ROOM_TTL_MS = 3 * 24 * 60 * 60 * 1000; // rooms are wiped 3 days after the last action
const CODE_RE = /^[A-Z]{4}$/;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const m = url.pathname.match(/^\/api\/room\/([A-Za-z]{4})\/ws$/);
    if (m) {
      if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426 });
      const code = m[1].toUpperCase();
      const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
      const fwd = new URL(request.url); fwd.searchParams.set('code', code);
      return stub.fetch(new Request(fwd, request));
    }
    if (url.pathname.startsWith('/api/')) return new Response('Not found', { status: 404 });
    return env.ASSETS.fetch(request);
  },
};

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.state = null;
  }

  async load(code) {
    if (!this.state) this.state = (await this.ctx.storage.get('state')) || newRoom(code);
    return this.state;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const pid = (url.searchParams.get('pid') || '').slice(0, 40);
    if (!CODE_RE.test(code || '') || !/^[a-z0-9]{8,40}$/.test(pid)) return new Response('Bad request', { status: 400 });
    await this.load(code);
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    pair[1].serializeAttachment({ pid, code });
    this.sendTo(pair[1]);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  async webSocketMessage(ws, raw) {
    const { pid, code } = ws.deserializeAttachment() || {};
    if (!pid) return;
    let msg;
    try { msg = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw)); } catch { return; }
    if (msg?.type === 'ping') { ws.send(JSON.stringify({ type: 'pong', now: Date.now() })); return; }
    const s = await this.load(code);
    const err = apply(s, pid, msg || {}, Date.now());
    if (err) { ws.send(JSON.stringify({ type: 'error', error: err, action: msg?.type })); this.sendTo(ws); return; }
    await this.ctx.storage.put('state', s);
    await this.ctx.storage.setAlarm(Date.now() + ROOM_TTL_MS);
    this.broadcast();
  }

  async webSocketClose(ws) {
    try { ws.close(); } catch { /* already closed */ }
    this.broadcast(ws);
  }

  async webSocketError(ws) { this.broadcast(ws); }

  async alarm() {
    await this.ctx.storage.deleteAll();
    this.state = null;
  }

  online(except) {
    const ids = new Set();
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except) continue;
      const a = ws.deserializeAttachment();
      if (a?.pid) ids.add(a.pid);
    }
    return [...ids];
  }

  sendTo(ws, online = this.online()) {
    const { pid } = ws.deserializeAttachment() || {};
    if (!pid || !this.state) return;
    try { ws.send(JSON.stringify({ type: 'state', state: viewFor(this.state, pid), online, now: Date.now() })); } catch { /* socket gone */ }
  }

  broadcast(except) {
    if (!this.state) return;
    const online = this.online(except);
    for (const ws of this.ctx.getWebSockets()) if (ws !== except) this.sendTo(ws, online);
  }
}
