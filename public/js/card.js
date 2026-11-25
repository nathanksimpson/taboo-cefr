// card.html?room=ABCD — the card screen: a monitor facing the student who explains.
// It follows an online room (the teacher runs the game from a phone or another computer)
// and shows only the current card, big. The timer, scores and results stay on the big screen (class.html).
import { remainingMs, fmtTime, esc, SET_LABEL, shortcutKey } from './core.js';
import { connect, cleanCode } from './online.js';

const room = cleanCode(new URLSearchParams(location.search).get('room') || '');
const el = document.getElementById('cs');
let game = null;
let error = room ? '' : 'Add the room code to the address, e.g. card.html?room=ABCD — or open display.html.';

const teamName = () => game.teams?.[game.current]?.name || '';
const isHS = () => game.kind === 'hotseat';

function cardHtml(c) {
  // Hot Seat shows the words to avoid only when the teacher turned that on; Taboo always shows them.
  const avoid = !isHS() || (game.settings?.showAvoid && game.settings.style !== 'charades');
  const list = avoid && c.taboo?.length
    ? `<div class="taboo-label">${isHS() ? 'Try not to say' : 'Don’t say'}</div><ul class="taboo-list">${c.taboo.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '';
  return `<div class="card cs-card"><div class="card-top"><span class="level-tag">${esc(c.label || SET_LABEL(c.level) || '')}</span></div>
    <div class="target">${esc(c.word)}</div>${list}</div>`;
}

function message(eyebrow, title, sub = '') {
  return `<div class="cs-msg"><p class="cv-eyebrow">${esc(eyebrow)}</p><h1 class="cv-team">${esc(title)}</h1>${sub ? `<p class="cv-sub">${esc(sub)}</p>` : ''}</div>`;
}

function render() {
  document.body.dataset.phase = game?.phase || 'waiting';
  if (!game || !game.teams) {
    el.innerHTML = message(`Card screen${room ? ` · room ${room}` : ''}`, error || 'Waiting for the game…', error ? '' : 'The cards appear here when a turn starts. Turn this screen to face the student who explains.');
    return;
  }
  const team = game.teams[game.current];
  if (team) document.body.style.setProperty('--team', team.color);
  const p = game.phase;
  const ch = isHS() && game.settings?.style === 'charades';
  const who = isHS() ? (game.seatName ? (ch ? `🎭 ${game.seatName} acts it out` : `🪑 ${game.seatName} is in the hot seat`) : '') : (game.explainerName ? `${game.explainerName} explains` : '');
  if (p === 'ready') el.innerHTML = message('Get ready', teamName(), who || 'The card appears here when the turn starts.');
  else if (p === 'paused') el.innerHTML = message('Paused', teamName(), 'The card comes back when the game resumes.');
  else if (p === 'playing') {
    el.innerHTML = `<div class="cs-bar"><span class="cs-team">${esc(teamName())}</span>${who ? `<span class="cs-who">${esc(who)}</span>` : ''}<span class="cs-timer" id="cs-timer"></span></div>
      ${game.card ? cardHtml(game.card) : '<p class="cv-sub">…</p>'}`;
  } else if (p === 'review') el.innerHTML = message('Time’s up!', teamName(), 'Check the big screen for this turn’s results.');
  else if (p === 'over') el.innerHTML = message('Game over', 'Thanks for playing!', 'The final scores are on the big screen.');
  else el.innerHTML = message('Card screen', 'Waiting…');
  tick();
}

function tick() {
  const t = document.getElementById('cs-timer');
  if (!t || !game) return;
  const ms = remainingMs(game);
  t.textContent = fmtTime(ms);
  t.classList.toggle('low', ms <= 10000);
}
setInterval(tick, 200);

if (room) {
  connect({
    code: room, role: 'screen', view: 'cards',
    on: {
      state: (g) => { game = g; render(); },
      error: (m) => { error = m.message; game = null; render(); },
    },
  });
}
render();

const fs = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.());
document.getElementById('fullscreen').onclick = fs;
document.addEventListener('keydown', (e) => { if (shortcutKey(e) === 'f') fs(); });
