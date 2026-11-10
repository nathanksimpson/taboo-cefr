// Main screen: a TV, projector or laptop that shows an online room to everyone in it.
// It watches only — players act on their own phones. It never shows the Taboo card
// (the guessers can see it), but does show the Hot Seat / Who Am I? word, like the class view.
import { SET_LABEL, TEAM_COLORS, esc, sfx } from './core.js';
import { teamCount, teamName, members, explainerOf, seatFor, turnLimit, scoreLog } from './online-engine.js';
import { T } from './online-text.js';
import { getLang, onLangChange } from './i18n.js';

const $ = (s) => document.querySelector(s);
let ui = getLang();
const t = (key, vars = {}) => {
  const s = T[ui][key] ?? T.en[key] ?? key;
  return typeof s === 'string' ? s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '') : s;
};
const langName = (l) => T[ui].langName[l];

/* ---------------- room ---------------- */
const params = new URLSearchParams(location.search);
let code = (params.get('room') || '').toUpperCase();
if (!/^[A-Z]{4}$/.test(code)) {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  code = Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => letters[b % letters.length]).join('');
  history.replaceState(null, '', `?room=${code}`);
}
const pid = `scr${Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('')}`;
const joinUrl = `${location.host}${location.pathname.replace(/screen\.html$/, '')}online.html`;

let state = null;
let online = new Set();
let offset = 0;
let retry = 0;
let sounds = true;
try { sounds = JSON.parse(localStorage.getItem('screen.sounds.v1') ?? 'true'); } catch { /* storage off */ }

function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/api/room/${code}/ws?pid=${pid}&display=1`);
  setConn(retry ? t('reconnecting') : t('connecting'));
  ws.onopen = () => { retry = 0; };
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type !== 'state') return;
    offset = msg.now - Date.now();
    online = new Set(msg.online);
    setConn('');
    onState(msg.state);
  };
  ws.onclose = () => { setConn(t('reconnecting')); retry += 1; setTimeout(connect, Math.min(8000, 500 * 2 ** retry)); };
  setInterval(() => { if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'ping' })); }, 25000);
}
function setConn(text) { $('#conn').hidden = !text; $('#conn').textContent = text; }
const serverNow = () => Date.now() + offset;

/* ---------------- helpers ---------------- */
const nm = (p) => esc(state.players[p]?.name || '?');
const colorOf = (team) => (state.settings.mode === 'coop' ? '#27c3c9' : TEAM_COLORS[team]);
const tag = (l) => `<span class="lang-tag ${l}">${esc(langName(l))}</span>`;
const people = () => {
  const tr = state.turn;
  const lead = tr ? tr.explainer : explainerOf(state);
  const team = tr ? tr.team : state.team;
  return { lead, team, seat: tr ? tr.seat : seatFor(state, lead, team) };
};
const label = (r) => {
  const taboo = state.settings.style === 'taboo';
  return { correct: t('correct'), taboo: taboo ? t('taboo') : t('foul'), skip: taboo ? t('skip') : t('pass') }[r];
};
function roundText() {
  const per = state.settings.mode === 'coop' ? Math.max(1, state.order.length) : teamCount(state);
  const n = Math.floor(state.turnsDone / per) + 1;
  return turnLimit(state) ? t('round', { n: Math.min(n, state.settings.rounds), m: state.settings.rounds }) : t('roundOpen', { n });
}
function tally(log) {
  const c = (r) => log.filter((e) => e.result === r).length;
  const pts = scoreLog(log, state.settings).reduce((a, b) => a + b, 0);
  return `<div class="tally scr-tally"><span class="t correct">✓ ${c('correct')}</span><span class="t taboo">✕ ${c('taboo')}</span><span class="t skip">↷ ${c('skip')}</span>
    <span class="t pts">${pts >= 0 ? '+' : ''}${pts} ${esc(t('thisTurn'))}</span></div>`;
}

/* ---------------- render ---------------- */
let prev = { phase: null, logLen: 0 };

function onState(s) {
  const was = prev;
  state = s;
  const logLen = s.turn?.log.length || 0;
  if (sounds) {
    if (was.phase === 'playing' && s.phase === 'playing' && logLen > was.logLen) sfx[s.turn.log[logLen - 1].result]?.();
    if (was.phase && was.phase !== 'playing' && was.phase !== 'paused' && s.phase === 'playing') sfx.start();
    if (was.phase === 'playing' && s.phase === 'review') sfx.timeUp();
  }
  prev = { phase: s.phase, logLen };
  render();
}

function render() {
  const s = state;
  document.documentElement.lang = ui;
  $('#scr-brand').textContent = s ? `${T[ui].titleOf[s.settings.style]} · ${t('scrTitle')}` : t('scrTitle');
  document.title = $('#scr-brand').textContent;
  $('#code-chip').textContent = code;
  $('#sound').textContent = sounds ? t('scrSoundOn') : t('scrSoundOff');
  if (!s) { $('#scr').innerHTML = `<div class="scr-lobby"><p class="eyebrow">${esc(t('connecting'))}</p></div>`; return; }
  if (s.phase === 'lobby') return renderLobby();
  renderGame();
}

function renderLobby() {
  const s = state;
  const st = s.settings;
  const players = s.order.map((p) => {
    const pl = s.players[p];
    const team = st.mode === 'teams' ? `<span class="swatch" style="background:${TEAM_COLORS[pl.team]}"></span>` : '';
    return `<li class="${online.has(p) ? '' : 'away'}">${team}<b>${esc(pl.name)}</b> ${tag(pl.lang)}</li>`;
  }).join('');
  $('#scoreboard').hidden = true;
  $('#scr').innerHTML = `<div class="scr-lobby">
    <div class="scr-join">
      <p class="eyebrow">${esc(t('scrJoin'))}</p>
      <div class="scr-code">${esc(code)}</div>
      <p class="scr-url">${esc(t('scrJoinAt', { url: joinUrl }))}</p>
    </div>
    <div class="scr-side">
      <p class="scr-game"><b>${esc(T[ui].titleOf[st.style])}</b> · ${esc(st.mode === 'coop' ? t('coop') : `${t('teams')} (${st.teamCount})`)} · ${st.seconds}s · ${esc(st.rounds ? `${t('rounds')} ${st.rounds}` : t('roundOpen', { n: '∞' }))}</p>
      <h2>${esc(t('players'))} · ${s.order.length}</h2>
      ${players ? `<ul class="scr-players">${players}</ul>` : `<p class="muted">${esc(t('scrNoPlayers'))}</p>`}
      <p class="scr-hint">${esc(s.order.length < 2 ? t('scrWaiting') : t('scrStartHint'))}</p>
    </div>
  </div>`;
}

function cardHtml(c) {
  const st = state.settings;
  const list = st.style === 'hotseat' && st.showAvoid;
  return `<div class="card scr-card" lang="${c.lang}">
    <div class="card-top"><span class="level-tag">${esc(SET_LABEL(c.level) || c.level)}</span></div>
    <div class="target">${esc(c.word)}</div>
    ${list ? `<div class="taboo-label">${esc(t('avoid'))}</div><ul class="taboo-list">${c.taboo.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
  </div>`;
}

function renderGame() {
  const s = state;
  const tr = s.turn;
  const style = s.settings.style;
  const { lead, team, seat } = people();
  const lang = s.players[lead]?.lang || 'en';
  const chip = s.phase === 'over' ? t('gameOver') : `${s.settings.mode === 'coop' ? t('coopChip') : teamName(s, team)} · ${roundText()}`;
  const head = `<div class="scr-bar" style="--team:${colorOf(team)}">
    <div class="team-chip"><span class="dot"></span>${esc(chip)}</div>
    <div class="timer scr-timer" id="timer"></div>
  </div>`;
  let body = '';
  if (s.phase === 'ready') {
    const who = style === 'taboo' ? t('explains', { name: s.players[lead]?.name || '?' })
      : style === 'hotseat' ? t('describes', { name: s.players[lead]?.name || '?', seat: s.players[seat]?.name || '?' })
        : t('asks', { seat: s.players[seat]?.name || '?' });
    const last = s.lastTurn ? `<p class="scr-sub">${esc(t('lastTurn', { name: s.players[s.lastTurn.explainer]?.name || '?', pts: `${s.lastTurn.pts >= 0 ? '+' : ''}${s.lastTurn.pts}` }))}</p>` : '';
    body = `<div class="scr-center">
      <p class="eyebrow">${esc(t('upNext'))}</p>
      <h1 class="scr-big">${esc(who)}</h1>
      <p class="scr-sub">${tag(lang)} ${esc(style === 'whoami' ? t('waRule') : style === 'hotseat' ? t('hsRule') : t('explainInLang', { lang: langName(lang), sec: s.settings.seconds }))}</p>
      ${seat ? `<p class="scr-warn">${esc(t('scrDontLook', { seat: s.players[seat]?.name || '?' }))}</p>` : ''}
      ${last}
      <p class="scr-sub muted">${esc(t('youWait', { name: s.players[lead]?.name || '?' }))}</p>
    </div>`;
  } else if ((s.phase === 'playing' || s.phase === 'paused') && tr) {
    if (s.phase === 'paused') {
      body = `<div class="scr-center"><p class="eyebrow">${esc(t('paused'))}</p><h1 class="scr-big">${esc(t('cardHidden'))}</h1></div>`;
    } else if (tr.card) {
      body = `<div class="scr-center">
        ${seat ? `<p class="scr-warn">${esc(t('scrDontLook', { seat: s.players[seat]?.name || '?' }))}</p>` : ''}
        ${cardHtml(tr.card)}
        ${tally(tr.log)}
      </div>`;
    } else {
      body = `<div class="scr-center">
        <p class="eyebrow">${tag(lang)} ${esc(t('explaining', { name: s.players[lead]?.name || '?', lang: langName(lang) }))}</p>
        <h1 class="scr-big">${esc(t('guess'))}</h1>
        <div class="scr-count">✓ ${tr.log.filter((e) => e.result === 'correct').length}</div>
        ${tally(tr.log)}
      </div>`;
    }
  } else if (s.phase === 'review' && tr) {
    const pts = scoreLog(tr.log, s.settings);
    const sum = pts.reduce((a, b) => a + b, 0);
    body = `<div class="scr-center scr-review">
      <p class="eyebrow">${esc(tr.cardsLeft > 0 ? t('timesUp') : t('outOfCards'))}</p>
      <h1 class="scr-big">${esc(s.players[tr.explainer]?.name || '?')} <span class="${sum < 0 ? 'neg' : ''}">${sum >= 0 ? '+' : ''}${sum}</span></h1>
      <p class="scr-sub">${esc(t('scrWords'))}</p>
      <ul class="scr-words">${tr.log.map((e, i) => `<li class="${e.result}" lang="${e.card?.lang || 'en'}"><span>${{ correct: '✓', taboo: '✕', skip: '↷' }[e.result]}</span><b>${esc(e.card?.word || '')}</b><em>${esc(label(e.result))}</em><i>${pts[i] > 0 ? '+' : ''}${pts[i]}</i></li>`).join('') || `<li class="muted">${esc(t('noCardsPlayed'))}</li>`}</ul>
    </div>`;
  } else if (s.phase === 'over') {
    if (s.settings.mode === 'coop') {
      const score = s.scores[0] || 0;
      body = `<div class="scr-center"><p class="eyebrow">${esc(t('gameOver'))}</p><p class="scr-sub">${esc(t('coopScored'))}</p>
        <div class="scr-score">${score}</div>
        <p class="scr-sub">${score > 0 && score >= s.best ? `<b>${esc(t('newBest'))}</b> · ` : ''}${esc(t('best', { n: s.best }))}</p></div>`;
    } else {
      const ranked = s.scores.map((sc, i) => ({ sc, i })).sort((a, b) => b.sc - a.sc);
      const win = ranked.filter((r) => r.sc === ranked[0].sc);
      body = `<div class="scr-center"><p class="eyebrow">${esc(t('gameOver'))}</p>
        <h1 class="scr-big">${esc(win.length > 1 ? t('tie') : t('wins', { name: teamName(s, win[0].i) }))}</h1>
        <ol class="final">${ranked.map((r) => `<li style="--team:${TEAM_COLORS[r.i]}"><span>${esc(teamName(s, r.i))}</span><b>${r.sc}</b></li>`).join('')}</ol></div>`;
    }
  }
  $('#scr').innerHTML = head + body;
  renderScores();
  tick();
}

function renderScores() {
  const s = state;
  const sb = $('#scoreboard');
  sb.hidden = false;
  if (s.settings.mode === 'coop') {
    sb.innerHTML = `<div class="score cur" style="--team:#27c3c9"><span class="score-name">${esc(t('shared'))} · ${s.order.map(nm).join(', ')}</span><span class="score-adj"><b>${s.scores[0] || 0}</b></span></div>`;
    return;
  }
  const cur = s.turn ? s.turn.team : s.team;
  sb.innerHTML = Array.from({ length: teamCount(s) }, (_, i) => `<div class="score ${i === cur && s.phase !== 'over' ? 'cur' : ''}" style="--team:${TEAM_COLORS[i]}">
    <span class="score-name">${esc(teamName(s, i))} <span class="muted small-names">${members(s, i).map(nm).join(', ')}</span></span>
    <span class="score-adj"><b>${s.scores[i] || 0}</b></span></div>`).join('');
}

/* ---------------- timer ---------------- */
let lastSec = null;
function tick() {
  const el = $('#timer');
  if (!el || !state) return;
  const tr = state.turn;
  let ms = state.settings.seconds * 1000;
  if (tr && state.phase === 'playing') ms = Math.max(0, tr.endAt - serverNow());
  else if (tr && state.phase === 'paused') ms = tr.remaining;
  else if (state.phase === 'review' || state.phase === 'over') ms = 0;
  const sec = Math.ceil(ms / 1000);
  el.textContent = state.phase === 'over' ? '' : sec >= 60 ? `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}` : String(sec);
  el.hidden = state.phase === 'over';
  el.classList.toggle('low', state.phase === 'playing' && sec <= 10);
  if (sounds && state.phase === 'playing' && sec <= 5 && sec > 0 && sec !== lastSec) sfx.tick();
  lastSec = sec;
}
setInterval(tick, 200);

/* ---------------- controls ---------------- */
$('#sound').onclick = () => {
  sounds = !sounds;
  try { localStorage.setItem('screen.sounds.v1', JSON.stringify(sounds)); } catch { /* storage off */ }
  if (sounds) sfx.start(); // a click also lets the browser play sound
  render();
};
const fullscreen = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.());
$('#fullscreen').onclick = fullscreen;
document.addEventListener('keydown', (e) => { if (e.key === 'f' || e.key === 'F') fullscreen(); });
onLangChange((l) => { ui = l; render(); });

render();
connect();
