// A player's device in an online room: join with a code, pick a team,
// then explain, watch for taboo words, or guess — depending on the turn.
import { scoreTurn, sum, remainingMs, fmtTime, esc, skipRuleText, sfx, shortcutKey } from './core.js';
import { connect, loadJSON, saveJSON, GUEST_KEY, cleanCode } from './online.js';
import { STYLE, isCharades, scoreHS, turnTotal, passRuleText } from './hotseat-shared.js';
import { coopOver } from './coop.js';

const $ = (s) => document.querySelector(s);
const guest = loadJSON(GUEST_KEY, { ids: {}, name: '', team: {}, sound: true });
guest.ids ||= {}; guest.team ||= {};

let code = cleanCode(new URLSearchParams(location.search).get('room') || '');
let conn = null;
guest.judge ||= {}; // room code -> true when this device joined that room as the judge
let me = { id: null, name: guest.name, team: null, judge: false };
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

/* Player or Judge. The judge is the teacher on a phone: not on a team, sees every card,
   and runs every turn (start, Correct / Skip / Taboo, undo, pause, fix and confirm results). */
let joinAs = 'player';
function setJoinAs(v) {
  joinAs = v;
  $('#join-as').querySelectorAll('[data-as]').forEach((b) => { const on = b.dataset.as === v; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
  $('#join-as-hint').textContent = v === 'judge' ? 'For the teacher: see every card and run each turn from this phone.' : 'Pick a team and play.';
}
$('#join-as').addEventListener('click', (e) => { const b = e.target.closest('[data-as]'); if (b) setJoinAs(b.dataset.as); });
if (code && guest.judge[code]) setJoinAs('judge');

$('#join-form').addEventListener('submit', (e) => {
  e.preventDefault();
  code = cleanCode($('#code').value);
  const name = $('#name').value.trim();
  if (code.length !== 4 || !name) return;
  guest.name = name; saveJSON(GUEST_KEY, guest);
  me.name = name;
  me.judge = joinAs === 'judge';
  guest.judge[code] = me.judge; saveJSON(GUEST_KEY, guest);
  me.team = me.judge ? null : guest.team[code] ?? null;
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
    code, role: me.judge ? 'judge' : 'player', id: guest.ids[code], name: me.name, team: me.team,
    on: {
      status: (s) => { status = s; renderNet(); },
      welcome: (m) => {
        me.id = m.id; guest.ids[code] = m.id; saveJSON(GUEST_KEY, guest);
        $('#join').hidden = true; $('#room').hidden = false; $('#room-actions').hidden = false;
        render();
      },
      lobby: (m) => { lobby = m.lobby; render(); },
      roster: (m) => {
        roster = m.players; hostOnline = m.hostOnline;
        // The teacher may have moved us to another team.
        const mine = roster.find((p) => p.id === me.id);
        if (mine && !me.judge && mine.team !== me.team) {
          me.team = mine.team; guest.team[code] = mine.team; saveJSON(GUEST_KEY, guest);
          if (mine.team != null) picking = false;
        }
        render();
      },
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
/** This device runs the turn: the explainer, or the judge (who runs every turn). */
const iExplain = () => !!game && (me.judge || (!!me.id && game.explainerId === me.id));
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
  if (['correct', 'taboo', 'skip', 'pass', 'foul'].includes(a)) {
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
  $('#me-chip').innerHTML = me.judge ? `<span class="chip-text">⚖ ${esc(me.name)}</span>` : `${t ? `<span class="dot" style="background:${t.color}"></span>` : ''}<span class="chip-text">${esc(me.name)}</span>`;
  $('#me-chip').title = me.judge ? `${me.name} · Judge` : t ? `${me.name} · ${t.name} — tap to change` : 'Pick a team';
  $('#sound-btn').textContent = guest.sound === false ? '🔇' : '🔊';

  const team = curTeam();
  const live = game?.teams && game.phase !== 'over';
  document.body.style.setProperty('--team', team?.color || t?.color || 'var(--coral)');
  $('#cur-team').hidden = !live;
  if (live) $('#cur-team').innerHTML = `<span class="dot" style="background:${team.color}"></span><span class="chip-text">${esc(team.name)}</span>`;
  $('#timer').hidden = !live;
  $('#room').dataset.phase = game?.phase || 'lobby';
  renderTimer();

  const st = $('#pstage');
  // Whole-class co-op (one team): no need to pick, just join it.
  if (!me.judge && !t && !picking && teams().length === 1 && conn) { setTeam(teams()[0].id); return; }
  if (me.judge) st.innerHTML = game?.teams ? phaseHtml() : judgeLobbyHtml();
  else if (picking || !t) st.innerHTML = pickerHtml();
  else if (!game?.teams) st.innerHTML = lobbyHtml();
  else st.innerHTML = phaseHtml();
  // The guessing screen has its own big timer, so hide the small one.
  $('#room').classList.toggle('big-clock', !!document.getElementById('big-timer'));

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

function judgeLobbyHtml() {
  return `<div class="ready">
    <p class="eyebrow">Room ${esc(code)} · Judge</p>
    <h1 class="ready-team">⚖ You're the judge</h1>
    <p class="muted">${hostOnline ? 'Waiting for the game to start on the class computer…' : 'The class computer is offline — waiting for it to come back…'}</p>
    <p class="muted">You'll see every card and run each turn from here: start, Correct / Skip / Taboo, undo, pause, then fix and confirm the results.</p>
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

const isHS = () => game?.kind === 'hotseat';
const inSeat = () => isHS() && !!me.id && game.seatId === me.id;
/** Hot Seat: may this device press Correct / Pass / Undo? (the seat's teammates; in Who Am I? anyone but the seat) */
const ch = () => isHS() && isCharades(game.settings); // Charades: the 'seat' is the actor, the only player who sees the word
const hsRuns = () => isHS() && (ch() ? me.judge || inSeat() : !inSeat() && (me.judge || me.team === curTeamId() || game.settings.style === 'whoami'
  // nobody else from the seat's team is online: anyone else may score for them
  || !roster.some((p) => p.role === 'player' && p.team === curTeamId() && p.id !== game.seatId)));
const hsOnTeam = () => me.judge || me.team === curTeamId() || inSeat();

function hsPhaseHtml() {
  const g = game;
  const s = g.settings;
  const style = STYLE[s.style] || STYLE.hotseat;
  const team = curTeam();
  const p = g.phase;
  const seatName = inSeat() ? 'You' : g.seatName || (g.seatId === 'host' ? 'The teacher' : 'Someone in the room');
  const c = (r) => g.log.filter((e) => e.result === r).length;
  const total = turnTotal(g.log, s);
  const tallyHS = `<div class="tally"><span class="t correct">✓ ${c('correct')}</span><span class="t skip">↷ ${c('pass')}</span><span class="t taboo">✕ ${c('foul')}</span><span class="t pts">${total >= 0 ? '+' : ''}${total}</span></div>`;

  if (p === 'ready') {
    if (inSeat()) {
      return `<div class="ready"><p class="eyebrow">${esc(style.name)} · your turn</p><h1 class="ready-team">${ch() ? 'You’re acting!' : 'You’re in the hot seat!'}</h1>
        <p class="muted">${ch() ? 'The word appears on this phone. Act it out for your team — no talking, no sounds!' : `${s.style === 'whoami' ? 'Ask yes/no questions to work out the word.' : 'Your team describes the word — you guess.'} Don't look at anyone else's screen!`}</p>
        <button class="btn primary huge" data-act="start">Start turn <kbd>Space</kbd></button></div>`;
    }
    return `<div class="ready"><p class="eyebrow">${esc(style.name)} · up next</p><h1 class="ready-team">${esc(team.name)}</h1>
      <p class="seat-note">${ch() ? `🎭 ${esc(seatName)} ${g.seatName || g.seatId === 'host' ? 'acts it out' : 'comes up to act it out'}` : `🪑 ${esc(seatName)} ${g.seatName || g.seatId === 'host' ? 'is in the hot seat' : 'sits in the hot seat'}`}</p>
      <p class="muted">${esc(style.rule)}<br>${s.seconds} seconds · ${esc(passRuleText(s))}${s.foulPenalty ? ' · Rule broken −1' : ''}</p>
      ${hsOnTeam() ? '<button class="btn primary huge" data-act="start">Start turn <kbd>Space</kbd></button>' : ''}</div>`;
  }
  if (p === 'paused') {
    return `<div class="ready"><p class="eyebrow">Paused</p><h1 class="ready-team">Word hidden</h1>
      ${hsOnTeam() ? '<button class="btn primary huge" data-act="pause">Resume <kbd>P</kbd></button>' : ''}</div>`;
  }
  if (p === 'playing') {
    if ((inSeat() && !ch()) || !g.card) {
      return `<div class="ready guess"><p class="eyebrow">${inSeat() ? 'You’re in the hot seat' : `${esc(team.name)} is playing`}</p>
        <h1 class="ready-team">${inSeat() ? (s.style === 'whoami' ? 'Ask yes/no questions!' : 'Listen and guess!') : ch() ? (me.team === curTeamId() ? `Watch ${esc(seatName)} and guess!` : `${esc(seatName)} is acting`) : 'Watch and wait'}</h1>
        <div class="big-timer" id="big-timer"></div>${tallyHS}
        ${inSeat() ? '<button class="link" data-act="pause">Pause <kbd>P</kbd></button>' : ''}</div>`;
    }
    const w = g.card;
    const runs = hsRuns();
    return `<div class="card-wrap hs-wrap">
      <p class="remote-note">${ch() ? `🎭 ${seatName === 'You' ? 'You’re acting — no talking!' : `${esc(seatName)} is acting`}` : `🪑 ${esc(seatName)} ${seatName === 'You' ? 'are' : 'is'} in the hot seat${runs ? '' : ' — call it if a rule is broken!'}`}</p>
      <div class="hs-card"><span class="level-tag">${esc(w.label || w.level)}</span><div class="hs-word">${esc(w.word)}</div>
        ${s.showAvoid && !ch() ? `<div class="hs-avoid"><span>Don’t say</span>${w.taboo.map((t) => `<b>${esc(t)}</b>`).join('')}</div>` : ''}</div>
      ${tallyHS}
      ${runs ? `<div class="act ${ch() && inSeat() ? 'act-two' : ''}">
        ${ch() && inSeat() ? '' : '<button class="btn act-taboo" data-act="foul">Rule broken <kbd>X</kbd><kbd>↓</kbd></button>'}
        <button class="btn act-skip" data-act="pass">Pass <kbd>S</kbd><kbd>←</kbd></button>
        <button class="btn act-correct" data-act="correct">Correct <kbd>Space</kbd><kbd>→</kbd></button></div>
        <div class="act-minor"><button class="link" data-act="undo" ${g.log.length ? '' : 'disabled'}>↶ Undo last <kbd>Z</kbd><kbd>↑</kbd></button>
          <button class="link" data-act="pause">Pause <kbd>P</kbd></button></div>`
        : '<button class="btn act-taboo buzz" data-act="foul">Rule broken! <kbd>X</kbd><kbd>↓</kbd></button>'}</div>`;
  }
  if (p === 'review') {
    const pts = scoreHS(g.log, s);
    const edit = hsOnTeam();
    const sym = { correct: '✓', pass: '↷', foul: '✕', timeup: '⏱' };
    const cls = { correct: 'correct', pass: 'skip', foul: 'taboo', timeup: 'timeup' };
    const rows = g.log.map((e, i) => `<div class="rv-row"><span class="rv-word">${esc(e.card?.word || '—')}${e.result === 'timeup' ? ' <span class="rv-timeup">⏱ time ran out</span>' : ''}</span>
      <span class="rv-btns">${edit ? ['correct', 'pass', 'foul'].map((r) => `<button class="rv ${cls[r]} ${e.result === r ? 'on' : ''}" data-rv="${i}" data-r="${r}">${sym[r]}</button>`).join('')
        : `<span class="rv ${cls[e.result]} on">${sym[e.result]}</span>`}</span>
      <span class="rv-pts">${pts[i] > 0 ? '+' : ''}${pts[i]}</span></div>`).join('');
    return `<div class="review"><p class="eyebrow">${ch() ? 'Time’s up!' : 'Time’s up — the hot seat can look'}</p>
      <h2>${esc(team.name)}: <span class="${total < 0 ? 'neg' : ''}">${total >= 0 ? '+' : ''}${total}</span></h2>
      ${edit ? '<p class="muted">Fix any mis-taps, then confirm.</p>' : '<p class="muted">Waiting for the scores to be confirmed…</p>'}
      <div class="rv-list">${rows || '<p class="muted">No words played this turn.</p>'}</div>
      ${edit ? `<button class="btn primary huge" data-act="confirm">${g.coop ? 'Confirm &amp; next turn' : 'Confirm &amp; next team'} <kbd>Enter</kbd></button>` : ''}</div>`;
  }
  return null;
}

function phaseHtml() {
  if (isHS()) { const h = hsPhaseHtml(); if (h) return h; }
  const g = game;
  const s = g.settings;
  const team = curTeam();
  const mine = me.team === curTeamId();
  const p = g.phase;

  if (p === 'ready') {
    if (iExplain()) {
      if (me.judge) {
        return `<div class="ready"><p class="eyebrow">Up next · judge</p><h1 class="ready-team">${esc(team.name)}</h1>
          <p class="muted">${g.explainerName ? `${esc(g.explainerName)} explains` : 'The next student comes up to explain'} · ${s.seconds} seconds · ${esc(skipRuleText(s))}${s.tabooPenalty ? ' · Taboo −1' : ''}</p>
          <button class="btn primary huge" data-act="start">Start turn <kbd>Space</kbd></button></div>`;
      }
      return `<div class="ready"><p class="eyebrow">Your turn to explain!</p><h1 class="ready-team">${esc(team.name)}</h1>
        <p class="muted">${s.seconds} seconds · ${esc(skipRuleText(s))}${s.tabooPenalty ? ' · Taboo −1' : ''}</p>
        <p class="muted">Describe the word without saying it or any of the taboo words.</p>
        <button class="btn primary huge" data-act="start">Start turn <kbd>Space</kbd></button></div>`;
    }
    return `<div class="ready"><p class="eyebrow">Up next</p><h1 class="ready-team">${esc(team.name)}</h1>
      <p class="muted">${esc(explainer())} ${g.explainerName ? 'explains' : 'starts the turn'}${mine ? ' — get ready to guess!' : ' — your team watches for taboo words.'}</p></div>`;
  }

  if (p === 'playing' || p === 'paused') {
    if (p === 'paused') {
      return `<div class="ready"><p class="eyebrow">Paused</p><h1 class="ready-team">Card hidden</h1>
        ${iExplain() ? '<button class="btn primary huge" data-act="pause">Resume <kbd>P</kbd></button>' : ''}</div>`;
    }
    if (iExplain() && g.card) {
      return `<div class="card-wrap">${cardHtml(g.card)}${tally(g.log, s)}
        <div class="act">
          <button class="btn act-taboo" data-act="taboo">Taboo! <kbd>X</kbd><kbd>↓</kbd></button>
          <button class="btn act-skip" data-act="skip">Skip <kbd>S</kbd><kbd>←</kbd></button>
          <button class="btn act-correct" data-act="correct">Correct <kbd>Space</kbd><kbd>→</kbd></button>
        </div>
        <div class="act-minor"><button class="link" data-act="undo" ${g.log.length ? '' : 'disabled'}>↶ Undo last <kbd>Z</kbd><kbd>↑</kbd></button>
          <button class="link" data-act="pause">Pause <kbd>P</kbd></button></div></div>`;
    }
    if (g.card) {
      return `<div class="card-wrap"><p class="remote-note">${esc(team.name)} is guessing — ${esc(explainer())} is explaining. Call it if they say a taboo word!</p>
        ${cardHtml(g.card)}${tally(g.log, s)}
        <button class="btn act-taboo buzz" data-act="taboo">Taboo! <kbd>X</kbd><kbd>↓</kbd></button></div>`;
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
      <span class="rv-word">${esc(e.card?.word || '—')}${e.result === 'timeup' ? ' <span class="rv-timeup">⏱ time ran out</span>' : ''}</span>
      <span class="rv-btns">${edit
        ? ['correct', 'taboo', 'skip'].map((r) => `<button class="rv ${r} ${e.result === r ? 'on' : ''}" data-rv="${i}" data-r="${r}">${{ correct: '✓', taboo: '✕', skip: '↷' }[r]}</button>`).join('')
        : `<span class="rv ${e.result} on">${{ correct: '✓', taboo: '✕', skip: '↷', timeup: '⏱' }[e.result]}</span>`}</span>
      <span class="rv-pts">${pts[i] > 0 ? '+' : ''}${pts[i]}</span></div>`).join('');
    return `<div class="review"><p class="eyebrow">Time's up</p>
      <h2>${esc(team.name)}: <span class="${total < 0 ? 'neg' : ''}">${total >= 0 ? '+' : ''}${total}</span></h2>
      ${edit ? '<p class="muted">Fix any mis-taps, then confirm.</p>' : '<p class="muted">Waiting for the scores to be confirmed…</p>'}
      <div class="rv-list">${rows || '<p class="muted">No cards played this turn.</p>'}</div>
      ${edit ? `<button class="btn primary huge" data-act="confirm">${g.coop ? 'Confirm &amp; next turn' : 'Confirm &amp; next team'} <kbd>Enter</kbd></button>` : ''}</div>`;
  }

  if (p === 'over' && g.coop) {
    const o = coopOver(g);
    return `<div class="ready"><p class="eyebrow">Game over · whole class</p>
      <h1 class="ready-team">${o.title}</h1>${o.line}
      <p class="muted">Stay here — the next game will appear when the teacher starts it.</p></div>`;
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

const FLASH = { correct: ['Correct!', 'correct'], taboo: ['TABOO!', 'taboo'], skip: ['Skip', 'skip'], timeup: ['Time’s up!', 'timeup'], start: ['Go!', 'start'], pass: ['Pass', 'skip'], foul: ['Rule broken!', 'taboo'] };
const FLASH_SOUND = { pass: 'skip', foul: 'taboo', timeup: 'timeUp' };
function maybeFlash() {
  const f = game?.flash;
  if (!f || f.at <= lastFlash) return;
  const first = lastFlash === 0;
  lastFlash = f.at;
  if (first || Date.now() - f.at > 2500 || !FLASH[f.type]) return;
  play(FLASH_SOUND[f.type] || f.type);
  if ((f.type === 'taboo' && iExplain()) || (f.type === 'foul' && hsRuns())) navigator.vibrate?.(250);
  const [text, cls] = FLASH[f.type];
  const el = $('#flash');
  el.innerHTML = esc(text) + ((f.type === 'taboo' || f.type === 'foul') && f.by ? `<small>called by ${esc(f.by)}</small>` : '');
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

// Every button on the phone has a key (the same keys as the teacher's screen), for a keyboard or presenter remote:
// Space / Enter start the turn · → / Space correct · ← / S skip or pass · ↓ / X taboo or rule broken · ↑ / Z undo
// P pause and resume · Enter confirm the results. A key only works when its button is showing.
document.addEventListener('keydown', (e) => {
  if (!game || $('#room').hidden || e.target.matches('input, textarea, select') || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
  const k = shortcutKey(e);
  const p = game.phase;
  if (p === 'playing' && /^Arrow/.test(e.code)) e.preventDefault(); // arrows are shortcuts here, not scrolling
  const hs = isHS();
  const runs = hs ? hsRuns() : iExplain(); // may press Correct / Skip / Undo
  const leads = hs ? hsOnTeam() : iExplain(); // may start, resume, fix and confirm
  const go = (a) => { e.preventDefault(); act(a); };
  if (p === 'ready' && leads && (k === ' ' || k === 'enter')) go('start');
  else if (p === 'playing' && k === 'p' && (runs || (hs && inSeat()))) go('pause');
  else if (p === 'paused' && k === 'p' && leads) go('pause');
  else if (p === 'review' && k === 'enter' && leads) go('confirm');
  else if (p === 'playing' && game.card) {
    if (runs && (k === ' ' || k === 'enter' || k === 'arrowright')) go('correct');
    else if (runs && k === 's') go(hs ? 'pass' : 'skip');
    else if (runs && k === 'z') go('undo');
    else if (k === 'x' && !inSeat()) go(hs ? 'foul' : 'taboo');
  }
});

// Coming back to a room we were already in (reload, or the phone slept): rejoin straight away.
if (code && guest.name && guest.ids[code]) { me.team = guest.team[code] ?? null; join(); }
