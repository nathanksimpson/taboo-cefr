// Taboo Online — each player on their own device, synced through a room on the server.
import {
  SET_LABEL, SET_LANG, TEAM_COLORS, cardLang, activeCards, wordKey, seenStore, buildDeck, esc, sfx, shortcutKey,
} from './core.js';
import { setupDeckPicker, deckSummary } from './decks.js';
import { openCardManager, cardManagerOpen } from './cardmanager.js';
import { getLang, setLang, onLangChange } from './i18n.js';
import { T } from './online-text.js';
import { mountTeamBoard } from './team-board.js';
import {
  MAX_TEAMS, teamCount, teamName, members, explainerOf, turnLimit, scoreLog, seatFor, canRun,
} from './online-engine.js';

const $ = (s) => document.querySelector(s);
const seen = seenStore('online');
const CARDS_PER_TURN = 60;

/* ---------------- words on screen (English / 한국어) ---------------- */


const load = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage off */ } };

let ui = getLang();
function t(key, vars = {}) {
  const s = T[ui][key] ?? T.en[key] ?? key;
  return typeof s === 'string' ? s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '') : s;
}
const langName = (l) => T[ui].langName[l];

/* ---------------- my profile & decks (this device) ---------------- */

const profile = load('online.profile.v1', { name: '', lang: ui === 'ko' ? 'en' : 'ko' });
const DEFAULT_SETS = { en: ['A2', 'B1'], ko: ['K1', 'K2'] };
const deckSettings = { sets: load('online.sets.v1', null) || DEFAULT_SETS[profile.lang] };
let sounds = load('online.sounds.v1', true);
const saveProfile = () => save('online.profile.v1', profile);

/* ---------------- connection ---------------- */

let code = null;
let pid = null;
const GAME_PARAM = new URLSearchParams(location.search).get('game');
let pendingStyle = ['taboo', 'hotseat', 'whoami'].includes(GAME_PARAM) ? GAME_PARAM : null;
let createdHere = false;
let ws = null;
let state = null;
let online = new Set();
let screens = 0;
let offset = 0;          // server clock − this clock
let retry = 0;
let closedOnPurpose = false;
const serverNow = () => Date.now() + offset;

const randId = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('');
const pidKey = (c) => `online.pid.${c}`;

function connect() {
  closedOnPurpose = false;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/api/room/${code}/ws?pid=${pid}`);
  setConn(retry ? t('reconnecting') : t('connecting'));
  ws.onopen = () => { retry = 0; send({ type: 'hello', name: profile.name, lang: profile.lang }); };
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'state') {
      offset = msg.now - Date.now();
      online = new Set(msg.online);
      screens = msg.screens || 0;
      setConn('');
      onState(msg.state);
    } else if (msg.type === 'error') {
      if (msg.error === 'full') { $('#join-err').textContent = t('errFull'); leaveRoom(); }
      if (msg.action === 'assign' || msg.action === 'shuffleTeams') {
        const text = msg.error === 'small-team' ? t('smallTeam') : t('emptyTeam');
        renderBoard.note(text); renderBoardGame.note(text);
      }
    }
  };
  ws.onclose = () => {
    if (closedOnPurpose) return;
    setConn(t('reconnecting'));
    retry += 1;
    setTimeout(connect, Math.min(8000, 500 * 2 ** retry));
  };
}
function send(a) { if (ws?.readyState === 1) ws.send(JSON.stringify(a)); }
function setConn(text) { $('#conn').hidden = !text; $('#conn').textContent = text; }

function enterRoom(c, existingPid) {
  code = c;
  pid = existingPid || randId(16);
  save(pidKey(code), { pid, name: profile.name });
  try { sessionStorage.setItem('online.room', JSON.stringify({ code, pid })); } catch { /* ignore */ }
  history.replaceState(null, '', `?room=${code}`);
  // the invite link is the same for every game, so the activity is set once the room exists
  connect();
}
function leaveRoom() {
  closedOnPurpose = true;
  ws?.close();
  ws = null; state = null; code = null;
  try { sessionStorage.removeItem('online.room'); } catch { /* ignore */ }
  history.replaceState(null, '', location.pathname);
  $('#my-name').value = profile.name;
  show('join'); renderJoin();
}

/* ---------------- screens ---------------- */

function show(id) { for (const s of ['join', 'lobby', 'play']) $(`#${s}`).hidden = s !== id; }

function translateStatic() {
  document.documentElement.lang = ui;
  document.querySelectorAll('[data-t]').forEach((el) => { el.textContent = t(el.dataset.t); });
  document.querySelectorAll('#uilang button').forEach((b) => b.classList.toggle('on', b.dataset.ui === ui));
  const style = state?.settings.style || pendingStyle || 'taboo';
  const title = T[ui].titleOf[style];
  document.title = title;
  document.querySelector('.brand [data-t="title"]').textContent = title;
}

function renderJoin() {
  document.querySelectorAll('#my-lang button').forEach((b) => b.classList.toggle('on', b.dataset.lang === profile.lang));
  $('#my-lang [data-lang="en"]').textContent = `${langName('en')}`;
  $('#my-lang [data-lang="ko"]').textContent = `${langName('ko')}`;
  const c = $('#code-in').value.trim().toUpperCase();
  const prev = /^[A-Z]{4}$/.test(c) ? load(pidKey(c), null) : null;
  $('#rejoin').hidden = !prev;
  if (prev) {
    $('#rejoin').innerHTML = `<button class="btn primary" data-rejoin>${esc(t('rejoin', { name: prev.name || '?' }))}</button>
      <button class="link small" data-newplayer>${esc(t('newPlayer'))}</button>`;
  }
}

function joinChecks(needCode) {
  profile.name = $('#my-name').value.trim().slice(0, 24); saveProfile();
  if (!profile.name) { $('#join-err').textContent = t('needName'); $('#my-name').focus(); return null; }
  const c = $('#code-in').value.trim().toUpperCase();
  if (needCode && !/^[A-Z]{4}$/.test(c)) { $('#join-err').textContent = t('needCode'); $('#code-in').focus(); return null; }
  $('#join-err').textContent = '';
  return c;
}

$('#create').onclick = () => {
  if (joinChecks(false) === null) return;
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  createdHere = true;
  enterRoom(Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => letters[b % letters.length]).join(''));
};
$('#join-btn').onclick = () => {
  const c = joinChecks(true); if (!c) return;
  const prev = load(pidKey(c), null);
  enterRoom(c, prev?.pid);
};
$('#rejoin').addEventListener('click', (e) => {
  const c = joinChecks(true); if (!c) return;
  if (e.target.closest('[data-rejoin]')) enterRoom(c, load(pidKey(c), null)?.pid);
  if (e.target.closest('[data-newplayer]')) enterRoom(c);
});
$('#code-in').addEventListener('input', (e) => {
  e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, '');
  $('#use-screen').href = /^[A-Z]{4}$/.test(e.target.value) ? `screen.html?room=${e.target.value}` : 'screen.html';
  renderJoin();
});
$('#code-in').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#join-btn').click(); });
$('#my-lang').addEventListener('click', (e) => {
  const b = e.target.closest('[data-lang]'); if (!b) return;
  setMyLang(b.dataset.lang); renderJoin();
});

function setMyLang(lang) {
  if (lang === profile.lang) return;
  profile.lang = lang; saveProfile();
  // switch to the new language's starter decks if every chosen deck was in the old language
  if (deckSettings.sets.length && deckSettings.sets.every((s) => s !== 'MY' && SET_LANG(s) !== lang)) {
    deckSettings.sets = [...DEFAULT_SETS[lang]]; save('online.sets.v1', deckSettings.sets);
  }
  if (code) send({ type: 'profile', lang });
}

// one language setting for the whole site (i18n.js handles the EN / 한국어 buttons)
onLangChange((l) => {
  ui = l;
  translateStatic();
  if (state) onState(state); else renderJoin();
});

/* ---------------- lobby ---------------- */

const renderDecks = setupDeckPicker({ settings: deckSettings, save: () => { save('online.sets.v1', deckSettings.sets); renderLobby(); } });
const settingsPatch = (patch) => send({ type: 'settings', patch });

function renderLobby() {
  if (!state) return;
  const s = state.settings;
  $('#room-code').textContent = state.code;
  $('#open-screen').href = `screen.html?room=${state.code}`;
  $('#screen-on').hidden = !screens;
  document.querySelectorAll('#style button').forEach((b) => b.classList.toggle('on', b.dataset.style === s.style));
  $('#style-desc').textContent = T[ui].styleDesc[s.style];
  $('#avoid-rule').hidden = s.style !== 'hotseat';
  $('#show-avoid').checked = !!s.showAvoid;
  $('#pen-label').textContent = T[ui].penLabel[s.style];
  document.querySelectorAll('#mode button').forEach((b) => b.classList.toggle('on', b.dataset.mode === s.mode));
  $('#mode-desc').textContent = s.mode === 'coop' ? t('coopDesc') : t('teamsDesc');
  $('#teams-rule').hidden = s.mode !== 'teams';
  $('#team-count').textContent = s.teamCount;
  const inputs = $('#team-name-inputs');
  if (!inputs.contains(document.activeElement)) {
    inputs.innerHTML = Array.from({ length: s.teamCount }, (_, i) => `<label class="team-name" style="--team:${TEAM_COLORS[i]}">
      <span class="swatch" style="background:${TEAM_COLORS[i]}"></span><input data-team-name="${i}" maxlength="20" value="${esc(s.teamNames[i])}"></label>`).join('');
  }
  $('#timer-presets').innerHTML = [30, 45, 60, 90, 120].map((sec) =>
    `<button data-sec="${sec}" class="${s.seconds === sec ? 'on' : ''}">${sec >= 60 ? `${sec / 60} min` : `${sec}s`}</button>`).join('');
  document.querySelectorAll('#skip-modes button').forEach((b) => b.classList.toggle('on', b.dataset.skip === s.skipMode));
  $('#free-skips-wrap').hidden = s.skipMode !== 'limited';
  if (document.activeElement !== $('#free-skips')) $('#free-skips').value = s.freeSkips;
  $('#taboo-penalty').checked = s.tabooPenalty;
  if (document.activeElement !== $('#rounds')) $('#rounds').value = s.rounds;
  $('#rounds-note').textContent = s.mode === 'coop' ? t('roundsCoop') : t('roundsTeams');
  $('#sounds').checked = sounds;

  // players: in team games everyone is shown on the team board; this list just keeps my own row (language)
  const teamGame = s.mode === 'teams';
  $('#team-board').hidden = !teamGame;
  $('#team-name-inputs').hidden = teamGame; // renamed on the board instead
  if (teamGame) renderBoard();
  $('#players').innerHTML = state.order.filter((p) => !teamGame || p === pid).map((p) => {
    const pl = state.players[p];
    const mine = p === pid;
    const on = online.has(p);
    const teamSel = s.mode === 'teams' && !teamGame
      ? `<div class="seg team-pick">${Array.from({ length: s.teamCount }, (_, i) => `<button data-team="${i}" data-pid="${p}" class="${pl.team === i ? 'on' : ''}" style="--team:${TEAM_COLORS[i]}" title="${esc(teamName(state, i))}"><span class="swatch" style="background:${TEAM_COLORS[i]}"></span>${esc(teamName(state, i))}</button>`).join('')}</div>`
      : '';
    return `<div class="player ${mine ? 'me' : ''}">
      <span class="online-dot ${on ? 'on' : ''}" title="${on ? '' : esc(t('offline'))}"></span>
      <span class="player-name">${esc(pl.name)}${mine ? ` <span class="muted">(${esc(t('you'))})</span>` : ''}${on ? '' : ` <span class="muted">· ${esc(t('offline'))}</span>`}</span>
      ${mine
        ? `<div class="seg lang-pick"><button data-mylang="en" class="${pl.lang === 'en' ? 'on' : ''}">${esc(langName('en'))}</button><button data-mylang="ko" class="${pl.lang === 'ko' ? 'on' : ''}">${esc(langName('ko'))}</button></div>`
        : `<span class="lang-tag ${pl.lang}">${esc(langName(pl.lang))}</span>`}
      ${teamSel}
      ${!mine && !on ? `<button class="link small" data-remove="${p}">${esc(t('remove'))}</button>` : ''}
    </div>`;
  }).join('');

  // my decks
  renderDecks();
  const mine = activeCards(deckSettings.sets);
  const me = state.players[pid];
  const mismatch = me && deckSettings.sets.length && !deckSettings.sets.some((x) => x === 'MY' || SET_LANG(x) === me.lang);
  $('#deck-count').innerHTML = esc(deckSummary(deckSettings.sets, mine.length))
    + (mismatch ? `<br><b>${esc(t('langMismatch', { lang: langName(me.lang) }))}</b>` : '');

  // start
  let note = '';
  if (state.order.length < 2) note = t('needTwo');
  else if (s.mode === 'teams' && Array.from({ length: s.teamCount }, (_, i) => members(state, i).length).some((n) => !n)) note = t('emptyTeam');
  else if (s.mode === 'teams' && s.style === 'hotseat' && Array.from({ length: s.teamCount }, (_, i) => members(state, i).length).some((n) => n < 2)) note = t('smallTeam');
  else if (!mine.length) note = t('noDecks');
  $('#start-note').textContent = note;
  $('#start').disabled = !!note;
}

$('#style').addEventListener('click', (e) => { const b = e.target.closest('[data-style]'); if (b) settingsPatch({ style: b.dataset.style }); });
$('#show-avoid').onchange = (e) => settingsPatch({ showAvoid: e.target.checked });
$('#mode').addEventListener('click', (e) => { const b = e.target.closest('[data-mode]'); if (b) settingsPatch({ mode: b.dataset.mode }); });
$('#team-minus').onclick = () => settingsPatch({ teamCount: state.settings.teamCount - 1 });
$('#team-plus').onclick = () => settingsPatch({ teamCount: Math.min(MAX_TEAMS, state.settings.teamCount + 1) });
$('#team-name-inputs').addEventListener('change', (e) => {
  const i = e.target.dataset.teamName; if (i === undefined) return;
  const names = [...state.settings.teamNames]; names[+i] = e.target.value; settingsPatch({ teamNames: names });
});
$('#timer-presets').addEventListener('click', (e) => { const b = e.target.closest('[data-sec]'); if (b) settingsPatch({ seconds: +b.dataset.sec }); });
$('#skip-modes').addEventListener('click', (e) => { const b = e.target.closest('[data-skip]'); if (b) settingsPatch({ skipMode: b.dataset.skip }); });
$('#free-skips').addEventListener('change', (e) => settingsPatch({ freeSkips: +e.target.value }));
$('#taboo-penalty').onchange = (e) => settingsPatch({ tabooPenalty: e.target.checked });
$('#rounds').addEventListener('change', (e) => settingsPatch({ rounds: +e.target.value }));
$('#sounds').onchange = (e) => { sounds = e.target.checked; save('online.sounds.v1', sounds); };
$('#players').addEventListener('click', (e) => {
  const tb = e.target.closest('[data-team]');
  if (tb) { if (tb.dataset.pid === pid) send({ type: 'profile', team: +tb.dataset.team }); return; }
  const lb = e.target.closest('[data-mylang]');
  if (lb) { setMyLang(lb.dataset.mylang); renderLobby(); return; }
  const rb = e.target.closest('[data-remove]');
  if (rb) send({ type: 'remove', pid: rb.dataset.remove });
});
$('#start').onclick = () => send({ type: 'start' });
$('#leave').onclick = leaveRoom;
$('#show-qr').onclick = async () => {
  const box = $('#room-qr');
  box.hidden = !box.hidden;
  $('#show-qr').setAttribute('aria-expanded', String(!box.hidden));
  if (!box.hidden) {
    const { qrSvg } = await import('./qr.js');
    box.innerHTML = qrSvg(`${location.origin}${location.pathname}?room=${state.code}`, { title: `Scan to join room ${state.code}` });
  }
};
$('#copy-link').onclick = async () => {
  const link = `${location.origin}${location.pathname}?room=${state.code}`;
  try { await navigator.clipboard.writeText(link); } catch { prompt('Invite link', link); return; }
  $('#copy-link').textContent = t('copied');
  setTimeout(() => { $('#copy-link').textContent = t('copyLink'); }, 1500);
};
const cardHooks = { onAdd: () => {}, onClose: () => { if (state?.phase === 'lobby') renderLobby(); } };
$('#manage-cards').onclick = () => openCardManager(cardHooks);
$('#manage-cards-top').onclick = () => openCardManager(cardHooks);

/* ---------------- teams ---------------- */
const boardOpts = { getState: () => state, pid: () => pid, send: (a) => send(a), online: () => online, ui: () => ui, langName: (l) => langName(l) };
const renderBoard = mountTeamBoard($('#team-board'), boardOpts);
const renderBoardGame = mountTeamBoard($('#team-board-game'), boardOpts);
$('#teams-btn').onclick = () => { renderBoardGame(); $('#teams-dlg').showModal(); };
$('#teams-done').onclick = () => $('#teams-dlg').close();

/* ---------------- game ---------------- */

const nameOf = (p) => esc(state.players[p]?.name || '?');
const colorOf = (team) => (state.settings.mode === 'coop' ? '#27c3c9' : TEAM_COLORS[team]);
/**
 * My part in the current (or next) turn:
 * 'explainer' runs a Taboo turn or leads Hot Seat describing · 'seat' is in the hot seat (can't see the card)
 * 'helper' sees the card and helps describe / answers (Hot Seat, Who Am I?) · 'opponent' watches for broken rules
 * 'guesser' guesses a Taboo explainer's word
 */
const turnPeople = () => {
  const tr = state.turn;
  const lead = tr ? tr.explainer : explainerOf(state);
  const team = tr ? tr.team : state.team;
  return { lead, team, seat: tr ? tr.seat : seatFor(state, lead, team) };
};
const myRole = () => {
  const { lead, team, seat } = turnPeople();
  const style = state.settings.style;
  if (pid === seat) return 'seat';
  if (pid === lead) return 'explainer';
  if (state.settings.mode === 'teams' && state.players[pid]?.team !== team) return 'opponent';
  return style === 'taboo' ? 'guesser' : 'helper';
};
const label = (r) => {
  const taboo = state.settings.style === 'taboo';
  return { correct: t('correct'), taboo: taboo ? t('taboo') : t('foul'), skip: taboo ? t('skip') : t('pass') }[r];
};

let prev = { phase: null, logLen: 0 };
let timeUpSent = false;

function onState(s) {
  const was = prev;
  state = s;
  if (createdHere && pendingStyle && s.phase === 'lobby') {
    if (s.settings.style !== pendingStyle) send({ type: 'settings', patch: { style: pendingStyle } });
    createdHere = false;
  }
  translateStatic();
  if (s.phase === 'lobby') { show('lobby'); renderLobby(); prev = { phase: s.phase, logLen: 0 }; return; }
  show('play');

  // sounds for what just happened
  const logLen = s.turn?.log.length || 0;
  if (sounds && was.phase === s.phase && s.phase === 'playing' && logLen > was.logLen) sfx[s.turn.log[logLen - 1].result]?.();
  if (sounds && was.phase !== 'playing' && s.phase === 'playing' && was.phase !== 'paused') sfx.start();
  if (sounds && was.phase === 'playing' && s.phase === 'review') sfx.timeUp();
  if (s.phase !== 'playing') timeUpSent = false;

  // remember the words I've explained, so my next turns use fresh ones first
  if (s.phase === 'review' && was.phase !== 'review' && s.turn?.explainer === pid) {
    s.turn.log.forEach((e) => e.card && seen.add(wordKey(e.card.word)));
  }
  prev = { phase: s.phase, logLen };
  renderPlay();
  // 👥 Teams: change teams between turns
  const canEditTeams = s.settings.mode === 'teams' && ['ready', 'over'].includes(s.phase);
  $('#teams-btn').hidden = !canEditTeams;
  if (!canEditTeams && $('#teams-dlg').open) $('#teams-dlg').close();
  if ($('#teams-dlg').open) renderBoardGame();
}

function roundText() {
  const per = state.settings.mode === 'coop' ? Math.max(1, state.order.length) : teamCount(state);
  const n = Math.floor(state.turnsDone / per) + 1;
  const lim = turnLimit(state);
  return lim ? t('round', { n: Math.min(n, state.settings.rounds), m: state.settings.rounds }) : t('roundOpen', { n });
}

function tallyHtml(log, showSkipRule) {
  const st = state.settings;
  const c = (r) => log.filter((e) => e.result === r).length;
  const pts = scoreLog(log, st).reduce((a, b) => a + b, 0);
  let note = '';
  if (showSkipRule) {
    if (st.skipMode === 'limited') note = `<span class="t-note">${esc(t('skipsLeft', { n: Math.max(0, st.freeSkips - c('skip')) }))}</span>`;
    if (st.skipMode === 'free') note = `<span class="t-note">${esc(t('skipsFree'))}</span>`;
    if (st.skipMode === 'penalty') note = `<span class="t-note">${esc(t('skipsCost'))}</span>`;
  }
  return `<div class="tally">
    <span class="t correct">✓ ${c('correct')}</span><span class="t taboo">✕ ${c('taboo')}</span><span class="t skip">↷ ${c('skip')}</span>
    <span class="t pts">${pts >= 0 ? '+' : ''}${pts} ${esc(t('thisTurn'))}</span>${note}</div>`;
}

function cardHtml(c) {
  const st = state.settings;
  const list = st.style === 'taboo' || (st.style === 'hotseat' && st.showAvoid);
  return `<div class="card" lang="${c.lang}">
    <div class="card-top"><span class="level-tag">${esc(SET_LABEL(c.level) || c.level)}</span></div>
    <div class="target">${esc(c.word)}</div>
    ${list ? `<div class="taboo-label">${esc(st.style === 'taboo' ? t('dontSay') : t('avoid'))}</div>
    <ul class="taboo-list">${c.taboo.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    ${st.style !== 'taboo' ? `<p class="card-rule">${esc(st.style === 'whoami' ? t('waRule') : t('hsRule'))}</p>` : ''}
  </div>`;
}

function renderPlay() {
  const s = state;
  const tr = s.turn;
  const team = tr ? tr.team : s.team;
  const role = myRole();
  const ex = tr ? tr.explainer : explainerOf(s);
  const exLang = s.players[ex]?.lang || 'en';
  $('#cur-team').innerHTML = s.phase === 'over'
    ? `<span class="dot" style="background:${colorOf(team)}"></span>${esc(t('gameOver'))}`
    : `<span class="dot" style="background:${colorOf(team)}"></span><span class="chip-text">${esc(s.settings.mode === 'coop' ? t('coopChip') : teamName(s, team))} · ${esc(roundText())}</span>`;
  $('#play').style.setProperty('--team', colorOf(team));
  $('#pause').hidden = !(s.phase === 'playing' || s.phase === 'paused');
  $('#pause').textContent = s.phase === 'paused' ? t('resume') : t('pause');
  $('#end-game').hidden = s.phase === 'over';
  tick();

  const st = $('#stage');
  const style = s.settings.style;
  const { seat } = turnPeople();
  const nm = (q) => s.players[q]?.name || '?';
  const tag = `<span class="lang-tag ${exLang}">${esc(langName(exLang))}</span>`;
  if (s.phase === 'ready') {
    const last = s.lastTurn
      ? `<p class="muted">${esc(t('lastTurn', { name: nm(s.lastTurn.explainer), pts: `${s.lastTurn.pts >= 0 ? '+' : ''}${s.lastTurn.pts}` }))}</p>` : '';
    const who = style === 'taboo' ? t('explains', { name: nm(ex) })
      : style === 'hotseat' ? t('describes', { name: nm(ex), seat: nm(seat) }) : t('asks', { seat: nm(seat) });
    const lang = langName(exLang);
    const note = {
      explainer: style === 'taboo' ? t('explainInLang', { lang, sec: s.settings.seconds }) : t('youDescribe', { lang }),
      seat: style === 'whoami' ? t('youAsk', { lang }) : t('youSeat'),
      helper: style === 'whoami' ? t('youAnswer') : t('youHelp', { lang }),
      guesser: t('youGuess'),
      opponent: t('youWatch'),
    }[role];
    const rule = style === 'hotseat' ? `<p class="muted">${esc(t('hsRule'))}</p>` : style === 'whoami' ? `<p class="muted">${esc(t('waRule'))}</p>` : '';
    const away = ex && !online.has(ex);
    st.innerHTML = `<div class="ready" style="--team:${colorOf(team)}">
      <p class="eyebrow">${esc(t('upNext'))}</p>
      <h1 class="ready-team">${esc(pid === ex && style === 'taboo' ? t('yourTurn') : who)}</h1>
      <p class="role-note">${tag} ${esc(note)}</p>
      ${rule}${last}
      ${pid === ex
        ? `<button class="btn primary huge" data-act="begin">${esc(t('startTurn'))} <kbd>Space</kbd></button><p class="hint" id="turn-err"></p>`
        : `<p class="muted">${esc(t('youWait', { name: nm(ex) }))}</p>
           ${away ? `<button class="link" data-act="pass">${esc(t('passTurn', { name: nm(ex) }))}</button>` : ''}`}
    </div>`;
  } else if (s.phase === 'playing' && tr) {
    if (tr.card && canRun(s, pid, tr)) {
      st.innerHTML = `<div class="card-wrap">${cardHtml(tr.card)}${tallyHtml(tr.log, true)}
        <div class="act">
          <button class="btn act-taboo" data-act="taboo">${esc(label('taboo'))} <kbd>X</kbd></button>
          <button class="btn act-skip" data-act="skip">${esc(label('skip'))} <kbd>S</kbd></button>
          <button class="btn act-correct" data-act="correct">${esc(t('correct'))} <kbd>Space</kbd></button>
        </div>
        ${role === 'helper' && style === 'whoami' ? `<p class="hint center">${esc(t('youAnswer'))}</p>` : ''}
        <div class="act-minor"><button class="link" data-act="undo" ${tr.log.length ? '' : 'disabled'}>${esc(t('undo'))} <kbd>Z</kbd></button></div>
      </div>`;
    } else if (tr.card) {
      st.innerHTML = `<div class="card-wrap">${cardHtml(tr.card)}${tallyHtml(tr.log, false)}
        <div class="act act-single"><button class="btn act-taboo buzz" data-act="taboo">${esc(label('taboo'))} <kbd>X</kbd></button></div>
        <p class="hint center">${esc(style === 'taboo' ? t('buzzNote', { name: nm(ex) }) : style === 'whoami' ? t('waRule') : t('hsRule'))}</p>
      </div>`;
    } else {
      const big = style === 'taboo' ? t('guess') : style === 'whoami' ? t('seatAsk') : t('seatGuess');
      const eyebrow = style === 'whoami' ? t('youAsk', { lang: langName(exLang) }) : t(style === 'taboo' ? 'explaining' : 'describing', { name: nm(ex), lang: langName(exLang) });
      st.innerHTML = `<div class="ready guess-screen" style="--team:${colorOf(team)}">
        <p class="eyebrow">${tag} ${esc(eyebrow)}</p>
        <h1 class="guess-big">${esc(big)}</h1>
        <div class="guess-count">✓ ${tr.log.filter((e) => e.result === 'correct').length}</div>
        ${tallyHtml(tr.log, false)}
      </div>`;
    }
  } else if (s.phase === 'paused') {
    st.innerHTML = `<div class="ready"><p class="eyebrow">${esc(t('paused'))}</p><h1 class="ready-team">${esc(t('cardHidden'))}</h1>
      <button class="btn primary huge" data-act="resume">${esc(t('resume'))} <kbd>P</kbd></button></div>`;
  } else if (s.phase === 'review' && tr) {
    const pts = scoreLog(tr.log, s.settings);
    const sumPts = pts.reduce((a, b) => a + b, 0);
    const rows = tr.log.map((e, i) => `<div class="rv-row">
        <span class="rv-word" lang="${e.card?.lang || 'en'}">${esc(e.card?.word || '')} <span class="level-tag small">${esc(SET_LABEL(e.card?.level) || '')}</span></span>
        <span class="rv-btns">${['correct', 'taboo', 'skip'].map((r) => `<button class="rv ${r} ${e.result === r ? 'on' : ''}" data-rv="${i}" data-r="${r}">${{ correct: '✓', taboo: '✕', skip: '↷' }[r]}</button>`).join('')}</span>
        <span class="rv-pts">${pts[i] > 0 ? '+' : ''}${pts[i]}</span>
      </div>`).join('');
    st.innerHTML = `<div class="review">
      <p class="eyebrow">${esc(tr.cardsLeft > 0 ? t('timesUp') : t('outOfCards'))}</p>
      <h2>${esc(s.players[tr.explainer]?.name || '?')}${s.settings.mode === 'teams' ? ` · ${esc(teamName(s, tr.team))}` : ''}: <span class="${sumPts < 0 ? 'neg' : ''}">${sumPts >= 0 ? '+' : ''}${sumPts}</span></h2>
      <p class="muted">${esc(t('fixNote'))}</p>
      <div class="rv-list">${rows || `<p class="muted">${esc(t('noCardsPlayed'))}</p>`}</div>
      <button class="btn primary huge" data-act="confirm">${esc(t('confirm'))} <kbd>Enter</kbd></button>
    </div>`;
  } else if (s.phase === 'over') {
    let body;
    if (s.settings.mode === 'coop') {
      const score = s.scores[0] || 0;
      body = `<p class="eyebrow">${esc(t('gameOver'))}</p>
        <p class="muted">${esc(t('coopScored'))}</p>
        <h1 class="ready-team coop-score">${score}</h1>
        <p class="muted">${score > 0 && score >= s.best ? `<b>${esc(t('newBest'))}</b> · ` : ''}${esc(t('best', { n: s.best }))}</p>`;
    } else {
      const ranked = s.scores.map((sc, i) => ({ sc, i })).sort((a, b) => b.sc - a.sc);
      const winners = ranked.filter((r) => r.sc === ranked[0].sc);
      body = `<p class="eyebrow">${esc(t('gameOver'))}</p>
        <h1 class="ready-team">${esc(winners.length > 1 ? t('tie') : t('wins', { name: teamName(s, winners[0].i) }))}</h1>
        <ol class="final">${ranked.map((r) => `<li style="--team:${TEAM_COLORS[r.i]}"><span>${esc(teamName(s, r.i))}</span><b>${r.sc}</b></li>`).join('')}</ol>`;
    }
    st.innerHTML = `<div class="ready">${body}<div class="row-btns"><button class="btn primary" data-act="lobby">${esc(t('toLobby'))}</button></div></div>`;
  }
  renderScores();
}

function renderScores() {
  const s = state;
  const n = teamCount(s);
  if (s.settings.mode === 'coop') {
    $('#scoreboard').innerHTML = `<div class="score cur" style="--team:#27c3c9">
      <span class="score-name">${esc(t('shared'))} · ${s.order.map((p) => nameOf(p)).join(', ')}</span>
      <span class="score-adj"><button data-adj="0" data-d="-1" aria-label="Minus one">−</button><b>${s.scores[0] || 0}</b><button data-adj="0" data-d="1" aria-label="Plus one">+</button></span>
    </div>`;
    return;
  }
  $('#scoreboard').innerHTML = Array.from({ length: n }, (_, i) => `<div class="score ${i === (s.turn ? s.turn.team : s.team) && s.phase !== 'over' ? 'cur' : ''}" style="--team:${TEAM_COLORS[i]}">
    <span class="score-name">${esc(teamName(s, i))} <span class="muted small-names">${members(s, i).map((p) => nameOf(p)).join(', ')}</span></span>
    <span class="score-adj"><button data-adj="${i}" data-d="-1" aria-label="Minus one">−</button><b>${s.scores[i] || 0}</b><button data-adj="${i}" data-d="1" aria-label="Plus one">+</button></span>
  </div>`).join('');
}

function beginTurn() {
  const pool = activeCards(deckSettings.sets);
  const byId = new Map(pool.map((c) => [c.id, c]));
  const cards = buildDeck(pool, seen).slice(0, CARDS_PER_TURN).map((id) => byId.get(id))
    .map((c) => ({ id: c.id, word: c.word, taboo: c.taboo, level: c.level, lang: cardLang(c) }));
  if (!cards.length) { const el = $('#turn-err'); if (el) el.textContent = t('errNoCards'); return; }
  send({ type: 'beginTurn', cards });
}

function act(a) {
  const tr = state.turn;
  if (a === 'begin') beginTurn();
  else if (['correct', 'taboo', 'skip'].includes(a) && tr) send({ type: 'mark', result: a, idx: tr.idx });
  else if (a === 'undo') send({ type: 'undo' });
  else if (a === 'resume') send({ type: 'resume' });
  else if (a === 'confirm') send({ type: 'confirm' });
  else if (a === 'pass') send({ type: 'passTurn' });
  else if (a === 'lobby') send({ type: 'lobby' });
}

$('#stage').addEventListener('click', (e) => {
  const rv = e.target.closest('[data-rv]');
  if (rv) { send({ type: 'fix', i: +rv.dataset.rv, result: rv.dataset.r }); return; }
  const a = e.target.closest('[data-act]')?.dataset.act;
  if (a) act(a);
});
$('#scoreboard').addEventListener('click', (e) => {
  const b = e.target.closest('[data-adj]'); if (b) send({ type: 'adjust', team: +b.dataset.adj, delta: +b.dataset.d });
});
$('#pause').onclick = () => send({ type: state.phase === 'paused' ? 'resume' : 'pause' });
$('#end-game').onclick = () => { if (confirm(ui === 'ko' ? '게임을 끝낼까요?' : 'End the game for everyone?')) send({ type: 'endGame' }); };

document.addEventListener('keydown', (e) => {
  if (!state || $('#play').hidden || cardManagerOpen()) return;
  if (e.target.matches('input, textarea, select') || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
  const k = shortcutKey(e);
  const ph = state.phase;
  const tr = state.turn;
  let a = null;
  if (ph === 'ready' && turnPeople().lead === pid && (k === ' ' || k === 'enter')) a = 'begin';
  else if (ph === 'playing' && tr?.card && canRun(state, pid, tr)) a = { ' ': 'correct', enter: 'correct', arrowright: 'correct', x: 'taboo', s: 'skip', z: 'undo' }[k];
  else if (ph === 'playing' && tr?.card && k === 'x') a = 'taboo';
  else if (ph === 'review' && k === 'enter') a = 'confirm';
  if (k === 'p' && (ph === 'playing' || ph === 'paused')) { e.preventDefault(); send({ type: ph === 'paused' ? 'resume' : 'pause' }); return; }
  if (a) { e.preventDefault(); act(a); }
});

/* ---------------- timer ---------------- */

function remaining() {
  const tr = state?.turn;
  if (!tr) return state ? state.settings.seconds * 1000 : 0;
  if (state.phase === 'playing') return Math.max(0, tr.endAt - serverNow());
  if (state.phase === 'paused') return tr.remaining;
  return 0;
}
let lastSec = null;
function tick() {
  if (!state || state.phase === 'lobby') return;
  const ms = remaining();
  const sec = Math.ceil(ms / 1000);
  const el = $('#timer');
  el.textContent = state.phase === 'over' ? '' : sec >= 60 ? `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}` : String(sec);
  el.classList.toggle('low', state.phase === 'playing' && sec <= 10);
  if (state.phase === 'playing') {
    if (sounds && sec <= 5 && sec > 0 && sec !== lastSec && state.turn && canRun(state, pid, state.turn)) sfx.tick();
    if (ms <= 0 && !timeUpSent) { timeUpSent = true; send({ type: 'timeUp' }); }
  }
  lastSec = sec;
}
setInterval(tick, 200);
setInterval(() => send({ type: 'ping' }), 25000);

/* ---------------- start ---------------- */

translateStatic();
const params = new URLSearchParams(location.search);
const urlRoom = (params.get('room') || '').toUpperCase();
let resumed = null;
try { resumed = JSON.parse(sessionStorage.getItem('online.room') || 'null'); } catch { /* ignore */ }
if (resumed && (!urlRoom || urlRoom === resumed.code) && profile.name) {
  enterRoom(resumed.code, resumed.pid);
} else {
  if (/^[A-Z]{4}$/.test(urlRoom)) $('#code-in').value = urlRoom;
  $('#my-name').value = profile.name;
  show('join'); renderJoin();
  ($('#my-name').value ? $('#code-in') : $('#my-name')).focus();
}
