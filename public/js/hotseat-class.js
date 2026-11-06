import { SET_LABEL, remainingMs, fmtTime, esc, shortcutKey } from './core.js';
import { sync, STYLE, turnTotal, passRuleText } from './hotseat-shared.js';

const cv = document.getElementById('cv');
const flashEl = document.getElementById('flash');
const bar = document.querySelector('#hs-bar div');
let game = sync.load();
let lastFlash = game?.flash?.at || 0;

function scoreboard() {
  const max = Math.max(1, ...game.teams.map((t) => t.score));
  return `<div class="cv-scores">${game.teams.map((t, i) => `<div class="cv-score ${i === game.current && game.phase !== 'over' ? 'cur' : ''}" style="--team:${t.color}">
    <div class="cv-score-bar" style="--h:${Math.max(0, t.score) / max}"></div>
    <span class="cv-score-name">${esc(t.name)}</span><b>${t.score}</b></div>`).join('')}</div>`;
}

function render() {
  document.body.dataset.phase = game?.phase || 'waiting';
  if (!game || !game.teams) {
    cv.innerHTML = `<div class="cv-center"><div class="cv-logo hs">Hot Seat</div><p class="cv-sub">Waiting for the teacher to start the game…</p></div>`;
    return;
  }
  const team = game.teams[game.current];
  const s = game.settings;
  const style = STYLE[s.style];
  document.body.style.setProperty('--team', team.color);
  const p = game.phase;
  let main = '';
  if (p === 'ready') {
    const last = game.lastTurn ? `<p class="cv-sub">${esc(game.teams[game.lastTurn.team].name)} scored ${game.lastTurn.pts >= 0 ? '+' : ''}${game.lastTurn.pts} last turn</p>` : '';
    main = `<div class="cv-center"><p class="cv-eyebrow">${esc(style.name)} · get ready</p><h1 class="cv-team">${esc(team.name)}</h1>
      <p class="cv-seat">🪑 ${esc(style.seat)}</p>
      <p class="cv-sub">${esc(style.rule)}<br>${s.seconds} seconds · ${esc(passRuleText(s))}${s.foulPenalty ? ' · Rule broken = −1' : ''}</p>${last}</div>`;
  } else if (p === 'playing' && game.card) {
    const c = game.card;
    const n = game.log.filter((e) => e.result === 'correct').length;
    main = `<div class="cv-hs">
      <div class="cv-hs-top"><span class="cv-hs-team">${esc(team.name)}</span><span class="cv-hs-timer" id="cv-timer"></span><span class="cv-hs-got">✓ ${n}</span></div>
      <div class="cv-hs-word-wrap"><span class="level-tag">${SET_LABEL(c.level)}</span><div class="cv-hs-word" id="cv-word">${esc(c.word)}</div>
        ${s.showAvoid ? `<div class="cv-hs-avoid"><span>Don’t say</span>${c.taboo.map((t) => `<b>${esc(t)}</b>`).join('')}</div>` : ''}</div>
      <p class="cv-hs-rule">${esc(style.rule)}</p>
    </div>`;
  } else if (p === 'paused') {
    main = `<div class="cv-center"><p class="cv-eyebrow">${esc(team.name)}</p><h1 class="cv-team">Paused</h1><p class="cv-sub" id="cv-timer"></p></div>`;
  } else if (p === 'review') {
    const total = turnTotal(game.log, s);
    const words = s.revealWords && game.log.length
      ? `<div class="cv-words">${game.log.map((e) => `<span class="cv-word ${{ correct: 'correct', pass: 'skip', foul: 'taboo' }[e.result]}">${esc(e.card.word)}</span>`).join('')}</div>` : '';
    main = `<div class="cv-center"><p class="cv-eyebrow">Time's up! Hot seat, turn around</p><h1 class="cv-team">${esc(team.name)}</h1>
      <p class="cv-turn-pts">${total >= 0 ? '+' : '−'}${Math.abs(total)} point${Math.abs(total) === 1 ? '' : 's'}</p>${words}</div>`;
  } else if (p === 'over') {
    const ranked = [...game.teams].sort((a, b) => b.score - a.score);
    const winners = ranked.filter((t) => t.score === ranked[0].score);
    document.body.style.setProperty('--team', winners[0].color);
    const title = game.teams.length === 1 ? `${ranked[0].score} point${ranked[0].score === 1 ? '' : 's'}!` : winners.length > 1 ? 'It’s a tie!' : `${esc(winners[0].name)} wins!`;
    main = `<div class="cv-center"><p class="cv-eyebrow">Game over</p><h1 class="cv-team">${title}</h1>
      <ol class="final big">${ranked.map((t) => `<li style="--team:${t.color}"><span>${esc(t.name)}</span><b>${t.score}</b></li>`).join('')}</ol></div>`;
  }
  cv.innerHTML = main + (p === 'over' ? '' : scoreboard());
  fitWord();
  tick();
}

// Shrink long words/phrases so they always fit on one or two lines.
function fitWord() {
  const el = document.getElementById('cv-word');
  if (!el) return;
  el.style.fontSize = '';
  let size = parseFloat(getComputedStyle(el).fontSize);
  const maxW = el.parentElement.clientWidth * 0.94;
  while (el.scrollWidth > maxW && size > 24) { size *= 0.92; el.style.fontSize = `${size}px`; }
}
window.addEventListener('resize', fitWord);

const FLASH = { correct: ['Correct!', 'correct'], foul: ['Rule broken!', 'taboo'], pass: ['Pass', 'skip'], timeup: ['Time’s up!', 'timeup'], start: ['Go!', 'start'] };
function maybeFlash() {
  const f = game?.flash;
  if (!f || f.at <= lastFlash) return;
  lastFlash = f.at;
  if (Date.now() - f.at > 2000 || !FLASH[f.type]) return;
  const [text, cls] = FLASH[f.type];
  flashEl.textContent = text;
  flashEl.className = `flash show ${cls}`;
  clearTimeout(maybeFlash.t);
  maybeFlash.t = setTimeout(() => { flashEl.className = 'flash'; }, f.type === 'timeup' ? 1600 : 800);
}

function tick() {
  const playing = game && ['playing', 'paused'].includes(game.phase);
  const ms = playing ? remainingMs(game) : 0;
  bar.parentElement.hidden = !playing;
  if (playing) bar.style.transform = `scaleX(${ms / (game.settings.seconds * 1000)})`;
  const el = document.getElementById('cv-timer');
  if (!el || !game) return;
  el.textContent = fmtTime(ms);
  el.classList.toggle('low', ms <= 10000 && game.phase === 'playing');
}
setInterval(tick, 200);

sync.onMessage((m) => {
  if (m?.type !== 'state') return;
  game = m.game;
  render();
  maybeFlash();
});
sync.send({ type: 'hello' });
render();

const fs = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.());
document.getElementById('fullscreen').onclick = fs;
document.addEventListener('keydown', (e) => { if (shortcutKey(e) === 'f') fs(); });
