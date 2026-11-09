// A player's device in an online room: join with a code, pick a team,
// then explain, watch for taboo words, or guess — depending on the turn.
import { scoreTurn, sum, remainingMs, fmtTime, esc, skipRuleText, sfx, shortcutKey } from './core.js';
import { connect, loadJSON, saveJSON, GUEST_KEY, cleanCode } from './online.js';

const $ = (s) => document.querySelector(s);
const guest = loadJSON(GUEST_KEY, { ids: {}, name: '', team: {}, sound: true });
guest.ids ||= {}; guest.team ||= {};

let code = cleanCode(new URLSearchParams(location.search).get('room') || '');
let conn = null;
let me = { id: null, name: guest.name, team: null };
let game = null;
let lobby = null;
let roster = [];
let hostOnline = true;
let status = 'connecting';
let picking = false; // showing the team picker
let lastFlash = 0;
let sentFor = null; // card id we already pressed a button for

/* ---------------- join ---------------- */

$('#code').value = code;
$('#name').value = guest.name || '';
if (code && guest.name) $('#name').focus(); else if (code) $('#name').focus(); else $('#code').focus();
$('#code').addEventListener('input', (e) => { e.target.value = cleanCode(e.target.value); });

$('#join-form').addEventListener('submit', (e) => {
  e.preventDefault();
  code = cleanCode($('#code').value);
  const name = $('#name').value.trim();
  if (code.length !== 4 || !name) return;
  guest.name = name; saveJSON(GUEST_KEY, guest);
  me.name = name;
  me.team = guest.team[code] ?? null;
  history.replaceState(null, '', `?room=${code}`);
  sfx.tick(); // unlock audio on this tap (iPhone)
  join();
});

function join() {
  $('#join-err').hidden = true;
  $('#join-btn').disabled = true;
  $('#join-btn').textContent = 'Joining…';
  conn?.close();
  conn = connect({
    code, role: 'player', id: guest.ids[code], name: me.name, team: me.team,
    on: {
      status: (s) => { status = s; renderNet(); },
      welcome: (m) => {
        me.id = m.id; guest.ids[code] = m.id; saveJSON(GUEST_KEY, guest);
        $('#join').hidden = true; $('#room').hidden = false; $('#room-actions').hidden = false;
        render();
      },
      lobby: (m) => { lobby = m.lobby; render(); },
      roster: (m) => { roster = m.players; hostOnline = m.hostOnline; render(); },
      state: (g) => { if (g?.card?.id !== game?.card?.id) sentFor = null; game = g; render(); maybeFlash(); },
      error: (m) => {
        if (m.code === 'kicked' || m.code === 'closed') { game = null; showJoin(m.message); return; }
        showJoin(m.message);
      },
    },
  });
}

function showJoin(msg) {
  conn?.close(); conn = null;
  $('#room').hidden = true; $('#room-actions').hidden = true; $('#join').hidden = false;
  $('#join-btn').disabled = false; $('#join-btn').textContent = 'Join ▶';
  const err = $('#join-err');
  err.textContent = msg || ''; err.hidden = !msg;
}

/* ---------------- helpers ---------------- */

const tid = (t, i) => t.id ?? i;
function teams() {
  if (game?.teams && game.phase !== 'over') return game.teams.map((t, i) => ({ id: tid(t, i), name: t.name, color: t.color }));
  return lobby?.teams || game?.teams?.map((t, i) => ({ id: tid(t, i), name: t.name, color: t.color })) || [];
}
const myTeam = () => teams().find((t) => t.id === me.team) || null;
const curTeam = () => (game?.teams ? game.teams[game.current] : null);
const curTeamId = () => (game?.teams ? tid(curTeam(), game.current) : null);
const iExplain = () => !!game && !!me.id && game.explainerId === me.id;
const explainer = () => game?.explainerName || 'The teacher';
const play = (name) => { if (guest.sound !== false && game?.settings?.sounds !== false) sfx[name]?.(); };

function setTeam(id) {
  me.team = id;
  guest.team[code] = id; saveJSON(GUEST_KEY, guest);
  picking = false;
  conn?.profile({ team: id ?? '' });
  render();
}

function act(a, extra = {}) {
  if (!conn) return;
  const cardId = game?.card?.id;
  if (['correct', 'taboo', 'skip'].includes(a)) {
    if (!cardId || sentFor === cardId) return; // one press per card
    sentFor = cardId;
  }
  conn.act({ act: a, cardId, ...extra });
}

/* ---------------- rendering ---------------- */

function renderNet() {
  const el = $('#net');
  if (!el) return;
  const s = !hostOnline && status === 'online' ? 'waiting' : status;
  el.className = `net-status ${s}`;
  el.innerHTML = `<span class="net-dot ${s}"></span>${{ online: esc(code), connecting: 'Connecting…', offline: 'Reconnecting…', waiting: 'Teacher offline' }[s]}`;
}

function render() {
  if ($('#room').hidden) return;
  renderNet();
  const t = myTeam();
  $('#me-chip').innerHTML = `${t ? `<span class="dot" style="background:${t.color}"></span>` : ''}${esc(me.name)}${t ? ` · ${esc(t.name)}` : ''}`;
  $('#sound-btn').textContent = guest.sound === false ? '🔇' : '🔊';

  const team = curTeam();
  const live = game?.teams && game.phase !== 'over';
  document.body.style.setProperty('--team', team?.color || t?.color || 'var(--coral)');
  $('#cur-team').hidden = !live;
  if (live) $('#cur-team').innerHTML = `<span class="dot" style="background:${team.color}"></span>${esc(team.name)}`;
  $('#timer').hidden = !live;
  $('#room').dataset.phase = game?.phase || 'lobby';
  renderTimer();

  const st = $('#pstage');
  if (picking || !t) st.innerHTML = pickerHtml();
  else if (!game?.teams) st.innerHTML = lobbyHtml();
  else st.innerHTML = phaseHtml();

  $('#pscores').hidden = !game?.teams;
  if (game?.teams) {
    $('#pscores').innerHTML = game.teams.map((x, i) => `<div class="score ${i === game.current && game.phase !== 'over' ? 'cur' : ''}" style="--team:${x.color}">
      <span class="score-name">${esc(x.name)}</span><span class="score-adj"><b>${x.score}</b></span></div>`).join('');
  }
}

function pickerHtml() {
  const ts = teams();
  const count = (id) => roster.filter((p) => p.role === 'player' && p.team === id).length;
  return `<div class="ready picker">
    <p class="eyebrow">Room ${esc(code)}</p>
    <h1 class="ready-team">Pick your team</h1>
    ${ts.length ? `<div class="team-pick">${ts.map((x) => `<button class="team-pick-btn ${x.id === me.team ? 'on' : ''}" style="--team:${x.color}" data-team="${x.id}">
      <span class="dot" style="background:${x.color}"></span>${esc(x.name)}<span class="muted">${count(x.id)}</span></button>`).join('')}</div>`
    : '<p class="muted">Waiting for the teacher to set up teams…</p>'}
    <label class="field narrow">Your name <input id="rename" maxlength="24" value="${esc(me.name)}"></label>
    <a class="link" href="class.html?room=${esc(code)}">This device is the projector / big screen →</a>
    ${me.team != null && myTeam() ? '<button class="btn ghost" data-act="close-picker">Back to the game</button>' : ''}
  </div>`;
}

function lobbyHtml() {
  const t = myTeam();
  const mates = roster.filter((p) => p.role === 'player' && p.team === me.team);
  return `<div class="ready">
    <p class="eyebrow">You're in!</p>
    <h1 class="ready-team" style="--team:${t.color}">${esc(t.name)}</h1>
    <p class="muted">${hostOnline ? 'Waiting for the teacher to start the game…' : 'The teacher’s screen is offline — waiting for it to come back…'}</p>
    <p class="mates">${mates.map((p) => `<span class="mate ${p.id === me.id ? 'me' : ''}">${esc(p.name)}</span>`).join('')}</p>
  </div>`;
}

function tally(log, s) {
  const c = (r) => log.filter((e) => e.result === r).length;
  const total = sum(scoreTurn(log, s));
  return `<div class="tally"><span class="t correct">✓ ${c('correct')}</span><span class="t taboo">✕ ${c('taboo')}</span><span class="t skip">↷ ${c('skip')}</span><span class="t pts">${total >= 0 ? '+' : ''}${total}</span></div>`;
}

function cardHtml(c) {
  return `<div class="card"><div class="card-top"><span class="level-tag">${esc(c.label || c.level)}</span></div>
    <div class="target">${esc(c.word)}</div><div class="taboo-label">Don't say</div>
    <ul class="taboo-list">${c.taboo.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>`;
}

function phaseHtml() {
  const g = game;
  const s = g.settings;
  const team = curTeam();
  const mine = me.team === curTeamId();
  const p = g.phase;

  if (p === 'ready') {
    if (iExplain()) {
      return `<div class="ready"><p class="eyebrow">Your turn to explain!</p><h1 class="ready-team">${esc(team.name)}</h1>
        <p class="muted">${s.seconds} seconds · ${esc(skipRuleText(s))}${s.tabooPenalty ? ' · Taboo −1' : ''}</p>
        <p class="muted">Describe the word without saying it or any of the taboo words.</p>
        <button class="btn primary huge" data-act="start">Start turn</button></div>`;
    }
    return `<div class="ready"><p class="eyebrow">Up next</p><h1 class="ready-team">${esc(team.name)}</h1>
      <p class="muted">${esc(explainer())} ${g.explainerName ? 'explains' : 'starts the turn'}${mine ? ' — get ready to guess!' : ' — your team watches for taboo words.'}</p></div>`;
  }

  if (p === 'playing' || p === 'paused') {
    if (p === 'paused') {
      return `<div class="ready"><p class="eyebrow">Paused</p><h1 class="ready-team">Card hidden</h1>
        ${iExplain() ? '<button class="btn primary huge" data-act="pause">Resume</button>' : ''}</div>`;
    }
    if (iExplain() && g.card) {
      return `<div class="card-wrap">${cardHtml(g.card)}${tally(g.log, s)}
        <div class="act">
          <button class="btn act-taboo" data-act="taboo">Taboo! <kbd>X</kbd></button>
          <button class="btn act-skip" data-act="skip">Skip <kbd>S</kbd></button>
          <button class="btn act-correct" data-act="correct">Correct <kbd>Space</kbd></button>
        </div>
        <div class="act-minor"><button class="link" data-act="undo" ${g.log.length ? '' : 'disabled'}>↶ Undo last</button>
          <button class="link" data-act="pause">Pause</button></div></div>`;
    }
    if (g.card) {
      return `<div class="card-wrap"><p class="remote-note">${esc(team.name)} is guessing — ${esc(explainer())} is explaining. Call it if they say a taboo word!</p>
        ${cardHtml(g.card)}${tally(g.log, s)}
        <button class="btn act-taboo buzz" data-act="taboo">Taboo!</button></div>`;
    }
    return `<div class="ready guess"><p class="eyebrow">${mine ? 'Your team is guessing' : `${esc(team.name)} is guessing`}</p>
      <h1 class="ready-team">${mine ? 'Guess the word!' : 'Watch and wait'}</h1>
      <p class="muted">${esc(explainer())} is explaining.</p>
      <div class="big-timer" id="big-timer"></div>${tally(g.log, s)}</div>`;
  }

  if (p === 'review') {
    const pts = scoreTurn(g.log, s);
    const total = sum(pts);
    const edit = iExplain();
    const rows = g.log.map((e, i) => `<div class="rv-row">
      <span class="rv-word">${esc(e.card?.word || '—')}</span>
      <span class="rv-btns">${edit
        ? ['correct', 'taboo', 'skip'].map((r) => `<button class="rv ${r} ${e.result === r ? 'on' : ''}" data-rv="${i}" data-r="${r}">${{ correct: '✓', taboo: '✕', skip: '↷' }[r]}</button>`).join('')
        : `<span class="rv ${e.result} on">${{ correct: '✓', taboo: '✕', skip: '↷' }[e.result]}</span>`}</span>
      <span class="rv-pts">${pts[i] > 0 ? '+' : ''}${pts[i]}</span></div>`).join('');
    return `<div class="review"><p class="eyebrow">Time's up</p>
      <h2>${esc(team.name)}: <span class="${total < 0 ? 'neg' : ''}">${total >= 0 ? '+' : ''}${total}</span></h2>
      ${edit ? '<p class="muted">Fix any mis-taps, then confirm.</p>' : '<p class="muted">Waiting for the scores to be confirmed…</p>'}
      <div class="rv-list">${rows || '<p class="muted">No cards played this turn.</p>'}</div>
      ${edit ? '<button class="btn primary huge" data-act="confirm">Confirm &amp; next team</button>' : ''}</div>`;
  }

  if (p === 'over') {
    const ranked = [...g.teams].sort((a, b) => b.score - a.score);
    const winners = ranked.filter((x) => x.score === ranked[0].score);
    return `<div class="ready"><p class="eyebrow">Game over</p>
      <h1 class="ready-team">${winners.length > 1 ? 'It’s a tie!' : `${esc(winners[0].name)} wins!`}</h1>
      <ol class="final">${ranked.map((x) => `<li style="--team:${x.color}"><span>${esc(x.name)}</span><b>${x.score}</b></li>`).join('')}</ol>
      <p class="muted">Stay here — the next game will appear when the teacher starts it.</p></div>`;
  }
  return lobbyHtml();
}

function renderTimer() {
  if (!game?.settings) return;
  const ms = remainingMs(game);
  const txt = fmtTime(ms);
  const low = game.phase === 'playing' && ms <= 10000;
  const el = $('#timer');
  el.textContent = txt;
  el.classList.toggle('low', low);
  el.style.setProperty('--p', game.settings.seconds ? ms / (game.settings.seconds * 1000) : 0);
  const big = document.getElementById('big-timer');
  if (big) { big.textContent = txt; big.classList.toggle('low', low); }
}

const FLASH = { correct: ['Correct!', 'correct'], taboo: ['TABOO!', 'taboo'], skip: ['Skip', 'skip'], timeup: ['Time’s up!', 'timeup'], start: ['Go!', 'start'] };
function maybeFlash() {
  const f = game?.flash;
  if (!f || f.at <= lastFlash) return;
  const first = lastFlash === 0;
  lastFlash = f.at;
  if (first || Date.now() - f.at > 2500 || !FLASH[f.type]) return;
  play(f.type === 'timeup' ? 'timeUp' : f.type);
  if (f.type === 'taboo' && iExplain()) navigator.vibrate?.(250);
  const [text, cls] = FLASH[f.type];
  const el = $('#flash');
  el.innerHTML = esc(text) + (f.type === 'taboo' && f.by ? `<small>called by ${esc(f.by)}</small>` : '');
  el.className = `flash show ${cls}`;
  clearTimeout(maybeFlash.t);
  maybeFlash.t = setTimeout(() => { el.className = 'flash'; }, f.type === 'timeup' ? 1600 : 900);
}

let lastSec = null;
setInterval(() => {
  if (!game || $('#room').hidden) return;
  renderTimer();
  if (game.phase === 'playing') {
    const sec = Math.ceil(remainingMs(game) / 1000);
    if (sec !== lastSec) { lastSec = sec; if (sec <= 5 && sec > 0) play('tick'); }
  }
}, 200);

/* ---------------- events ---------------- */

$('#pstage').addEventListener('click', (e) => {
  const team = e.target.closest('[data-team]');
  if (team) { setTeam(+team.dataset.team); return; }
  const rv = e.target.closest('[data-rv]');
  if (rv) { act('rv', { i: +rv.dataset.rv, r: rv.dataset.r }); return; }
  const a = e.target.closest('[data-act]')?.dataset.act;
  if (!a) return;
  if (a === 'close-picker') { picking = false; render(); return; }
  act(a);
});
$('#pstage').addEventListener('change', (e) => {
  if (e.target.id !== 'rename') return;
  const name = e.target.value.trim();
  if (!name) return;
  me.name = name; guest.name = name; saveJSON(GUEST_KEY, guest);
  conn?.profile({ name });
  render();
});
$('#me-chip').onclick = () => { picking = !picking; render(); };
$('#sound-btn').onclick = () => { guest.sound = guest.sound === false; saveJSON(GUEST_KEY, guest); render(); };

document.addEventListener('keydown', (e) => {
  if (!game || e.target.matches('input, textarea, select') || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
  const k = shortcutKey(e);
  if (game.phase === 'playing' && game.card) {
    if (iExplain() && (k === ' ' || k === 'enter' || k === 'arrowright')) { e.preventDefault(); act('correct'); }
    else if (iExplain() && k === 's') act('skip');
    else if (iExplain() && k === 'z') act('undo');
    else if (k === 'x') act('taboo');
  } else if (game.phase === 'ready' && iExplain() && (k === ' ' || k === 'enter')) { e.preventDefault(); act('start'); }
});

// Coming back to a room we were already in (reload, or the phone slept): rejoin straight away.
if (code && guest.name && guest.ids[code]) { me.team = guest.team[code] ?? null; join(); }
