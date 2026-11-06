// Taboo Online — each player on their own device, synced through a room on the server.
import {
  SET_LABEL, SET_LANG, TEAM_COLORS, activeCards, wordKey, seenStore, buildDeck, esc, sfx, shortcutKey,
} from './core.js';
import { setupDeckPicker, deckSummary } from './decks.js';
import { openCardManager, cardManagerOpen } from './cardmanager.js';
import {
  MAX_TEAMS, teamCount, teamName, members, explainerOf, turnLimit, scoreLog,
} from './online-engine.js';

const $ = (s) => document.querySelector(s);
const seen = seenStore('online');
const CARDS_PER_TURN = 60;

/* ---------------- words on screen (English / 한국어) ---------------- */

const T = {
  en: {
    title: 'Taboo Online', eyebrow: 'English · 한국어', sub: 'Play Taboo together, each on your own device.',
    yourName: 'Your name', explainIn: 'I explain in', explainInNote: "The language you're practising. Your cards come from decks in this language.",
    create: 'Create a room', join: 'Join', roomCode: 'Room code', cards: 'Cards', manageCards: 'Manage cards…',
    rejoin: 'Rejoin as {name}', newPlayer: 'Join as a new player', needName: 'Type your name first.', needCode: 'Type the 4-letter room code.',
    room: 'Room', copyLink: 'Copy invite link', copied: 'Link copied!', leave: 'Leave room',
    game: 'Game', coop: 'Co-op', teams: 'Teams',
    coopDesc: 'Everyone plays on one side. Take turns explaining in the language you\'re learning and chase your best score.',
    teamsDesc: 'Teams take turns. The other teams see the card and press Taboo! if a taboo word slips out.',
    teamCount: 'Teams', timer: 'Turn timer', skips: 'Skips', skipFree: 'Free', skipLimited: 'Some free, then −1', skipPenalty: 'Always −1',
    freePerTurn: 'free per turn', tabooWord: 'Taboo word said', tabooPen: 'Costs 1 point', rounds: 'Rounds',
    roundsCoop: 'Everyone explains once per round (0 = until you end it)', roundsTeams: 'Each team explains once per round (0 = until you end it)',
    players: 'Players', you: 'you', offline: 'offline', remove: 'Remove', myDecks: 'My cards',
    myDecksNote: "When it's your turn to explain, your cards come from these decks. Everyone picks their own.",
    langMismatch: "Heads up: none of these decks are in {lang}, the language you explain in.",
    sounds: 'Sound effects', start: 'Start game ▶', needTwo: 'Share the room code — you need at least 2 players.',
    emptyTeam: 'Every team needs at least one player.', noDecks: 'Pick at least one deck.',
    pause: 'Pause', resume: 'Resume', endGame: 'End game', coopChip: 'Co-op', round: 'Round {n}/{m}', roundOpen: 'Round {n}',
    yourTurn: 'Your turn to explain', explainInLang: 'Explain in {lang} · {sec} seconds', startTurn: 'Start turn',
    upNext: 'Up next', explains: '{name} explains', youGuess: 'You guess!', youWatch: 'You watch the card and press Taboo! if a taboo word slips out.',
    youWait: 'Waiting for {name} to start…', passTurn: '{name} is away — skip to the next player',
    lastTurn: 'Last turn: {name} {pts}', dontSay: "Don't say", correct: 'Correct', taboo: 'Taboo!', skip: 'Skip', undo: '↶ Undo last',
    guess: 'Guess!', explaining: '{name} is explaining in {lang}', buzzNote: 'Press if {name} says a word on the card.',
    paused: 'Paused', cardHidden: 'Card hidden', thisTurn: 'this turn', skipsLeft: '{n} free skips left', skipsFree: 'Skips are free', skipsCost: 'Skips cost 1 point',
    timesUp: "Time's up", outOfCards: 'Out of cards', fixNote: 'Anyone can fix a mistake — tap a symbol — then confirm.', confirm: 'Confirm & next ▶', noCardsPlayed: 'No cards played this turn.',
    gameOver: 'Game over', coopScored: 'Together you scored', best: 'Best in this room: {n}', newBest: 'New room best!',
    wins: '{name} wins!', tie: "It's a tie!", toLobby: 'Back to lobby', connecting: 'Connecting…', reconnecting: 'Reconnecting…',
    score: 'Score', errFull: 'That room is full.', errNoCards: 'Your decks have no cards — pick some in the lobby.', english: 'English', korean: 'Korean',
    langName: { en: 'English', ko: 'Korean' }, shared: 'Shared score',
  },
  ko: {
    title: '타부 온라인', eyebrow: 'English · 한국어', sub: '각자 자기 기기로 함께 하는 타부 게임',
    yourName: '내 이름', explainIn: '내가 설명할 언어', explainInNote: '연습하고 싶은 언어를 고르세요. 이 언어로 된 카드가 나와요.',
    create: '방 만들기', join: '입장', roomCode: '방 코드', cards: '카드', manageCards: '카드 관리…',
    rejoin: '{name}(으)로 다시 입장', newPlayer: '새 플레이어로 입장', needName: '먼저 이름을 입력하세요.', needCode: '4글자 방 코드를 입력하세요.',
    room: '방', copyLink: '초대 링크 복사', copied: '링크를 복사했어요!', leave: '방 나가기',
    game: '게임', coop: '협동', teams: '팀전',
    coopDesc: '모두 한 팀이에요. 배우는 언어로 돌아가며 설명하고 최고 점수에 도전하세요.',
    teamsDesc: '팀이 번갈아 가며 해요. 상대 팀은 카드를 보다가 금지어가 나오면 "금지어!"를 눌러요.',
    teamCount: '팀 수', timer: '제한 시간', skips: '패스', skipFree: '무료', skipLimited: '몇 번 무료, 그다음 −1', skipPenalty: '항상 −1',
    freePerTurn: '번 무료 (한 턴에)', tabooWord: '금지어를 말하면', tabooPen: '1점 감점', rounds: '라운드',
    roundsCoop: '한 라운드에 모두 한 번씩 설명해요 (0 = 직접 끝낼 때까지)', roundsTeams: '한 라운드에 팀마다 한 번씩 설명해요 (0 = 직접 끝낼 때까지)',
    players: '플레이어', you: '나', offline: '오프라인', remove: '내보내기', myDecks: '내 카드',
    myDecksNote: '내가 설명할 차례가 되면 이 덱에서 카드가 나와요. 각자 따로 골라요.',
    langMismatch: '참고: 고른 덱 중에 {lang} 덱이 없어요.',
    sounds: '효과음', start: '게임 시작 ▶', needTwo: '방 코드를 공유하세요. 2명 이상 필요해요.',
    emptyTeam: '팀마다 한 명 이상 있어야 해요.', noDecks: '덱을 하나 이상 고르세요.',
    pause: '멈춤', resume: '계속하기', endGame: '끝내기', coopChip: '협동', round: '라운드 {n}/{m}', roundOpen: '라운드 {n}',
    yourTurn: '내가 설명할 차례예요', explainInLang: '{lang}로 설명하세요 · {sec}초', startTurn: '턴 시작',
    upNext: '다음 차례', explains: '{name} 님이 설명해요', youGuess: '내가 맞힐 차례예요!', youWatch: '카드를 보다가 금지어가 나오면 "금지어!"를 누르세요.',
    youWait: '{name} 님이 시작하기를 기다리는 중…', passTurn: '{name} 님이 자리에 없어요 — 다음 사람으로 넘기기',
    lastTurn: '지난 턴: {name} {pts}', dontSay: '금지어', correct: '정답', taboo: '금지어!', skip: '패스', undo: '↶ 되돌리기',
    guess: '맞혀 보세요!', explaining: '{name} 님이 {lang}로 설명하는 중', buzzNote: '{name} 님이 카드에 있는 말을 하면 누르세요.',
    paused: '일시 정지', cardHidden: '카드 숨김', thisTurn: '이번 턴', skipsLeft: '무료 패스 {n}번 남음', skipsFree: '패스는 무료', skipsCost: '패스하면 1점 감점',
    timesUp: '시간 끝!', outOfCards: '카드를 다 썼어요', fixNote: '누구든 기호를 눌러 고칠 수 있어요. 확인을 누르면 점수가 더해져요.', confirm: '확인하고 다음 ▶', noCardsPlayed: '이번 턴에는 카드가 없었어요.',
    gameOver: '게임 끝', coopScored: '우리 팀 점수', best: '이 방 최고 기록: {n}', newBest: '새 최고 기록!',
    wins: '{name} 승리!', tie: '동점이에요!', toLobby: '대기실로', connecting: '연결 중…', reconnecting: '다시 연결 중…',
    score: '점수', errFull: '방이 꽉 찼어요.', errNoCards: '고른 덱에 카드가 없어요. 대기실에서 덱을 고르세요.', english: '영어', korean: '한국어',
    langName: { en: '영어', ko: '한국어' }, shared: '함께 모은 점수',
  },
};

const load = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage off */ } };

let ui = load('online.ui.v1', (navigator.language || '').startsWith('ko') ? 'ko' : 'en');
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
let ws = null;
let state = null;
let online = new Set();
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
      setConn('');
      onState(msg.state);
    } else if (msg.type === 'error') {
      if (msg.error === 'full') { $('#join-err').textContent = t('errFull'); leaveRoom(); }
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
  document.title = t('title');
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
$('#code-in').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, ''); renderJoin(); });
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

$('#uilang').addEventListener('click', (e) => {
  const b = e.target.closest('[data-ui]'); if (!b) return;
  ui = b.dataset.ui; save('online.ui.v1', ui);
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

  // players
  $('#players').innerHTML = state.order.map((p) => {
    const pl = state.players[p];
    const mine = p === pid;
    const on = online.has(p);
    const teamSel = s.mode === 'teams'
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
  else if (!mine.length) note = t('noDecks');
  $('#start-note').textContent = note;
  $('#start').disabled = !!note;
}

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
$('#copy-link').onclick = async () => {
  const link = `${location.origin}${location.pathname}?room=${state.code}`;
  try { await navigator.clipboard.writeText(link); } catch { prompt('Invite link', link); return; }
  $('#copy-link').textContent = t('copied');
  setTimeout(() => { $('#copy-link').textContent = t('copyLink'); }, 1500);
};
const cardHooks = { onAdd: () => {}, onClose: () => { if (state?.phase === 'lobby') renderLobby(); } };
$('#manage-cards').onclick = () => openCardManager(cardHooks);
$('#manage-cards-top').onclick = () => openCardManager(cardHooks);

/* ---------------- game ---------------- */

const nameOf = (p) => esc(state.players[p]?.name || '?');
const colorOf = (team) => (state.settings.mode === 'coop' ? '#27c3c9' : TEAM_COLORS[team]);
const myRole = () => {
  const tr = state.turn;
  const ex = tr ? tr.explainer : explainerOf(state);
  if (ex === pid) return 'explainer';
  const team = tr ? tr.team : state.team;
  if (state.settings.mode === 'teams' && state.players[pid]?.team !== team) return 'opponent';
  return 'guesser';
};

let prev = { phase: null, logLen: 0 };
let timeUpSent = false;

function onState(s) {
  const was = prev;
  state = s;
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
  return `<div class="card" lang="${c.lang}">
    <div class="card-top"><span class="level-tag">${esc(SET_LABEL(c.level) || c.level)}</span></div>
    <div class="target">${esc(c.word)}</div>
    <div class="taboo-label">${esc(t('dontSay'))}</div>
    <ul class="taboo-list">${c.taboo.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
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
    : `<span class="dot" style="background:${colorOf(team)}"></span>${esc(s.settings.mode === 'coop' ? t('coopChip') : teamName(s, team))} · ${esc(roundText())}`;
  $('#play').style.setProperty('--team', colorOf(team));
  $('#pause').hidden = !(s.phase === 'playing' || s.phase === 'paused');
  $('#pause').textContent = s.phase === 'paused' ? t('resume') : t('pause');
  $('#end-game').hidden = s.phase === 'over';
  tick();

  const st = $('#stage');
  if (s.phase === 'ready') {
    const last = s.lastTurn
      ? `<p class="muted">${esc(t('lastTurn', { name: s.players[s.lastTurn.explainer]?.name || '?', pts: `${s.lastTurn.pts >= 0 ? '+' : ''}${s.lastTurn.pts}` }))}</p>` : '';
    if (role === 'explainer') {
      st.innerHTML = `<div class="ready" style="--team:${colorOf(team)}">
        <p class="eyebrow">${esc(t('upNext'))}</p>
        <h1 class="ready-team">${esc(t('yourTurn'))}</h1>
        <p class="muted"><span class="lang-tag ${exLang}">${esc(langName(exLang))}</span> ${esc(t('explainInLang', { lang: langName(exLang), sec: s.settings.seconds }))}</p>
        ${last}
        <button class="btn primary huge" data-act="begin">${esc(t('startTurn'))} <kbd>Space</kbd></button>
        <p class="hint" id="turn-err"></p>
      </div>`;
    } else {
      const away = ex && !online.has(ex);
      st.innerHTML = `<div class="ready" style="--team:${colorOf(team)}">
        <p class="eyebrow">${esc(t('upNext'))}</p>
        <h1 class="ready-team">${esc(t('explains', { name: s.players[ex]?.name || '?' }))}</h1>
        <p class="muted"><span class="lang-tag ${exLang}">${esc(langName(exLang))}</span> ${esc(role === 'guesser' ? t('youGuess') : t('youWatch'))}</p>
        ${last}
        <p class="muted">${esc(t('youWait', { name: s.players[ex]?.name || '?' }))}</p>
        ${away ? `<button class="link" data-act="pass">${esc(t('passTurn', { name: s.players[ex]?.name || '?' }))}</button>` : ''}
      </div>`;
    }
  } else if (s.phase === 'playing' && tr) {
    if (role === 'explainer' && tr.card) {
      st.innerHTML = `<div class="card-wrap">${cardHtml(tr.card)}${tallyHtml(tr.log, true)}
        <div class="act">
          <button class="btn act-taboo" data-act="taboo">${esc(t('taboo'))} <kbd>X</kbd></button>
          <button class="btn act-skip" data-act="skip">${esc(t('skip'))} <kbd>S</kbd></button>
          <button class="btn act-correct" data-act="correct">${esc(t('correct'))} <kbd>Space</kbd></button>
        </div>
        <div class="act-minor"><button class="link" data-act="undo" ${tr.log.length ? '' : 'disabled'}>${esc(t('undo'))} <kbd>Z</kbd></button></div>
      </div>`;
    } else if (role === 'opponent' && tr.card) {
      st.innerHTML = `<div class="card-wrap">${cardHtml(tr.card)}${tallyHtml(tr.log, false)}
        <div class="act act-single"><button class="btn act-taboo buzz" data-act="taboo">${esc(t('taboo'))} <kbd>X</kbd></button></div>
        <p class="hint center">${esc(t('buzzNote', { name: s.players[ex]?.name || '?' }))}</p>
      </div>`;
    } else {
      st.innerHTML = `<div class="ready guess-screen" style="--team:${colorOf(team)}">
        <p class="eyebrow"><span class="lang-tag ${exLang}">${esc(langName(exLang))}</span> ${esc(t('explaining', { name: s.players[ex]?.name || '?', lang: langName(exLang) }))}</p>
        <h1 class="guess-big">${esc(t('guess'))}</h1>
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
    .map((c) => ({ id: c.id, word: c.word, taboo: c.taboo, level: c.level, lang: c.lang || SET_LANG(c.level) }));
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
  const role = myRole();
  const ph = state.phase;
  let a = null;
  if (ph === 'ready' && role === 'explainer' && (k === ' ' || k === 'enter')) a = 'begin';
  else if (ph === 'playing' && role === 'explainer') a = { ' ': 'correct', enter: 'correct', arrowright: 'correct', x: 'taboo', s: 'skip', z: 'undo' }[k];
  else if (ph === 'playing' && role === 'opponent' && k === 'x') a = 'taboo';
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
    if (sounds && sec <= 5 && sec > 0 && sec !== lastSec && myRole() === 'explainer') sfx.tick();
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
