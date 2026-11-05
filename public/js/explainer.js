import {
  SETS, SET_INFO, SET_LABEL, TEAM_COLORS, store, allCards, activeCards, wordKey, seenStore, buildDeck, unplayedCount, scoreTurn, sum,
  skipRuleText, remainingMs, fmtTime, shuffle, esc, publish, onMessage, sfx, shortcutKey,
} from './core.js';
import { setupTeams, ensureColors } from './teams.js';
import { setupDeckPicker, deckSummary } from './decks.js';
let renderDecks = () => {};
const seen = seenStore('taboo');
import { openCardManager, cardManagerOpen } from './cardmanager.js';

const $ = (s) => document.querySelector(s);
let settings = store.getSettings();
let game = store.getGame();

/* ---------------- setup ---------------- */

function saveSettings() { store.setSettings(settings); renderSetup(); }

function renderSetup() {
  renderDecks();
  const n = activeCards(settings.sets).length;
  const unseen = n ? unplayedCount(activeCards(settings.sets), seen) : 0;
  $('#deck-count').innerHTML = esc(deckSummary(settings.sets, n)) + (n && unseen < n
    ? ` <span class="seen-note">${unseen ? `${unseen} not played yet, so those come first.` : 'Every word has been played, so the next game starts a fresh round.'} <button type="button" class="link small" data-reset-seen>Start fresh</button></span>`
    : '');
  $('#start').disabled = n === 0;
  $('#setup-summary').textContent = n
    ? `${n} cards · ${settings.teams.length} teams · ${settings.seconds}s turns`
    : 'Pick at least one card set to start.';


  $('#timer-presets').innerHTML = [30, 45, 60, 90, 120].map((s) =>
    `<button data-sec="${s}" class="${settings.seconds === s ? 'on' : ''}">${s >= 60 ? `${s / 60} min` : `${s}s`}</button>`).join('');
  $('#seconds').value = settings.seconds;
  document.querySelectorAll('#skip-modes button').forEach((b) => b.classList.toggle('on', b.dataset.mode === settings.skipMode));
  $('#free-skips-wrap').hidden = settings.skipMode !== 'limited';
  $('#free-skips').value = settings.freeSkips;
  $('#taboo-penalty').checked = settings.tabooPenalty;
  $('#turns-per-team').value = settings.turnsPerTeam;
  $('#reveal-words').checked = settings.revealWords;
  $('#sounds').checked = settings.sounds;
  $('#resume-banner').hidden = !(game && game.phase !== 'over');
}

$('#timer-presets').addEventListener('click', (e) => {
  const b = e.target.closest('[data-sec]'); if (!b) return;
  settings.seconds = +b.dataset.sec; saveSettings();
});
const clampNum = (v, lo, hi, d) => { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
$('#seconds').addEventListener('change', (e) => { settings.seconds = clampNum(e.target.value, 5, 600, 60); saveSettings(); });
$('#skip-modes').addEventListener('click', (e) => {
  const b = e.target.closest('[data-mode]'); if (!b) return;
  settings.skipMode = b.dataset.mode; saveSettings();
});
$('#free-skips').addEventListener('change', (e) => { settings.freeSkips = clampNum(e.target.value, 0, 20, 1); saveSettings(); });
$('#taboo-penalty').onchange = (e) => { settings.tabooPenalty = e.target.checked; saveSettings(); };
$('#turns-per-team').addEventListener('change', (e) => { settings.turnsPerTeam = clampNum(e.target.value, 0, 50, 0); saveSettings(); });
$('#reveal-words').onchange = (e) => { settings.revealWords = e.target.checked; saveSettings(); };
$('#sounds').onchange = (e) => { settings.sounds = e.target.checked; saveSettings(); };

$('#deck-count').addEventListener('click', (e) => {
  if (e.target.closest('[data-reset-seen]')) { seen.clear(); renderSetup(); }
});

$('#start').onclick = () => {
  if (game && game.phase !== 'over' && !confirm('Start a new game? The current scores will be cleared.')) return;
  ensureColors(settings);
  const ids = buildDeck(activeCards(settings.sets), seen);
  if (!ids.length) return;
  game = {
    phase: 'ready',
    settings: { ...settings, teams: undefined },
    teams: settings.teams.map((name, i) => ({ name: name.trim() || `Team ${i + 1}`, score: 0, color: settings.colors[i], turns: 0 })),
    current: 0,
    deck: ids, pos: 0, card: null, log: [], used: [],
    endAt: 0, remaining: 0, flash: null, lastTurn: null,
  };
  publish(game);
  showPlay();
};
$('#resume').onclick = () => { if (game) { if (game.phase === 'playing') pause(); showPlay(); } };

/* ---------------- game ---------------- */

const byId = () => new Map(allCards().map((c) => [c.id, c]));
const play = (name) => { if (game?.settings.sounds) sfx[name](); };

function commit() { publish(game); render(); }

function showPlay() { document.activeElement?.blur?.(); $('#setup').hidden = true; $('#play').hidden = false; render(); }
function showSetup() { $('#play').hidden = true; $('#setup').hidden = false; renderSetup(); }

function drawCard() {
  const map = byId();
  const ex = store.getExcluded();
  game.used ||= [];
  for (let guard = 0; guard < 2; guard++) {
    while (game.pos < game.deck.length) {
      const c = map.get(game.deck[game.pos++]);
      if (!c || ex.has(c.id)) continue;
      const k = wordKey(c.word);
      if (game.used.includes(k)) continue; // never the same word twice in a round
      game.used.push(k);
      seen.add(k);
      game.card = { id: c.id, word: c.word, taboo: c.taboo, level: c.level };
      return;
    }
    // Every word has been played: start a new round, without repeating the card just shown.
    const curKey = game.card ? wordKey(game.card.word) : null;
    game.used = curKey ? [curKey] : [];
    game.deck = buildDeck(activeCards(game.settings.sets).filter((c) => wordKey(c.word) !== curKey), seen);
    game.pos = 0;
  }
  game.card = null;
}

function startTurn() {
  game.log = [];
  drawCard();
  if (!game.card) { alert('There are no cards left in the selected sets.'); return; }
  game.phase = 'playing';
  game.endAt = Date.now() + game.settings.seconds * 1000;
  game.flash = { type: 'start', at: Date.now() };
  play('start');
  commit();
}

function mark(result) {
  if (game.phase !== 'playing' || !game.card) return;
  game.log.push({ card: game.card, result });
  game.flash = { type: result, at: Date.now() };
  play(result);
  drawCard();
  commit();
}

function undo() {
  if (game.phase !== 'playing' || !game.log.length) return;
  const last = game.log.pop();
  if (game.card) {
    const k = wordKey(game.card.word);
    // Undo puts the card that was showing back on top of the deck so it comes straight back.
    // It still counts as played for future games, because it was shown.
    game.used = (game.used || []).filter((x) => x !== k);
    if (game.pos > 0 && game.deck[game.pos - 1] === game.card.id) game.pos -= 1; else game.deck.splice(game.pos, 0, game.card.id);
  }
  game.card = last.card;
  game.flash = { type: 'undo', at: Date.now() };
  commit();
}

function excludeCurrent() {
  if (game.phase !== 'playing' || !game.card) return;
  const ex = store.getExcluded(); ex.add(game.card.id); store.setExcluded(ex);
  drawCard();
  commit();
}

function pause() {
  if (game.phase === 'playing') { game.remaining = Math.max(0, game.endAt - Date.now()); game.phase = 'paused'; }
  else if (game.phase === 'paused') { game.endAt = Date.now() + game.remaining; game.phase = 'playing'; }
  commit();
}

function timeUp() {
  game.phase = 'review';
  game.card = null; // a word that was shown counts as played, even if time ran out
  game.flash = { type: 'timeup', at: Date.now() };
  play('timeUp');
  commit();
}

function confirmTurn() {
  const pts = sum(scoreTurn(game.log, game.settings));
  const team = game.teams[game.current];
  team.score += pts;
  team.turns += 1;
  game.lastTurn = { team: game.current, pts, log: game.log };
  game.log = [];
  game.current = (game.current + 1) % game.teams.length;
  const limit = game.settings.turnsPerTeam;
  game.phase = limit > 0 && game.teams.every((t) => t.turns >= limit) ? 'over' : 'ready';
  commit();
}

function endGame() {
  if (!confirm('End the game and show the final scores?')) return;
  if (game.phase === 'playing' || game.phase === 'paused' || game.phase === 'review') {
    if (game.log.length) { const keep = confirm('Count the points from the current turn?'); if (keep) { const pts = sum(scoreTurn(game.log, game.settings)); game.teams[game.current].score += pts; } }
  }
  game.phase = 'over'; game.card = null; game.log = [];
  commit();
}

/* ---------------- rendering ---------------- */

function render() {
  if (!game) return;
  const team = game.teams[game.current];
  $('#cur-team').innerHTML = `<span class="dot" style="background:${team.color}"></span>${esc(team.name)}`;
  $('#cur-team').style.setProperty('--team', team.color);
  $('#pause').hidden = !['playing', 'paused'].includes(game.phase);
  $('#pause').textContent = game.phase === 'paused' ? 'Resume' : 'Pause';
  $('#play').dataset.phase = game.phase;
  renderTimer();
  renderStage();
  renderScores();
}

function renderTimer() {
  const ms = remainingMs(game);
  const el = $('#timer');
  el.textContent = fmtTime(ms);
  el.classList.toggle('low', game.phase === 'playing' && ms <= 10000);
  el.style.setProperty('--p', game.settings.seconds ? ms / (game.settings.seconds * 1000) : 0);
}

function tallyHtml(log) {
  const pts = scoreTurn(log, game.settings);
  const c = (r) => log.filter((e) => e.result === r).length;
  const s = game.settings;
  let skipsLeft = '';
  if (s.skipMode === 'limited') skipsLeft = `<span class="t-note">${Math.max(0, s.freeSkips - c('skip'))} free skip${s.freeSkips - c('skip') === 1 ? '' : 's'} left</span>`;
  if (s.skipMode === 'free') skipsLeft = '<span class="t-note">Skips are free</span>';
  if (s.skipMode === 'penalty') skipsLeft = '<span class="t-note">Skips cost 1 point</span>';
  const total = sum(pts);
  return `<div class="tally">
    <span class="t correct">✓ ${c('correct')}</span>
    <span class="t taboo">✕ ${c('taboo')}</span>
    <span class="t skip">↷ ${c('skip')}</span>
    <span class="t pts">${total >= 0 ? '+' : ''}${total} this turn</span>
    ${skipsLeft}
  </div>`;
}

function renderStage() {
  const st = $('#stage');
  const team = game.teams[game.current];
  if (game.phase === 'ready') {
    const last = game.lastTurn ? `<p class="muted">Last turn: ${esc(game.teams[game.lastTurn.team].name)} ${game.lastTurn.pts >= 0 ? '+' : ''}${game.lastTurn.pts}</p>` : '';
    st.innerHTML = `<div class="ready" style="--team:${team.color}">
      <p class="eyebrow">Up next</p>
      <h1 class="ready-team">${esc(team.name)}</h1>
      <p class="muted">Hand the screen to the explainer. ${game.settings.seconds} seconds · ${esc(skipRuleText(game.settings))}${game.settings.tabooPenalty ? ' · Taboo −1' : ''}</p>
      ${last}
      <button class="btn primary huge" data-act="start">Start turn <kbd>Space</kbd></button>
    </div>`;
  } else if (game.phase === 'playing' && game.card) {
    const c = game.card;
    st.innerHTML = `<div class="card-wrap">
      <div class="card">
        <div class="card-top"><span class="level-tag">${SET_LABEL(c.level)}</span></div>
        <div class="target">${esc(c.word)}</div>
        <div class="taboo-label">Don't say</div>
        <ul class="taboo-list">${c.taboo.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
      </div>
      ${tallyHtml(game.log)}
      <div class="act">
        <button class="btn act-taboo" data-act="taboo">Taboo! <kbd>X</kbd></button>
        <button class="btn act-skip" data-act="skip">Skip <kbd>S</kbd></button>
        <button class="btn act-correct" data-act="correct">Correct <kbd>Space</kbd></button>
      </div>
      <div class="act-minor">
        <button class="link" data-act="undo" ${game.log.length ? '' : 'disabled'}>↶ Undo last <kbd>Z</kbd></button>
        <button class="link" data-act="exclude">Too hard — remove this card for good</button>
      </div>
    </div>`;
  } else if (game.phase === 'paused') {
    st.innerHTML = `<div class="ready"><p class="eyebrow">Paused</p><h1 class="ready-team">Card hidden</h1>
      <button class="btn primary huge" data-act="pause">Resume <kbd>P</kbd></button></div>`;
  } else if (game.phase === 'review') {
    const pts = scoreTurn(game.log, game.settings);
    const rows = game.log.map((e, i) => `<div class="rv-row">
        <span class="rv-word">${esc(e.card.word)} <span class="level-tag small">${SET_LABEL(e.card.level)}</span></span>
        <span class="rv-btns">
          ${['correct', 'taboo', 'skip'].map((r) => `<button class="rv ${r} ${e.result === r ? 'on' : ''}" data-rv="${i}" data-r="${r}">${{ correct: '✓', taboo: '✕', skip: '↷' }[r]}</button>`).join('')}
        </span>
        <span class="rv-pts">${pts[i] > 0 ? '+' : ''}${pts[i]}</span>
        <button class="link small" data-rx="${i}" title="Remove this card from future games">remove card</button>
      </div>`).join('');
    const total = sum(pts);
    st.innerHTML = `<div class="review">
      <p class="eyebrow">Time's up</p>
      <h2>${esc(team.name)}: <span class="${total < 0 ? 'neg' : ''}">${total >= 0 ? '+' : ''}${total}</span></h2>
      <p class="muted">Fix any mistakes before confirming — tap a symbol to change it.</p>
      <div class="rv-list">${rows || '<p class="muted">No cards played this turn.</p>'}</div>
      <button class="btn primary huge" data-act="confirm">Confirm &amp; next team <kbd>Enter</kbd></button>
    </div>`;
  } else if (game.phase === 'over') {
    const ranked = [...game.teams].sort((a, b) => b.score - a.score);
    const top = ranked[0].score;
    const winners = ranked.filter((t) => t.score === top);
    st.innerHTML = `<div class="ready">
      <p class="eyebrow">Game over</p>
      <h1 class="ready-team">${winners.length > 1 ? 'It\'s a tie!' : `${esc(winners[0].name)} wins!`}</h1>
      <ol class="final">${ranked.map((t) => `<li style="--team:${t.color}"><span>${esc(t.name)}</span><b>${t.score}</b></li>`).join('')}</ol>
      <div class="row-btns">
        <button class="btn ghost" data-act="continue">Keep playing</button>
        <button class="btn primary" data-act="setup">New game</button>
      </div>
    </div>`;
  }
}

function renderScores() {
  $('#scoreboard').innerHTML = game.teams.map((t, i) => `<div class="score ${i === game.current && game.phase !== 'over' ? 'cur' : ''}" style="--team:${t.color}">
    <span class="score-name">${esc(t.name)}</span>
    <span class="score-adj"><button data-adj="${i}" data-d="-1" aria-label="Minus one">−</button><b>${t.score}</b><button data-adj="${i}" data-d="1" aria-label="Plus one">+</button></span>
  </div>`).join('');
}

/* ---------------- events ---------------- */

$('#stage').addEventListener('click', (e) => {
  const a = e.target.closest('[data-act]')?.dataset.act;
  const rv = e.target.closest('[data-rv]');
  const rx = e.target.closest('[data-rx]');
  if (rv) { game.log[+rv.dataset.rv].result = rv.dataset.r; commit(); return; }
  if (rx) {
    const entry = game.log[+rx.dataset.rx];
    const ex = store.getExcluded(); ex.add(entry.card.id); store.setExcluded(ex);
    rx.textContent = 'removed'; rx.disabled = true; return;
  }
  if (!a) return;
  if (a === 'start') startTurn();
  else if (a === 'confirm') confirmTurn();
  else if (a === 'pause') pause();
  else if (a === 'undo') undo();
  else if (a === 'exclude') excludeCurrent();
  else if (a === 'setup') showSetup();
  else if (a === 'continue') { game.phase = 'ready'; commit(); }
  else mark(a);
});
$('#scoreboard').addEventListener('click', (e) => {
  const b = e.target.closest('[data-adj]'); if (!b) return;
  game.teams[+b.dataset.adj].score += +b.dataset.d; commit();
});
$('#pause').onclick = pause;
$('#end-game').onclick = endGame;

document.addEventListener('keydown', (e) => {
  if (!game || $('#play').hidden || e.target.matches('input, textarea, select') || cardManagerOpen()) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.repeat) return; // holding a key shouldn't score twice
  const k = shortcutKey(e);
  const p = game.phase;
  if (p === 'ready' && (k === ' ' || k === 'enter')) { e.preventDefault(); startTurn(); }
  else if (p === 'playing') {
    if (k === ' ' || k === 'enter' || k === 'arrowright') { e.preventDefault(); mark('correct'); }
    else if (k === 'x') mark('taboo');
    else if (k === 's') mark('skip');
    else if (k === 'z') undo();
    else if (k === 'p') pause();
  } else if (p === 'paused' && k === 'p') pause();
  else if (p === 'review' && k === 'enter') { e.preventDefault(); confirmTurn(); }
});

let lastSec = null;
setInterval(() => {
  if (!game || game.phase !== 'playing') return;
  const ms = game.endAt - Date.now();
  if (ms <= 0) { timeUp(); return; }
  const sec = Math.ceil(ms / 1000);
  if (sec !== lastSec) { lastSec = sec; if (sec <= 5) play('tick'); }
  if (!$('#play').hidden) renderTimer();
}, 200);

// Class view asks for the current state when it opens.
onMessage((m) => { if (m?.type === 'hello' && game) publish(game); });

let classWin = null;
function openClass() {
  if (classWin && !classWin.closed) { classWin.focus(); return; }
  classWin = window.open('class.html', 'taboo-class', 'popup,width=1280,height=760');
  if (!classWin) alert('Your browser blocked the pop-up. Allow pop-ups for this site, or open /class.html in a new window.');
}
$('#open-class').onclick = openClass;

/* ---------------- card manager ---------------- */

function openCards() {
  openCardManager({
    onAdd(level) {
      if (!settings.sets.includes(level)) { settings.sets = SETS.filter((x) => x === level || settings.sets.includes(x)); store.setSettings(settings); }
    },
    onClose() { renderSetup(); if (game && !$('#play').hidden) render(); },
  });
}
$('#manage-cards').onclick = openCards;
$('#manage-cards-top').onclick = openCards;

/* ---------------- boot ---------------- */
renderDecks = setupDeckPicker({ settings, save: saveSettings });
ensureColors(settings);
setupTeams({ settings, min: 2, save: saveSettings, persist: () => store.setSettings(settings) });
if (game?.phase === 'playing' && game.endAt <= Date.now()) timeUp();
renderSetup();
