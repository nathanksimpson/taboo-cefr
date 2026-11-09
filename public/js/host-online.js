// Host side of an online room: the Online dialog on the teacher's screen,
// the connection, the player list and what gets sent to the room.
import { connect, createRoom, loadJSON, saveJSON, ROOM_KEY, joinUrl, shortJoinHost } from './online.js';
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
 */
export function setupHostOnline({ getGame, getTeams, onAct, onChange }) {
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
    open: () => { render(); dlg.showModal(); },
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
    if (!saved) {
      body.innerHTML = `<div class="online-intro">
        <p>Start a room and anyone can join from a phone, tablet or computer with a 4-letter code.</p>
        <ul class="online-uses">
          <li><b>In class:</b> keep this screen and the Class view on the projector; the explaining student holds a phone that shows the card.</li>
          <li><b>Apart:</b> everyone joins from their own device (on a video call); the explainer and the other teams see the card, the guessing team doesn't.</li>
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
    const teamBlock = (t) => {
      const ps = players.filter((p) => p.team === t.id);
      const host = net.hostRole === t.id ? '<li class="me">This screen</li>' : '';
      return `<div class="ro-team" style="--team:${t.color}"><h4><span class="dot" style="background:${t.color}"></span>${esc(t.name)} <span class="muted">${ps.length + (host ? 1 : 0)}</span></h4>
        <ul>${host}${ps.map((p) => `<li>${esc(p.name)} <button class="link small" data-kick="${esc(p.id)}" title="Remove from the room">remove</button></li>`).join('') || (host ? '' : '<li class="muted">Nobody yet</li>')}</ul></div>`;
    };
    const unassigned = players.filter((p) => !teams.some((t) => t.id === p.team));
    body.innerHTML = `
      <div class="room-code-box">
        <div>
          <p class="eyebrow">Room code</p>
          <div class="room-code">${esc(saved.code)}</div>
          <p class="room-link">Join at <b>${esc(shortJoinHost())}</b></p>
        </div>
        <div class="room-meta">
          <span class="net-status ${status}"><span class="net-dot ${status}"></span>${{ online: 'Connected', connecting: 'Connecting…', offline: 'Offline — retrying' }[status]}</span>
          <button class="btn ghost small" id="copy-link">Copy invite link</button>
          <a class="btn ghost small" href="class.html?room=${esc(saved.code)}" target="_blank" rel="noopener">⧉ Big screen on another device</a>
        </div>
      </div>
      ${error ? `<p class="online-err">${esc(error)}</p>` : ''}
      <div class="rule"><div class="rule-label">This screen is</div><div class="rule-body">
        <div class="seg" id="host-role">
          <button data-role="teacher" class="${net.hostRole === 'teacher' ? 'on' : ''}">Teacher (sees every card)</button>
          ${teams.map((t) => `<button data-role="${t.id}" class="${net.hostRole === t.id ? 'on' : ''}">Player on ${esc(t.name)}</button>`).join('')}
        </div>
        <p class="hint">Pick a team if you're playing too — then this screen hides the card when your team is guessing.</p>
      </div></div>
      <div class="rule"><div class="rule-label">Other teams</div><div class="rule-body">
        <label class="check"><input type="checkbox" id="watchers" ${net.watchers ? 'checked' : ''}> See the card and can call <b>Taboo!</b> from their device</label>
      </div></div>
      <h3 class="ro-title">Players <span class="muted">${players.length}${screens ? ` · ${screens} big screen${screens > 1 ? 's' : ''}` : ''}</span></h3>
      <div class="ro-grid">${teams.map(teamBlock).join('')}</div>
      ${unassigned.length ? `<p class="muted">Choosing a team: ${unassigned.map((p) => esc(p.name)).join(', ')}</p>` : ''}
      <p class="hint">Each turn the next player on the team explains. You can change who explains on the “Up next” screen.</p>
      <div class="online-foot"><button class="btn ghost small danger" id="close-room">Close room</button></div>`;
  }

  dlg.addEventListener('click', async (e) => {
    if (e.target.closest('#online-close')) { dlg.close(); return; }
    if (e.target.closest('#online-start')) { makeRoom(); return; }
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
    if (kick) { conn?.kick(kick.dataset.kick); }
  });
  dlg.addEventListener('change', (e) => {
    if (e.target.id === 'watchers') { saved.watchers = e.target.checked; persist(); onChange(); }
  });
  btn?.addEventListener('click', () => net.open());

  if (saved) start();
  renderBtn();
  return net;
}
