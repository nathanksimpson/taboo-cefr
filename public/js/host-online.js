// Host side of an online room: the Online dialog on the teacher's screen,
// the connection, the player list and what gets sent to the room.
import { connect, createRoom, loadJSON, saveJSON, ROOM_KEY, joinUrl, shortJoinHost } from './online.js';
import { qrSvg } from './qr.js';
import { esc } from './core.js';

const HTML = `
<dialog id="online-dlg" class="dlg online-dlg">
  <div class="dlg-head">
    <h2>Play online</h2>
    <button class="btn primary small" id="online-close" type="button">Done</button>
  </div>
  <div class="online-body" id="online-body"></div>
</dialog>`;

/**
 * setupHostOnline({ getGame, getTeams, onAct, onChange })
 *   getTeams(): [{ id, name, color }] — the teams players can join right now
 *   onAct(msg): a button pressed on a player's device
 *   onChange(): the player list, connection or host role changed
 *   teamsApi: { rename(id, name), add(), remove(id), canResize() } — edit the teams themselves
 */
const COPY = {
  taboo: {
    inClass: 'keep this screen and the Class view on the projector; the explaining student holds a phone that shows the card.',
    apart: 'everyone joins from their own device (on a video call); the explainer and the other teams see the card, the guessing team doesn\'t.',
    sees: 'Sees every card',
    hostHint: 'If you play on a team, this screen hides the card while your team is guessing.',
    turnHint: 'Each turn the next player on the team explains — you can change who on the “Up next” screen.',
    bigScreen: 'class.html',
  },
  hotseat: {
    inClass: 'the Class view shows the word big as usual; the student in the hot seat faces away, and teammates can press Correct / Pass on their phones.',
    apart: 'everyone joins from their own device (on a video call); everyone sees the word except the player in the hot seat.',
    sees: 'Sees every word',
    hostHint: 'If you play on a team, this screen hides the word when you’re in the hot seat.',
    turnHint: 'Each turn the next player on the team takes the hot seat — you can change who on the “Up next” screen.',
    bigScreen: 'hotseat-class.html',
  },
};

export function setupHostOnline({ getGame, getTeams, onAct, onChange, teamsApi, kind = 'taboo' }) {
  const copy = COPY[kind];
  document.body.insertAdjacentHTML('beforeend', HTML);
  const dlg = document.getElementById('online-dlg');
  const body = document.getElementById('online-body');
  const btn = document.getElementById('online-btn');

  let saved = loadJSON(ROOM_KEY, null); // { code, hostKey, hostRole, watchers }
  let conn = null;
  let roster = [];
  let status = 'offline';
  let error = '';
  let busy = false;

  const net = {
    get active() { return !!saved; },
    get code() { return saved?.code || null; },
    /** 'teacher' (sees every card) or a team id (this screen is a player on that team). */
    get hostRole() { return saved?.hostRole ?? 'teacher'; },
    get watchers() { return saved?.watchers !== false; },
    get roster() { return roster; },
    get connected() { return status === 'online'; },
    get takenOver() { return status === 'taken'; },
    players: (teamId) => roster.filter((p) => p.role === 'player' && p.team === teamId),
    isOnline: (id) => id === 'host' || roster.some((p) => p.id === id),
    nameOf: (id) => (id === 'host' ? 'This screen' : roster.find((p) => p.id === id)?.name || 'Player'),
    publish(game) {
      if (!conn || !game) return;
      const g = { ...game };
      delete g.deck; delete g.used; delete g.pos; // the room never needs the deck
      conn.sendState(g);
    },
    sendLobby() {
      if (!conn) return;
      conn.sendLobby({ teams: getTeams(), started: !!getGame() && getGame().phase !== 'over' });
    },
    /** Move players: moves = [{ id, team }] (team null = no team). */
    assign(moves) {
      if (!moves.length) return;
      for (const m of moves) { const p = roster.find((x) => x.id === m.id); if (p) p.team = m.team; }
      conn?.assign(moves);
      net.render(); onChange();
    },
    /** Teams were reordered or one removed in setup: order[newIndex] = oldIndex. Keep everyone on their team. */
    remap(order) {
      if (!saved) return;
      const moves = roster.filter((p) => p.role === 'player' && p.team != null)
        .map((p) => ({ id: p.id, team: order.indexOf(p.team) === -1 ? null : order.indexOf(p.team) }))
        .filter((m) => m.team !== roster.find((p) => p.id === m.id).team);
      if (saved.hostRole !== 'teacher') {
        const i = order.indexOf(saved.hostRole);
        saved.hostRole = i === -1 ? 'teacher' : i;
        persist();
      }
      net.assign(moves);
    },
    open: () => { render(); dlg.showModal(); },
    /** From the home page's "Host online": open the panel and start a room if there isn't one. */
    host: () => { render(); if (!dlg.open) dlg.showModal(); if (!saved && !busy) makeRoom(); },
    render: () => { renderBtn(); if (dlg.open) render(); },
  };

  function persist() { saveJSON(ROOM_KEY, saved); }

  function start() {
    conn?.close();
    error = '';
    conn = connect({
      code: saved.code, role: 'host', key: saved.hostKey,
      on: {
        status: (s) => { status = s; net.render(); },
        welcome: () => { net.sendLobby(); net.publish(getGame()); },
        roster: (m) => { roster = m.players; net.render(); onChange(); },
        act: (m) => onAct(m),
        takenOver: () => { net.render(); onChange(); },
        error: (m) => {
          error = m.message;
          if (m.code === 'no-room' || m.code === 'bad-key') { saved = null; persist(); conn = null; roster = []; }
          net.render(); onChange();
        },
      },
    });
  }

  async function makeRoom() {
    busy = true; error = ''; render();
    try {
      const { code, hostKey } = await createRoom();
      saved = { code, hostKey, hostRole: 'teacher', watchers: true };
      persist();
      start();
    } catch (e) {
      error = `${e.message} (Online rooms need the site to be running on Cloudflare, not opened as a file.)`;
    }
    busy = false;
    net.render(); onChange();
  }

  function closeRoom() {
    if (!confirm('Close this room? Everyone who joined will be disconnected.')) return;
    conn?.closeRoom();
    setTimeout(() => conn?.close(), 300);
    conn = null; saved = null; roster = []; status = 'offline';
    persist();
    net.render(); onChange();
  }

  function renderBtn() {
    if (!btn) return;
    btn.classList.toggle('on', !!saved);
    btn.innerHTML = saved
      ? `<span class="net-dot ${status}"></span>${esc(saved.code)}${roster.length ? ` · ${roster.filter((p) => p.role === 'player').length}` : ''}`
      : '🌐 Online';
    btn.title = saved ? `Online room ${saved.code}` : 'Play with phones or other computers';
  }

  function render() {
    renderBtn();
    if (drag) return; // don't redraw under a player being dragged
    const ae = document.activeElement;
    const keep = ae && body.contains(ae) ? (ae.dataset.rename != null ? { sel: `[data-rename="${ae.dataset.rename}"]`, value: ae.value, a: ae.selectionStart, b: ae.selectionEnd }
      : ae.dataset.pid ? { sel: `[data-pid="${ae.dataset.pid}"]` } : null) : null;
    draw();
    if (keep) {
      const el = body.querySelector(keep.sel);
      if (el) { el.focus(); if (keep.value != null) { el.value = keep.value; el.setSelectionRange(keep.a, keep.b); } }
    }
  }

  function draw() {
    if (!saved) {
      body.innerHTML = `<div class="online-intro">
        <p>Start a room and anyone can join from a phone, tablet or computer with a 4-letter code.</p>
        <ul class="online-uses">
          <li><b>In class:</b> ${copy.inClass}</li>
          <li><b>Apart:</b> ${copy.apart}</li>
        </ul>
        <p class="muted">This screen still runs the game, so keep it open while you play.</p>
        ${error ? `<p class="online-err">${esc(error)}</p>` : ''}
        <button class="btn primary big" id="online-start" ${busy ? 'disabled' : ''}>${busy ? 'Starting…' : 'Start online room'}</button>
      </div>`;
      return;
    }
    const teams = getTeams();
    const players = roster.filter((p) => p.role === 'player');
    const screens = roster.filter((p) => p.role === 'screen').length;
    const resize = teamsApi?.canResize();
    const chip = (p) => `<li class="ro-player" data-pid="${esc(p.id)}" tabindex="0" title="Drag to another team (or use the arrow keys)">
      <span class="ro-grip" aria-hidden="true">⠿</span><span class="ro-name">${esc(p.name)}</span>
      <button class="ro-x" data-kick="${esc(p.id)}" title="Remove ${esc(p.name)} from the room" aria-label="Remove ${esc(p.name)}">×</button></li>`;
    const teamBlock = (t) => {
      const ps = players.filter((p) => p.team === t.id);
      const host = net.hostRole === t.id ? '<li class="ro-host">This screen</li>' : '';
      return `<div class="ro-team" data-tid="${t.id}" style="--team:${t.color}">
        <div class="ro-head"><span class="dot" style="background:${t.color}"></span>
          <input class="ro-rename" data-rename="${t.id}" value="${esc(t.name)}" maxlength="24" aria-label="Team name">
          <span class="ro-count">${ps.length + (host ? 1 : 0)}</span>
          ${resize && teams.length > 2 ? `<button class="ro-x" data-remove-team="${t.id}" title="Remove this team" aria-label="Remove team ${esc(t.name)}">×</button>` : ''}</div>
        <ul>${host}${ps.map(chip).join('')}${ps.length || host ? '' : '<li class="ro-empty">Drop players here</li>'}</ul></div>`;
    };
    const unassigned = players.filter((p) => !teams.some((t) => t.id === p.team));
    body.innerHTML = `
      <div class="room-code-box">
        <div class="room-qr" title="Students can scan this to join">${qrSvg(joinUrl(saved.code), { title: `Scan to join room ${saved.code}` })}</div>
        <div>
          <p class="eyebrow">Room code</p>
          <div class="room-code">${esc(saved.code)}</div>
          <p class="room-link">Join at <b>${esc(shortJoinHost())}</b></p>
        </div>
        <div class="room-meta">
          <span class="net-status ${status}"><span class="net-dot ${status}"></span>${{ online: 'Connected', connecting: 'Connecting…', offline: 'Offline — retrying', taken: 'Running in another tab' }[status]}</span>
          <button class="btn ghost small" id="copy-link">Copy invite link</button>
          <a class="btn ghost small" href="${copy.bigScreen}?room=${esc(saved.code)}" target="_blank" rel="noopener">⧉ Big screen on another device</a>
        </div>
      </div>
      ${error ? `<p class="online-err">${esc(error)}</p>` : ''}
      ${status === 'taken' ? `<p class="online-err">This room is being run from another tab or page (the other game, perhaps). <button class="btn ghost small" id="take-back">Run it from here</button></p>` : ''}
      <div class="rule"><div class="rule-label">This screen is</div><div class="rule-body">
        <div class="role-pick" id="host-role" role="radiogroup">
          <button role="radio" aria-checked="${net.hostRole === 'teacher'}" data-role="teacher" class="${net.hostRole === 'teacher' ? 'on' : ''}"><span class="role-ico">👀</span><span><b>Teacher</b><small>${copy.sees}</small></span></button>
          ${teams.map((t) => `<button role="radio" aria-checked="${net.hostRole === t.id}" data-role="${t.id}" class="${net.hostRole === t.id ? 'on' : ''}" style="--team:${t.color}"><span class="dot" style="background:${t.color}"></span><span><b>${esc(t.name)}</b><small>I'm playing on this team</small></span></button>`).join('')}
        </div>
        <p class="hint">${copy.hostHint}</p>
      </div></div>
      ${kind === 'taboo' ? `<div class="rule"><div class="rule-label">Other teams</div><div class="rule-body">
        <label class="check"><input type="checkbox" id="watchers" ${net.watchers ? 'checked' : ''}> <span>See the card and can call <b>Taboo!</b> from their device</span></label>
      </div></div>` : ''}
      <div class="ro-bar">
        <h3 class="ro-title">Teams <span class="muted">${players.length} player${players.length === 1 ? '' : 's'}${screens ? ` · ${screens} big screen${screens > 1 ? 's' : ''}` : ''}</span></h3>
        <button class="btn ghost small" id="ro-shuffle" ${players.length < 2 ? 'disabled' : ''} title="Mix everyone into even teams">🔀 Shuffle players</button>
        ${resize && teams.length < 6 ? '<button class="btn ghost small" id="ro-add-team">+ Team</button>' : ''}
      </div>
      <div class="ro-grid">${teams.map(teamBlock).join('')}
        <div class="ro-team ro-none" data-tid="none"><div class="ro-head"><span class="ro-none-title">Choosing a team</span><span class="ro-count">${unassigned.length}</span></div>
          <ul>${unassigned.map(chip).join('') || '<li class="ro-empty">Nobody</li>'}</ul></div>
      </div>
      <p class="hint">Drag players between teams, or select one and use ← →. Rename a team by typing over its name. ${copy.turnHint}</p>
      <div class="online-foot"><button class="btn ghost small danger" id="close-room">Close room</button></div>`;
  }

  dlg.addEventListener('click', async (e) => {
    if (e.target.closest('#online-close')) { dlg.close(); return; }
    if (e.target.closest('#online-start')) { makeRoom(); return; }
    if (e.target.closest('#take-back')) { conn?.reopen(); return; }
    if (e.target.closest('#close-room')) { closeRoom(); return; }
    if (e.target.closest('#copy-link')) {
      const b = e.target.closest('#copy-link');
      try { await navigator.clipboard.writeText(joinUrl(saved.code)); b.textContent = 'Copied!'; } catch { prompt('Copy this link:', joinUrl(saved.code)); }
      return;
    }
    const role = e.target.closest('[data-role]');
    if (role) {
      saved.hostRole = role.dataset.role === 'teacher' ? 'teacher' : +role.dataset.role;
      persist(); render(); onChange(); return;
    }
    const kick = e.target.closest('[data-kick]');
    if (kick) {
      const name = net.nameOf(kick.dataset.kick);
      if (confirm(`Remove ${name} from the room?`)) conn?.kick(kick.dataset.kick);
      return;
    }
    if (e.target.closest('#ro-shuffle')) { shufflePlayers(); return; }
    if (e.target.closest('#ro-add-team')) { document.activeElement?.blur(); teamsApi.add(); net.sendLobby(); net.render(); return; }
    const rm = e.target.closest('[data-remove-team]');
    if (rm) {
      const id = +rm.dataset.removeTeam;
      const n = net.players(id).length;
      if (n && !confirm(`Remove this team? Its ${n} player${n > 1 ? 's' : ''} will need to pick another team.`)) return;
      document.activeElement?.blur();
      teamsApi.remove(id); net.sendLobby(); net.render();
    }
  });

  // Rename a team (sent to everyone as you type).
  body.addEventListener('input', (e) => {
    const id = e.target.dataset.rename;
    if (id == null) return;
    teamsApi.rename(+id, e.target.value);
    net.sendLobby();
  });
  body.addEventListener('keydown', (e) => {
    if (e.target.dataset.rename != null && e.key === 'Enter') { e.preventDefault(); e.target.blur(); return; }
    const li = e.target.closest?.('.ro-player');
    if (!li || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    e.preventDefault();
    const ids = [...getTeams().map((t) => t.id), null];
    const cur = roster.find((p) => p.id === li.dataset.pid)?.team;
    let i = ids.indexOf(cur ?? null); if (i === -1) i = ids.length - 1;
    const next = ids[(i + (e.key === 'ArrowRight' ? 1 : ids.length - 1)) % ids.length];
    net.assign([{ id: li.dataset.pid, team: next }]);
  });

  /** Mix all players into teams as evenly as possible. */
  function shufflePlayers() {
    const teams = getTeams();
    const ps = roster.filter((p) => p.role === 'player').map((p) => p.id);
    for (let i = ps.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ps[i], ps[j]] = [ps[j], ps[i]]; }
    // The teacher's screen counts as a player on its team.
    const size = new Map(teams.map((t) => [t.id, net.hostRole === t.id ? 1 : 0]));
    const moves = ps.map((id) => {
      const t = [...size.entries()].sort((a, b) => a[1] - b[1] || Math.random() - 0.5)[0][0];
      size.set(t, size.get(t) + 1);
      return { id, team: t };
    });
    net.assign(moves);
  }

  /* Drag a player to another team: the name floats under the pointer, the team under it lights up. */
  let drag = null;
  body.addEventListener('pointerdown', (e) => {
    const li = e.target.closest('.ro-player');
    if (!li || e.button !== 0 || e.target.closest('button')) return;
    const r = li.getBoundingClientRect();
    drag = { li, id: li.dataset.pid, x: e.clientX, y: e.clientY, dx: e.clientX - r.left, dy: e.clientY - r.top, w: r.width, ghost: null, over: null, pointer: e.pointerId };
  });
  body.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.pointer) return;
    if (!drag.ghost) {
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 5) return;
      drag.ghost = drag.li.cloneNode(true);
      drag.ghost.classList.add('ro-ghost');
      drag.ghost.style.width = `${drag.w}px`;
      dlg.appendChild(drag.ghost);
      drag.li.classList.add('ro-dragging');
      body.classList.add('ro-is-dragging');
      try { drag.li.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    }
    e.preventDefault();
    const dr = dlg.getBoundingClientRect();
    drag.ghost.style.transform = `translate(${e.clientX - drag.dx - dr.left}px, ${e.clientY - drag.dy - dr.top}px) rotate(-2deg)`;
    const over = document.elementFromPoint(e.clientX, e.clientY)?.closest('.ro-team');
    if (over !== drag.over) { drag.over?.classList.remove('ro-over'); over?.classList.add('ro-over'); drag.over = over; }
  });
  const endDrag = (e, cancel) => {
    if (!drag || (e && e.pointerId !== drag.pointer)) return;
    const d = drag; drag = null;
    if (!d.ghost) return;
    d.over?.classList.remove('ro-over');
    body.classList.remove('ro-is-dragging');
    const target = d.over?.dataset.tid;
    const from = roster.find((p) => p.id === d.id)?.team ?? null;
    const team = target == null ? undefined : target === 'none' ? null : +target;
    if (!cancel && team !== undefined && team !== from) {
      // Settle: the ghost glides to its new spot, then the list redraws.
      d.ghost.remove();
      net.assign([{ id: d.id, team }]);
      const el = body.querySelector(`[data-pid="${CSS.escape(d.id)}"]`);
      el?.classList.add('ro-landed');
    } else {
      const r = d.li.getBoundingClientRect(); const dr = dlg.getBoundingClientRect();
      d.ghost.style.transition = 'transform 160ms ease';
      d.ghost.style.transform = `translate(${r.left - dr.left}px, ${r.top - dr.top}px)`;
      setTimeout(() => { d.ghost.remove(); d.li.classList.remove('ro-dragging'); }, 170);
    }
  };
  body.addEventListener('pointerup', (e) => endDrag(e, false));
  body.addEventListener('pointercancel', (e) => endDrag(e, true));
  dlg.addEventListener('change', (e) => {
    if (e.target.id === 'watchers') { saved.watchers = e.target.checked; persist(); onChange(); }
  });
  btn?.addEventListener('click', () => net.open());

  if (saved) start();
  renderBtn();
  return net;
}
