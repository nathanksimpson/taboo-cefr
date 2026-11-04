import {
  SETS, SET_INFO, SET_LABEL, TEAM_COLORS, store, allCards, activeCards, scoreTurn, sum,
  skipRuleText, remainingMs, fmtTime, shuffle, esc, publish, onMessage, sfx,
} from './core.js';

const $ = (s) => document.querySelector(s);
let settings = store.getSettings();
let game = store.getGame();

/* ---------------- setup ---------------- */

function saveSettings() { store.setSettings(settings); renderSetup(); }

function renderSetup() {
  const ex = store.getExcluded();
  const cards = allCards();
  $('#set-grid').innerHTML = SETS.map((s) => {
    const inSet = cards.filter((c) => c.level === s);
    const active = inSet.filter((c) => !ex.has(c.id)).length;
    const on = settings.sets.includes(s);
    return `<button class="set-tile ${on ? 'on' : ''}" data-set="${s}" aria-pressed="${on}">
      <span class="set-code">${SET_LABEL(s)}</span>
      <span class="set-name">${s === 'MY' ? 'Cards you added' : SET_INFO[s]}</span>
      <span class="set-count">${active}${active !== inSet.length ? ` / ${inSet.length}` : ''} card${inSet.length === 1 ? '' : 's'}</span>
    </button>`;
  }).join('');
  const n = activeCards(settings.sets).length;
  $('#deck-count').textContent = settings.sets.length
    ? `${n} cards in play from ${settings.sets.map(SET_LABEL).join(', ')}.`
    : 'Pick at least one set.';
  $('#start').disabled = n === 0;
  $('#setup-summary').textContent = n
    ? `${n} cards · ${settings.teams.length} teams · ${settings.seconds}s turns`
    : 'Pick at least one card set to start.';

  $('#team-count').textContent = settings.teams.length;
  const names = $('#team-names');
  if (names.children.length !== settings.teams.length) {
    names.innerHTML = settings.teams.map((t, i) => `<label class="team-name" style="--team:${TEAM_COLORS[i]}">
      <span class="dot"></span><input data-team="${i}" value="${esc(t)}" maxlength="24"></label>`).join('');
  }

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

$('#set-grid').addEventListener('click', (e) => {
  const t = e.target.closest('[data-set]'); if (!t) return;
  const s = t.dataset.set;
  settings.sets = settings.sets.includes(s) ? settings.sets.filter((x) => x !== s) : SETS.filter((x) => x === s || settings.sets.includes(x));
  saveSettings();
});
$('#team-minus').onclick = () => { if (settings.teams.length > 2) { settings.teams.pop(); saveSettings(); } };
$('#team-plus').onclick = () => { if (settings.teams.length < 6) { settings.teams.push(`Team ${settings.teams.length + 1}`); saveSettings(); } };
$('#team-names').addEventListener('input', (e) => {
  const i = e.target.dataset.team; if (i == null) return;
  settings.teams[i] = e.target.value; store.setSettings(settings);
});
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

$('#start').onclick = () => {
  if (game && game.phase !== 'over' && !confirm('Start a new game? The current scores will be cleared.')) return;
  const ids = shuffle(activeCards(settings.sets).map((c) => c.id));
  if (!ids.length) return;
  game = {
    phase: 'ready',
    settings: { ...settings, teams: undefined },
    teams: settings.teams.map((name, i) => ({ name: name.trim() || `Team ${i + 1}`, score: 0, color: TEAM_COLORS[i], turns: 0 })),
    current: 0,
    deck: ids, pos: 0, card: null, log: [],
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

function showPlay() { $('#setup').hidden = true; $('#play').hidden = false; render(); }
function showSetup() { $('#play').hidden = true; $('#setup').hidden = false; renderSetup(); }

function drawCard() {
  const map = byId();
  const ex = store.getExcluded();
  for (let guard = 0; guard < 2; guard++) {
    while (game.pos < game.deck.length) {
      const c = map.get(game.deck[game.pos++]);
      if (c && !ex.has(c.id)) { game.card = { id: c.id, word: c.word, taboo: c.taboo, level: c.level }; return; }
    }
    // Deck used up: reshuffle everything still in play.
    const cur = game.card?.id;
    game.deck = shuffle(activeCards(game.settings.sets).map((c) => c.id).filter((id) => id !== cur));
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
  if (game.pos > 0) game.pos -= 1; else game.deck.unshift(game.card.id);
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
  game.card = null;
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
  if (!game || $('#play').hidden || e.target.matches('input, textarea, select') || $('#cards-dlg').open) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key.toLowerCase();
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

let cmSet = 'A1';
const dlg = $('#cards-dlg');
function openCards() { renderCm(); dlg.showModal(); }
$('#manage-cards').onclick = openCards;
$('#manage-cards-top').onclick = openCards;
$('#cards-close').onclick = () => dlg.close();
dlg.addEventListener('close', () => { renderSetup(); if (game && !$('#play').hidden) render(); });

$('#add-level').innerHTML = SETS.map((s) => `<option value="${s}">${s === 'MY' ? 'My cards' : `${s} — ${SET_INFO[s]}`}</option>`).join('');

function renderCm() {
  const ex = store.getExcluded();
  const cards = allCards();
  $('#cm-tabs').innerHTML = SETS.map((s) => {
    const n = cards.filter((c) => c.level === s).length;
    return `<button class="${s === cmSet ? 'on' : ''}" data-tab="${s}">${SET_LABEL(s)} <span>${n}</span></button>`;
  }).join('');
  $('#add-level').value = cmSet;
  const q = $('#cm-search').value.trim().toLowerCase();
  const list = cards.filter((c) => c.level === cmSet)
    .filter((c) => !q || c.word.toLowerCase().includes(q) || c.taboo.some((t) => t.toLowerCase().includes(q)))
    .sort((a, b) => a.word.localeCompare(b.word));
  const inSet = cards.filter((c) => c.level === cmSet);
  $('#cm-count').textContent = `${inSet.filter((c) => !ex.has(c.id)).length} of ${inSet.length} included`;
  $('#cm-list').innerHTML = list.map((c) => `<div class="cm-row ${ex.has(c.id) ? 'off' : ''}">
      <label><input type="checkbox" data-cid="${esc(c.id)}" ${ex.has(c.id) ? '' : 'checked'}>
        <b>${esc(c.word)}</b>${c.custom ? '<span class="badge">added</span>' : ''}
        <span class="cm-taboo">${c.taboo.map(esc).join(' · ')}</span></label>
      ${c.custom ? `<button class="link small" data-del="${esc(c.id)}">Delete</button>` : ''}
    </div>`).join('') || `<p class="muted pad">${cmSet === 'MY' && !q ? 'No cards yet — add your own above.' : 'Nothing matches.'}</p>`;
}

$('#cm-tabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]'); if (!b) return;
  cmSet = b.dataset.tab; $('#cm-search').value = ''; renderCm();
});
$('#cm-search').addEventListener('input', renderCm);
$('#cm-list').addEventListener('change', (e) => {
  const id = e.target.dataset.cid; if (!id) return;
  const ex = store.getExcluded();
  if (e.target.checked) ex.delete(id); else ex.add(id);
  store.setExcluded(ex);
  e.target.closest('.cm-row').classList.toggle('off', !e.target.checked);
  const inSet = allCards().filter((c) => c.level === cmSet);
  $('#cm-count').textContent = `${inSet.filter((c) => !ex.has(c.id)).length} of ${inSet.length} included`;
});
$('#cm-list').addEventListener('click', (e) => {
  const id = e.target.dataset?.del; if (!id) return;
  store.setCustom(store.getCustom().filter((c) => c.id !== id));
  renderCm();
});
function bulk(include) {
  const ex = store.getExcluded();
  allCards().filter((c) => c.level === cmSet).forEach((c) => (include ? ex.delete(c.id) : ex.add(c.id)));
  store.setExcluded(ex); renderCm();
}
$('#cm-include-all').onclick = () => bulk(true);
$('#cm-exclude-all').onclick = () => bulk(false);

$('#add-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const word = $('#add-word').value.trim();
  const taboo = $('#add-taboo').value.split(',').map((s) => s.trim()).filter(Boolean);
  const level = $('#add-level').value;
  if (!word || !taboo.length) return;
  const custom = store.getCustom();
  custom.push({ id: `C:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, level, word, taboo });
  store.setCustom(custom);
  if (!settings.sets.includes(level)) { settings.sets = SETS.filter((x) => x === level || settings.sets.includes(x)); store.setSettings(settings); }
  $('#add-word').value = ''; $('#add-taboo').value = '';
  cmSet = level; renderCm(); $('#add-word').focus();
});

$('#export').onclick = () => {
  const data = { app: 'taboo-cefr', version: 1, custom: store.getCustom(), excluded: [...store.getExcluded()] };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  a.download = 'taboo-cards.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
$('#import').addEventListener('change', async (e) => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    const custom = store.getCustom();
    const have = new Set(custom.map((c) => c.id));
    (data.custom || []).forEach((c) => { if (c.id && c.word && Array.isArray(c.taboo) && !have.has(c.id)) custom.push(c); });
    store.setCustom(custom);
    const ex = store.getExcluded(); (data.excluded || []).forEach((id) => ex.add(id)); store.setExcluded(ex);
    renderCm();
    alert(`Imported ${data.custom?.length || 0} cards and ${data.excluded?.length || 0} exclusions.`);
  } catch { alert('That file could not be read.'); }
  e.target.value = '';
});

/* ---------------- boot ---------------- */
if (game?.phase === 'playing' && game.endAt <= Date.now()) timeUp();
renderSetup();
