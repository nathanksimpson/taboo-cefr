import { store, onMessage, send, scoreTurn, sum, remainingMs, fmtTime, esc, skipRuleText, shortcutKey } from './core.js';
import { connect, loadJSON, ROOM_KEY, cleanCode, joinCardHtml } from './online.js';

// class.html?room=ABCD — a big screen on another device, following an online room.
const room = cleanCode(new URLSearchParams(location.search).get('room') || '');
let roomError = '';

const cv = document.getElementById('cv');
const flashEl = document.getElementById('flash');
let game = room ? null : store.getGame();
let lastFlash = game?.flash?.at || 0;

function scoreboard() {
  const max = Math.max(1, ...game.teams.map((t) => t.score));
  return `<div class="cv-scores">${game.teams.map((t, i) => `<div class="cv-score ${i === game.current && game.phase !== 'over' ? 'cur' : ''}" style="--team:${t.color}">
    <div class="cv-score-bar" style="--h:${Math.max(0, t.score) / max}"></div>
    <span class="cv-score-name">${esc(t.name)}</span><b>${t.score}</b></div>`).join('')}</div>`;
}

function joinBanner(compact = true) {
  const code = room || game?.online?.code || (!game ? loadJSON(ROOM_KEY, null)?.code : null);
  if (!code || roomError) return '';
  return joinCardHtml(code, { compact });
}

function render() {
  document.body.dataset.phase = game?.phase || 'waiting';
  if (!game || !game.teams) {
    cv.innerHTML = `<div class="cv-center"><div class="cv-logo">Taboo</div><p class="cv-sub">${roomError ? esc(roomError) : 'Waiting for the teacher to start the game…'}</p>${joinBanner(false)}</div>`;
    return;
  }
  const team = game.teams[game.current];
  document.body.style.setProperty('--team', team.color);
  const p = game.phase;
  let main = '';
  if (p === 'ready') {
    const last = game.lastTurn ? `<p class="cv-sub">${esc(game.teams[game.lastTurn.team].name)} scored ${game.lastTurn.pts >= 0 ? '+' : ''}${game.lastTurn.pts} last turn</p>` : '';
    main = `<div class="cv-center"><p class="cv-eyebrow">Get ready</p><h1 class="cv-team">${esc(team.name)}</h1>
      <p class="cv-sub">${game.settings.seconds} seconds · ${esc(skipRuleText(game.settings))}${game.settings.tabooPenalty ? ' · Taboo word = −1' : ''}</p>${last}
      ${game.explainerName ? `<p class="cv-sub">📱 ${esc(game.explainerName)} explains</p>` : ''}${joinBanner()}</div>`;
  } else if (p === 'playing' || p === 'paused') {
    const log = game.log;
    const c = (r) => log.filter((e) => e.result === r).length;
    const pts = sum(scoreTurn(log, game.settings));
    main = `<div class="cv-play">
      <p class="cv-eyebrow">${esc(team.name)} is guessing</p>
      <div class="cv-timer-wrap"><svg class="cv-ring" viewBox="0 0 100 100"><circle cx="50" cy="50" r="45" class="ring-bg"/><circle cx="50" cy="50" r="45" class="ring-fg" id="ring" pathLength="100"/></svg>
        <div class="cv-timer" id="cv-timer"></div></div>
      ${p === 'paused' ? '<p class="cv-paused">Paused</p>' : ''}
      <div class="cv-tally"><span class="t correct">✓ ${c('correct')}</span><span class="t taboo">✕ ${c('taboo')}</span><span class="t skip">↷ ${c('skip')}</span><span class="t pts">${pts >= 0 ? '+' : ''}${pts}</span></div>
    </div>`;
  } else if (p === 'review') {
    const pts = scoreTurn(game.log, game.settings);
    const total = sum(pts);
    const words = game.settings.revealWords && game.log.length
      ? `<div class="cv-words">${game.log.map((e) => `<span class="cv-word ${e.result}">${esc(e.card.word)}</span>`).join('')}</div>` : '';
    main = `<div class="cv-center"><p class="cv-eyebrow">Time's up!</p><h1 class="cv-team">${esc(team.name)}</h1><p class="cv-turn-pts">${total >= 0 ? '+' : '−'}${Math.abs(total)} point${Math.abs(total) === 1 ? '' : 's'}</p>${words}</div>`;
  } else if (p === 'over') {
    const ranked = [...game.teams].sort((a, b) => b.score - a.score);
    const winners = ranked.filter((t) => t.score === ranked[0].score);
    document.body.style.setProperty('--team', winners[0].color);
    main = `<div class="cv-center"><p class="cv-eyebrow">Game over</p>
      <h1 class="cv-team">${winners.length > 1 ? 'It’s a tie!' : `${esc(winners[0].name)} wins!`}</h1>
      <ol class="final big">${ranked.map((t) => `<li style="--team:${t.color}"><span>${esc(t.name)}</span><b>${t.score}</b></li>`).join('')}</ol>${joinBanner()}</div>`;
  }
  cv.innerHTML = main + (p === 'over' ? '' : scoreboard());
  tick();
}

const FLASH = { correct: ['Correct!', 'correct'], taboo: ['TABOO!', 'taboo'], skip: ['Skip', 'skip'], timeup: ['Time’s up!', 'timeup'], start: ['Go!', 'start'] };
function maybeFlash() {
  const f = game?.flash;
  if (!f || f.at <= lastFlash) return;
  lastFlash = f.at;
  if (Date.now() - f.at > 2000 || !FLASH[f.type]) return;
  const [text, cls] = FLASH[f.type];
  flashEl.innerHTML = esc(text) + (f.type === 'taboo' && f.by ? `<small>called by ${esc(f.by)}</small>` : '');
  flashEl.className = `flash show ${cls}`;
  clearTimeout(maybeFlash.t);
  maybeFlash.t = setTimeout(() => { flashEl.className = 'flash'; }, f.type === 'timeup' ? 1600 : 800);
}

function tick() {
  const el = document.getElementById('cv-timer');
  if (!el || !game) return;
  const ms = remainingMs(game);
  el.textContent = fmtTime(ms);
  el.classList.toggle('low', ms <= 10000);
  const ring = document.getElementById('ring');
  if (ring) ring.style.strokeDashoffset = String(100 - (ms / (game.settings.seconds * 1000)) * 100);
}
setInterval(tick, 200);

if (room) {
  connect({
    code: room, role: 'screen',
    on: {
      state: (g) => {
        // The teacher switched this room to Hot Seat: follow it.
        if (g?.kind === 'hotseat') { location.replace(`hotseat-class.html?room=${room}`); return; }
        game = g; render(); maybeFlash();
      },
      error: (m) => { roomError = m.message; game = null; render(); },
    },
  });
} else {
  onMessage((m) => {
    if (m?.type !== 'state') return;
    game = m.game;
    render();
    maybeFlash();
  });
  send({ type: 'hello' });
}
render();

const fs = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.());
document.getElementById('fullscreen').onclick = fs;
document.addEventListener('keydown', (e) => { if (shortcutKey(e) === 'f') fs(); });
