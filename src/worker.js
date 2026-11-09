// Taboo CEFR — Worker entry.
// Static files in ./public are served as before. The only server code is the
// online room: /api/rooms (create) and /api/rooms/CODE/ws (join, WebSocket),
// each room being one Durable Object that relays the game between devices.
//
// The teacher's (host's) browser stays the game engine: it holds the decks,
// draws cards and keeps score, and sends its state here. The room hides the
// card from anyone who shouldn't see it and passes button presses from phones
// back to the host.

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ'; // no I, L, O: easy to read aloud
const ROOM_TTL = 3 * 24 * 60 * 60 * 1000; // empty rooms are cleared after 3 days

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});
const randomCode = (n = 4) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
const randomId = (n = 10) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('');

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/rooms' && request.method === 'POST') {
      for (let i = 0; i < 8; i++) {
        const code = randomCode();
        const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
        const res = await stub.fetch('https://room/init', { method: 'POST' });
        if (res.status === 409) continue; // code in use, try another
        const { hostKey } = await res.json();
        return json({ code, hostKey });
      }
      return json({ error: 'Could not make a room. Try again.' }, 503);
    }

    const m = url.pathname.match(/^\/api\/rooms\/([A-Za-z]{4})\/ws$/);
    if (m) {
      if (request.headers.get('Upgrade') !== 'websocket') return json({ error: 'Expected a WebSocket' }, 426);
      const code = m[1].toUpperCase();
      return env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(request);
    }

    if (url.pathname.startsWith('/api/')) return json({ error: 'Not found' }, 404);
    return env.ASSETS.fetch(request);
  },
};

/* ---------------- who may see the card ---------------- */

/** Whether this connection may see the current card and the turn's words. */
export function canSeeCard(game, a) {
  if (a.role === 'host') return true;
  if (!game || a.role !== 'player') return false;
  if (game.explainerId && a.id === game.explainerId) return true;
  // Players on the other teams watch the card so they can call "Taboo!".
  if (game.settings?.watchers === false) return false;
  const cur = game.teams?.[game.current]?.id;
  return a.team != null && cur != null && a.team !== cur;
}

/** The game as this connection is allowed to see it. */
export function viewFor(game, a) {
  if (!game) return null;
  const g = { ...game };
  delete g.deck; delete g.used; delete g.pos;
  if (!canSeeCard(game, a)) {
    g.card = null;
    if (g.phase === 'playing' || g.phase === 'paused') g.log = (g.log || []).map((e) => ({ result: e.result }));
  }
  return g;
}

const clean = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const teamOf = (v) => (v === '' || v == null || !Number.isInteger(+v) ? null : +v);

/* ---------------- the room ---------------- */

export class Room {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.game = undefined; // loaded lazily (the object may have slept)
    this.lobby = undefined;
  }

  async load() {
    if (this.game === undefined) {
      this.game = (await this.ctx.storage.get('game')) ?? null;
      this.lobby = (await this.ctx.storage.get('lobby')) ?? null;
    }
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/init') {
      if (await this.ctx.storage.get('hostKey')) return json({ error: 'taken' }, 409);
      const hostKey = randomId(24);
      await this.ctx.storage.put('hostKey', hostKey);
      await this.ctx.storage.setAlarm(Date.now() + ROOM_TTL);
      return json({ hostKey });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);

    const hostKey = await this.ctx.storage.get('hostKey');
    const p = url.searchParams;
    const fail = (code, message) => {
      server.send(JSON.stringify({ type: 'error', code, message }));
      server.close(4000, code);
      return new Response(null, { status: 101, webSocket: client });
    };
    if (!hostKey) return fail('no-room', 'That room code doesn’t exist (or the room has closed).');
    const role = ['host', 'player', 'screen'].includes(p.get('role')) ? p.get('role') : 'player';
    if (role === 'host' && p.get('key') !== hostKey) return fail('bad-key', 'Only the teacher’s screen can host this room.');

    let id = /^[a-z0-9]{6,24}$/.test(p.get('id') || '') ? p.get('id') : randomId();
    if (role === 'host') id = 'host';
    // Same device reconnecting: drop the old connection.
    for (const ws of this.ctx.getWebSockets()) {
      if (ws !== server && ws.deserializeAttachment()?.id === id) {
        ws.serializeAttachment({ ...ws.deserializeAttachment(), replaced: true });
        try { ws.close(4002, 'replaced'); } catch { /* already closed */ }
      }
    }
    const att = { id, role, name: clean(p.get('name'), 24) || (role === 'screen' ? 'Big screen' : 'Player'), team: teamOf(p.get('team')) };
    server.serializeAttachment(att);

    await this.load();
    server.send(JSON.stringify({ type: 'welcome', id, role, t: Date.now() }));
    if (this.lobby) server.send(JSON.stringify({ type: 'lobby', lobby: this.lobby }));
    if (this.game && role !== 'host') server.send(JSON.stringify({ type: 'state', game: viewFor(this.game, att) }));
    if (this.game && role === 'host') server.send(JSON.stringify({ type: 'saved', game: this.game }));
    this.broadcastRoster();
    return new Response(null, { status: 101, webSocket: client });
  }

  live() {
    return this.ctx.getWebSockets().filter((ws) => {
      const a = ws.deserializeAttachment();
      return a && !a.replaced && ws.readyState === 1;
    });
  }

  roster() {
    const players = [];
    let hostOnline = false;
    for (const ws of this.live()) {
      const a = ws.deserializeAttachment();
      if (a.role === 'host') hostOnline = true;
      else players.push({ id: a.id, name: a.name, team: a.team, role: a.role });
    }
    return { type: 'roster', players, hostOnline };
  }

  broadcastRoster() {
    const msg = JSON.stringify(this.roster());
    for (const ws of this.live()) try { ws.send(msg); } catch { /* gone */ }
  }

  broadcastState() {
    for (const ws of this.live()) {
      const a = ws.deserializeAttachment();
      if (a.role === 'host') continue;
      try { ws.send(JSON.stringify({ type: 'state', game: viewFor(this.game, a) })); } catch { /* gone */ }
    }
  }

  async webSocketMessage(ws, raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const a = ws.deserializeAttachment();
    if (!a || a.replaced) return;

    if (msg.type === 'ping') { ws.send(JSON.stringify({ type: 'pong', c: msg.c, t: Date.now() })); return; }
    await this.load();

    if (a.role === 'host') {
      if (msg.type === 'state') {
        this.game = msg.game ?? null;
        this.broadcastState();
        await this.ctx.storage.put('game', this.game);
      } else if (msg.type === 'lobby') {
        this.lobby = msg.lobby ?? null;
        const out = JSON.stringify({ type: 'lobby', lobby: this.lobby });
        for (const s of this.live()) if (s !== ws) try { s.send(out); } catch { /* gone */ }
        await this.ctx.storage.put('lobby', this.lobby);
      } else if (msg.type === 'kick') {
        for (const s of this.live()) {
          if (s.deserializeAttachment().id === msg.id) {
            s.send(JSON.stringify({ type: 'error', code: 'kicked', message: 'The teacher removed you from the room.' }));
            s.serializeAttachment({ ...s.deserializeAttachment(), replaced: true });
            s.close(4003, 'kicked');
          }
        }
        this.broadcastRoster();
      } else if (msg.type === 'close-room') {
        for (const s of this.live()) {
          if (s === ws) continue;
          s.send(JSON.stringify({ type: 'error', code: 'closed', message: 'The teacher closed this room.' }));
          s.close(4004, 'closed');
        }
        await this.ctx.storage.deleteAll();
        this.game = null; this.lobby = null;
        ws.close(1000, 'closed');
      }
      return;
    }

    if (msg.type === 'profile') {
      a.name = clean(msg.name, 24) || a.name;
      if ('team' in msg) a.team = teamOf(msg.team);
      ws.serializeAttachment(a);
      this.broadcastRoster();
      if (this.game) ws.send(JSON.stringify({ type: 'state', game: viewFor(this.game, a) }));
    } else if (msg.type === 'act' && a.role === 'player') {
      const out = JSON.stringify({ ...msg, type: 'act', from: a.id, name: a.name, team: a.team });
      for (const s of this.live()) if (s.deserializeAttachment().role === 'host') try { s.send(out); } catch { /* gone */ }
    }
  }

  async webSocketClose(ws) {
    const a = ws.deserializeAttachment();
    if (a && !a.replaced) { try { ws.serializeAttachment({ ...a, replaced: true }); } catch { /* closed */ } }
    this.broadcastRoster();
  }

  async webSocketError(ws) { await this.webSocketClose(ws); }

  async alarm() {
    if (this.ctx.getWebSockets().length) {
      await this.ctx.storage.setAlarm(Date.now() + ROOM_TTL);
      return;
    }
    await this.ctx.storage.deleteAll();
  }
}
