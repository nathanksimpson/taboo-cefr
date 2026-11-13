import {
  SETS, SET_INFO, SET_LABEL, TEAM_COLORS, store, allCards, activeCards, wordKey, seenStore, buildDeck, unplayedCount, remainingMs, fmtTime, shuffle, esc, sfx, shortcutKey, bringMatch, LANG_NAME,
} from './core.js';
import { setupTeams, ensureColors, teamLang, langWarning, teamOwnSets, allSets, teamFilter, ownDecksNote, everyTeamHasCards } from './teams.js';
import { setupHostOnline } from './host-online.js';
import { isCoop, coopTeams, trackBest, coopOver, bestChip, setupModeSwitch } from './coop.js';
import { setupDeckPicker, deckSummary } from './decks.js';
let renderDecks = () => {};
const seen = seenStore('hotseat');
import { openCardManager, cardManagerOpen } from './cardmanager.js';
import { sync, hsSettings, STYLE, scoreHS, turnTotal, passRuleText } from './hotseat-shared.js';

const $ = (s) => document.querySelector(s);
let settings = hsSettings.get();
let game = sync.load();

/* ---------------- setup ---------------- */

{
  const want = new URLSearchParams(location.search).get('style');
  if (want === 'whoami' || want === 'hotseat') { settings.style = want; hsSettings.set(settings); }
}
function saveSettings() { hsSettings.set(settings); renderSetup(); net?.sendLobby(); }
const clampNum = (v, lo, hi, d) => { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };

let renderMode = null; // co-op switch (set up at boot)
function renderSetup() {
  renderMode?.();
  document.querySelectorAll('#style-grid [data-style]').forEach((b) => {
    const on = b.dataset.style === settings.style;
    b.classList.toggle('on', on); b.setAttribute('aria-pressed', on);
  });

  renderDecks();
  const n = activeCards(allSets(settings)).length;
  const unseen = n ? unplayedCount(activeCards(allSets(settings)), seen) : 0;
  $('#deck-count').innerHTML = esc(deckSummary(settings.sets, activeCards(settings.sets).length)) + ownDecksNote(settings).map((x) => `<br>${esc(x)}`).join('') + (n && unseen < n
    ? ` <span class="seen-note">${unseen ? `${unseen} not played yet, so those come first.` : 'Every word has been played, so the next game starts a fresh round.'} <button type="button" class="link small" data-reset-seen>Start fresh</button></span>`
    : '') + langWarning(settings).map((x) => `<br><b>${esc(x)}</b>`).join('');
  $('#start').disabled = n === 0 || !everyTeamHasCards(settings);
  $('#setup-summary').textContent = n
    ? `${STYLE[settings.style].name} · ${n} cards · ${isCoop(settings) ? 'whole class' : `${settings.teams.length} teams`} · ${settings.seconds}s turns`
    : 'Pick at least one card set to start.';


  $('#timer-presets').innerHTML = [60, 90, 120, 180].map((s) =>
    `<button data-sec="${s}" class="${settings.seconds === s ? 'on' : ''}">${s % 60 ? `${s}s` : `${s / 60} min`}</button>`).join('');
  $('#seconds').value = settings.seconds;
  document.querySelectorAll('#pass-modes button').forEach((b) => b.classList.toggle('on', b.dataset.mode === settings.passMode));
  $('#free-passes-wrap').hidden = settings.passMode !== 'limited';
  $('#free-passes').value = settings.freePasses;
  $('#foul-penalty').checked = settings.foulPenalty;
  $('#foul-hint').textContent = `(someone ${STYLE[settings.style].foul})`;
  $('#turns-per-team').value = settings.turnsPerTeam;
  $('#show-avoid').checked = settings.showAvoid;
  $('#reveal-words').checked = settings.revealWords;
  $('#sounds').checked = settings.sounds;
  $('#resume-banner').hidden = !(game && game.teams && game.phase !== 'over');
}

$('#style-grid').addEventListener('click', (e) => {
  const b = e.target.closest('[data-style]'); if (!b) return;
  settings.style = b.dataset.style; saveSettings();
});
$('#timer-presets').addEventListener('click', (e) => {
  const b = e.target.closest('[data-sec]'); if (!b) return;
  settings.seconds = +b.dataset.sec; saveSettings();
});
$('#seconds').addEventListener('change', (e) => { settings.seconds = clampNum(e.target.value, 5, 600, 90); saveSettings(); });
$('#pass-modes').addEventListener('click', (e) => {
  const b = e.target.closest('[data-mode]'); if (!b) return;
  settings.passMode = b.dataset.mode; saveSettings();
});
$('#free-passes').addEventListener('change', (e) => { settings.freePasses = clampNum(e.target.value, 0, 20, 2); saveSettings(); });
$('#foul-penalty').onchange = (e) => { settings.foulPenalty = e.target.checked; saveSettings(); };
$('#turns-per-team').addEventListener('change', (e) => { settings.turnsPerTeam = clampNum(e.target.value, 0, 50, 0); saveSettings(); });
$('#show-avoid').onchange = (e) => { settings.showAvoid = e.target.checked; saveSettings(); };
$('#reveal-words').onchange = (e) => { settings.revealWords = e.target.checked; saveSettings(); };
$('#sounds').onchange = (e) => { settings.sounds = e.target.checked; saveSettings(); };

$('#deck-count').addEventListener('click', (e) => {
  if (e.target.closest('[data-reset-seen]')) { seen.clear(); renderSetup(); }
});

$('#start').onclick = () => {
  if (game && game.teams && game.phase !== 'over' && !confirm('Start a new game? The current scores will be cleared.')) return;
  ensureColors(settings);
  const ids = buildDeck(activeCards(allSets(settings)), seen);
  if (!ids.length) return;
  game = {
    kind: 'hotseat',
    phase: 'ready',
    settings: { ...settings, sets: allSets(settings), teams: undefined },
    coop: isCoop(settings),
    teams: isCoop(settings) ? coopTeams(settings).map((t) => ({ ...t, lang: teamLang(settings, 0) })) : (() => {
      // id stays the same if the order is shuffled, so players online keep their team.
      const t = settings.teams.map((name, i) => ({ id: i, name: name.trim() || `Team ${i + 1}`, score: 0, color: settings.colors[i], turns: 0, lang: teamLang(settings, i), sets: teamOwnSets(settings, i) || undefined }));
      return settings.randomOrder ? shuffle(t) : t;
    })(),
    current: 0,
    deck: ids, pos: 0, card: null, log: [], used: [],
    endAt: 0, remaining: 0, flash: null, lastTurn: null,
  };
  pub();
  net.sendLobby();
  showPlay();
};
$('#resume').onclick = () => { if (game) { if (game.phase === 'playing') pause(); showPlay(); } };

/* ---------------- game ---------------- */

const byId = () => new Map(allCards().map((c) => [c.id, c]));
const play = (name) => { if (game?.settings.sounds) sfx[name](); };
const SOUND = { correct: 'correct', pass: 'skip', foul: 'taboo' };

/** Send the game to the class view (same computer) and to the online room. */
function pub() {
  if (!game) return;
  game.kind = 'hotseat';
  trackBest(game, game.settings.style);
  if (game.phase === 'ready') updateSeat();
  game.online = net.active ? { code: net.code } : null;
  sync.publish(game);
  net.publish(game);
}
function commit() { pub(); render(); }

/* ---------------- online: who sits in the hot seat ---------------- */

const teamId = (i = game.current) => game.teams[i].id ?? i;
const hostRole = () => (net.active && game?.teams.some((t, i) => teamId(i) === net.hostRole) ? net.hostRole : 'teacher');
function seatCandidates(tid = teamId()) {
  if (!net.active) return [];
  const list = net.players(tid).map((p) => ({ id: p.id, name: p.name }));
  if (hostRole() === tid) list.unshift({ id: 'host', name: 'Me (this screen)' });
  return list;
}
/** In the "Up next" phase, pick the next player on the team for the hot seat, in turn. */
function updateSeat() {
  const list = seatCandidates();
  if (game.seatManual && (game.seatId == null || list.some((c) => c.id === game.seatId))) return;
  game.seatManual = false;
  if (!list.length) { game.seatId = null; game.seatName = ''; return; }
  const pick = list[game.teams[game.current].turns % list.length];
  game.seatId = pick.id;
  game.seatName = pick.id === 'host' ? '' : pick.name;
}
/** This screen is the one in the hot seat, so it must not show the word. */
const hostInSeat = () => net.active && game.seatId === 'host';

/** A button pressed on a player's device. */
function onRemote(m) {
  if (!game) return;
  const p = game.phase;
  const seat = !!m.from && m.from === game.seatId;
  const onTeam = m.team != null && m.team === teamId();
  const sameCard = m.cardId && m.cardId === game.card?.id;
  // Hot Seat: the seat's teammates describe and score. Who Am I?: everyone else answers, so anyone but the seat can score.
  // If nobody else from the seat's team is online, anyone else may score for them.
  const helpers = net.players(teamId()).filter((x) => x.id !== game.seatId).length;
  const runs = !seat && (onTeam || game.settings.style === 'whoami' || !helpers);
  if (m.act === 'start' && p === 'ready' && (onTeam || seat)) startTurn();
  else if ((m.act === 'correct' || m.act === 'pass') && p === 'playing' && runs && sameCard) mark(m.act);
  else if (m.act === 'foul' && p === 'playing' && !seat && sameCard) mark('foul', m.name);
  else if (m.act === 'undo' && p === 'playing' && runs) undo();
  else if (m.act === 'pause' && (p === 'playing' || p === 'paused') && (onTeam || seat)) pause();
  else if (m.act === 'rv' && p === 'review' && (onTeam || seat) && game.log[m.i] && ['correct', 'pass', 'foul'].includes(m.r)) { game.log[m.i].result = m.r; commit(); }
  else if (m.act === 'confirm' && p === 'review' && (onTeam || seat)) confirmTurn();
}

function seatPicker() {
  if (!net.active) return '';
  const list = seatCandidates();
  if (!list.length) return `<p class="remote-note">Nobody from ${esc(game.teams[game.current].name)} has joined online — the hot seat is in the room.</p>`;
  const opts = [{ id: '', name: 'Someone in the room (no device)' }, ...list];
  return `<label class="explainer-pick">In the hot seat
    <select id="seat-select">${opts.map((c) => `<option value="${esc(c.id)}" ${(c.id || null) === (game.seatId ?? null) ? 'selected' : ''}>${esc(c.name)}${c.id && c.id !== 'host' ? ' 📱' : ''}</option>`).join('')}</select></label>
    ${game.seatId && game.seatId !== 'host' ? `<p class="remote-note">The word is hidden on ${esc(game.seatName)}'s device.</p>` : ''}`;
}
function showPlay() { document.activeElement?.blur?.(); $('#setup').hidden = true; $('#play').hidden = false; render(); }
function showSetup() { $('#play').hidden = true; $('#setup').hidden = false; renderSetup(); }

function drawCard() {
  const map = byId();
  const ex = store.getExcluded();
  game.used ||= [];
  for (let guard = 0; guard < 2; guard++) {
    const ok = teamFilter(game, game.teams[game.current]); // Nadu: the team's own decks and language
    while (bringMatch(game.deck, game.pos, ok, map)) {
      const c = map.get(game.deck[game.pos++]);
      if (!c || ex.has(c.id)) continue;
      const k = wordKey(c.word);
      if (game.used.includes(k)) continue; // never the same word twice in a round
      game.used.push(k);
      seen.add(k);
      game.card = { id: c.id, word: c.word, taboo: c.taboo, level: c.level, label: SET_LABEL(c.level) };
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

function mark(result, by) {
  if (game.phase !== 'playing' || !game.card) return;
  game.log.push({ card: game.card, result });
  game.flash = { type: result, at: Date.now(), by: by || '' };
  play(SOUND[result]);
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
  // the card still on screen goes into the summary (0 points; it can be changed to ✓ if it was guessed at the buzzer)
  if (game.card) game.log.push({ card: game.card, result: 'timeup' });
  game.card = null; // a word that was shown counts as played, even if time ran out
  game.flash = { type: 'timeup', at: Date.now() };
  play('timeUp');
  commit();
}

function confirmTurn() {
  const pts = turnTotal(game.log, game.settings);
  const team = game.teams[game.current];
  team.score += pts;
  team.turns += 1;
  game.lastTurn = { team: game.current, pts, log: game.log };
  game.seatManual = false;
  game.log = [];
  game.current = (game.current + 1) % game.teams.length;
  const limit = game.settings.turnsPerTeam;
  game.phase = limit > 0 && game.teams.every((t) => t.turns >= limit) ? 'over' : 'ready';
  commit();
}

function endGame() {
  if (!confirm('End the game and show the final scores?')) return;
  if (['playing', 'paused', 'review'].includes(game.phase) && game.log.length && confirm('Count the points from the current turn?')) {
    game.teams[game.current].score += turnTotal(game.log, game.settings);
  }
  game.phase = 'over'; game.card = null; game.log = [];
  commit();
}

/* ---------------- rendering ---------------- */

function render() {
  if (!game) return;
  const team = game.teams[game.current];
  $("#cur-team").innerHTML = `<span class="dot" style="background:${team.color}"></span><span class="chip-text">${esc(team.name)}</span>`;
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
}

function tallyHtml(log) {
  const s = game.settings;
  const c = (r) => log.filter((e) => e.result === r).length;
  const total = turnTotal(log, s);
  let note = '';
  if (s.passMode === 'limited') { const left = Math.max(0, s.freePasses - c('pass')); note = `${left} free pass${left === 1 ? '' : 'es'} left`; }
  if (s.passMode === 'free') note = 'Passes are free';
  if (s.passMode === 'penalty') note = 'Passes cost 1 point';
  return `<div class="tally">
    <span class="t correct">✓ ${c('correct')}</span>
    <span class="t skip">↷ ${c('pass')}</span>
    <span class="t taboo">✕ ${c('foul')}</span>
    <span class="t pts">${total >= 0 ? '+' : ''}${total} this turn</span>
    <span class="t-note">${note}</span>
  </div>`;
}

function renderStage() {
  const st = $('#stage');
  const team = game.teams[game.current];
  const s = game.settings;
  const style = STYLE[s.style];
  if (game.phase === 'ready') {
    const last = game.lastTurn ? `<p class="muted">Last turn: ${esc(game.teams[game.lastTurn.team].name)} ${game.lastTurn.pts >= 0 ? '+' : ''}${game.lastTurn.pts}</p>` : '';
    st.innerHTML = `<div class="ready" style="--team:${team.color}">
      <p class="eyebrow">${esc(style.name)} · up next</p>
      <h1 class="ready-team">${esc(team.name)}</h1>
      ${team.lang ? `<p class="muted"><span class="lang-tag ${team.lang}">${LANG_NAME[team.lang]}</span> Explain in ${team.lang === 'ko' ? 'Korean' : 'English'}</p>` : ''}
      <p class="seat-note">🪑 ${game.seatName ? `${esc(game.seatName)} is in the hot seat` : game.seatId === 'host' ? 'You’re in the hot seat — turn away from the screen!' : esc(style.seat)}</p>
      <p class="muted">${esc(style.rule)}<br>${s.seconds} seconds · ${esc(passRuleText(s))}${s.foulPenalty ? ' · Rule broken −1' : ''}</p>
      ${last}
      ${seatPicker()}
      <button class="btn primary huge" data-act="start">Start turn <kbd>Space</kbd></button>
    </div>`;
  } else if (game.phase === 'playing' && game.card && hostInSeat()) {
    st.innerHTML = `<div class="ready"><p class="eyebrow">You're in the hot seat</p>
      <h1 class="ready-team">${s.style === 'whoami' ? 'Ask yes/no questions!' : 'Listen and guess!'}</h1>
      <p class="muted">The word is hidden on this screen. Your team scores it on their devices.</p>
      ${tallyHtml(game.log)}</div>`;
  } else if (game.phase === 'playing' && game.card) {
    const c = game.card;
    st.innerHTML = `<div class="card-wrap hs-wrap">
      ${game.seatName ? `<p class="remote-note">🪑 ${esc(game.seatName)} is in the hot seat</p>` : ''}
      <div class="hs-card">
        <span class="level-tag">${SET_LABEL(c.level)}</span>
        <div class="hs-word">${esc(c.word)}</div>
        ${s.showAvoid ? `<div class="hs-avoid"><span>Don’t say</span>${c.taboo.map((t) => `<b>${esc(t)}</b>`).join('')}</div>` : ''}
      </div>
      ${tallyHtml(game.log)}
      <div class="act">
        <button class="btn act-taboo" data-act="foul">Rule broken <kbd>X</kbd></button>
        <button class="btn act-skip" data-act="pass">Pass <kbd>S</kbd></button>
        <button class="btn act-correct" data-act="correct">Correct <kbd>Space</kbd></button>
      </div>
      <div class="act-minor">
        <button class="link" data-act="undo" ${game.log.length ? '' : 'disabled'}>↶ Undo last <kbd>Z</kbd></button>
        <button class="link" data-act="exclude">Too hard — remove this card for good</button>
      </div>
    </div>`;
  } else if (game.phase === 'paused') {
    st.innerHTML = `<div class="ready"><p class="eyebrow">Paused</p><h1 class="ready-team">Word hidden</h1>
      <button class="btn primary huge" data-act="pause">Resume <kbd>P</kbd></button></div>`;
  } else if (game.phase === 'review') {
    const pts = scoreHS(game.log, s);
    const rows = game.log.map((e, i) => `<div class="rv-row">
        <span class="rv-word">${esc(e.card.word)} <span class="level-tag small">${SET_LABEL(e.card.level)}</span>${e.result === 'timeup' ? ' <span class="rv-timeup">⏱ time ran out</span>' : ''}</span>
        <span class="rv-btns">
          ${['correct', 'pass', 'foul'].map((r) => `<button class="rv ${{ correct: 'correct', pass: 'skip', foul: 'taboo' }[r]} ${e.result === r ? 'on' : ''}" data-rv="${i}" data-r="${r}" title="${{ correct: 'Correct', pass: 'Pass', foul: 'Rule broken' }[r]}">${{ correct: '✓', pass: '↷', foul: '✕' }[r]}</button>`).join('')}
        </span>
        <span class="rv-pts">${pts[i] > 0 ? '+' : ''}${pts[i]}</span>
        <button class="link small" data-rx="${i}" title="Remove this card from future games">remove card</button>
      </div>`).join('');
    const total = turnTotal(game.log, s);
    st.innerHTML = `<div class="review">
      <p class="eyebrow">Time's up — the hot seat can turn around</p>
      <h2>${esc(team.name)}: <span class="${total < 0 ? 'neg' : ''}">${total >= 0 ? '+' : ''}${total}</span></h2>
      <p class="muted">Fix any mistakes before confirming — tap a symbol to change it.</p>
      <div class="rv-list">${rows || '<p class="muted">No words played this turn.</p>'}</div>
      <button class="btn primary huge" data-act="confirm">${game.coop ? 'Confirm &amp; next turn' : 'Confirm &amp; next team'} <kbd>Enter</kbd></button>
    </div>`;
  } else if (game.phase === 'over' && game.coop) {
    const o = coopOver(game);
    st.innerHTML = `<div class="ready">
      <p class="eyebrow">Game over · whole class</p>
      <h1 class="ready-team">${o.title}</h1>${o.line}
      <div class="row-btns">
        <button class="btn ghost" data-act="continue">Keep playing</button>
        <button class="btn primary" data-act="setup">New game</button>
      </div>
    </div>`;
  } else if (game.phase === 'over') {
    const ranked = [...game.teams].sort((a, b) => b.score - a.score);
    const winners = ranked.filter((t) => t.score === ranked[0].score);
    const title = game.teams.length === 1 ? `${ranked[0].score} point${ranked[0].score === 1 ? '' : 's'}!` : winners.length > 1 ? 'It’s a tie!' : `${esc(winners[0].name)} wins!`;
    st.innerHTML = `<div class="ready">
      <p class="eyebrow">Game over</p>
      <h1 class="ready-team">${title}</h1>
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
  </div>`).join('') + bestChip(game, game.settings.style);
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
  else if (p === 'playing' && hostInSeat()) {
    if (k === 'p') pause();
  } else if (p === 'playing') {
    if (k === ' ' || k === 'enter' || k === 'arrowright') { e.preventDefault(); mark('correct'); }
    else if (k === 'x') mark('foul');
    else if (k === 's') mark('pass');
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

sync.onMessage((m) => { if (m?.type === 'hello' && game) sync.publish(game); });
$('#stage').addEventListener('change', (e) => {
  if (e.target.id !== 'seat-select' || game?.phase !== 'ready') return;
  game.seatId = e.target.value || null;
  game.seatName = !e.target.value || e.target.value === 'host' ? '' : net.nameOf(e.target.value);
  game.seatManual = true;
  commit();
});

let classWin = null;
$('#open-class').onclick = () => {
  if (classWin && !classWin.closed) { classWin.focus(); return; }
  classWin = window.open('hotseat-class.html', 'hotseat-class', 'popup,width=1280,height=760');
  if (!classWin) alert('Your browser blocked the pop-up. Allow pop-ups for this site, or open /hotseat-class.html in a new window.');
};

function openCards() {
  openCardManager({
    onAdd(level) { if (!settings.sets.includes(level)) { settings.sets = SETS.filter((x) => x === level || settings.sets.includes(x)); hsSettings.set(settings); } },
    onClose() { renderSetup(); if (game && !$('#play').hidden) render(); },
  });
}
$('#manage-cards').onclick = openCards;
$('#manage-cards-top').onclick = openCards;

/* ---------------- boot ---------------- */
const net = setupHostOnline({
  kind: 'hotseat',
  getGame: () => game,
  getTeams: () => {
    if (game && game.phase !== 'over') return game.teams.map((t, i) => ({ id: teamId(i), name: t.name, color: t.color }));
    if (isCoop(settings)) return coopTeams(settings).map(({ id, name, color }) => ({ id, name, color }));
    ensureColors(settings);
    return settings.teams.map((name, i) => ({ id: i, name: name.trim() || `Team ${i + 1}`, color: settings.colors[i] }));
  },
  onAct: onRemote,
  onChange: () => { if (game) { pub(); if (!$('#play').hidden) render(); } },
  teamsApi: {
    canResize: () => (!game || game.phase === 'over') && !isCoop(settings),
    rename(id, name) {
      if (id < settings.teams.length) { settings.teams[id] = name; hsSettings.set(settings); renderTeamList(); }
      if (game && game.phase !== 'over') {
        const t = game.teams.find((x, i) => teamId(i) === id);
        if (t) { t.name = name.trim() || `Team ${id + 1}`; commit(); }
      }
    },
    add() {
      if (settings.teams.length >= 6) return;
      settings.teams.push(`Team ${settings.teams.length + 1}`);
      ensureColors(settings); saveSettings(); renderTeamList();
    },
    remove(id) {
      if (settings.teams.length <= 1) return;
      const order = settings.teams.map((_, i) => i).filter((i) => i !== id);
      settings.teams.splice(id, 1); settings.colors.splice(id, 1);
      saveSettings(); renderTeamList(); net.remap(order);
    },
  },
});
if (location.hash === '#online') {
  history.replaceState(null, '', location.pathname + location.search);
  setTimeout(() => net.host(), 0);
}
renderDecks = setupDeckPicker({ settings, save: saveSettings });
ensureColors(settings);
const renderTeamList = setupTeams({
  settings, min: 1, save: saveSettings,
  persist: () => { hsSettings.set(settings); net.sendLobby(); net.render(); },
  onReorder: (order) => net.remap(order),
});
renderMode = setupModeSwitch({ settings, save: saveSettings, kind: () => settings.style });
if (game?.phase === 'playing' && game.endAt <= Date.now()) timeUp();
renderSetup();
