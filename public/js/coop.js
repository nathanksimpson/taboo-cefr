// Whole-class co-op: no teams — everyone plays together for one shared score,
// and tries to beat the class's best. Used by Taboo and Hot Seat / Who Am I?.
//
// In settings: mode 'teams' (default) or 'coop', and className (whose best score it is).
// In a co-op game there is exactly one team (the class), so everything else just works:
// explainers / hot seats rotate through everyone, and phones join that one team.
import { esc } from './core.js';

export const COOP_COLOR = '#27c3c9';
export const isCoop = (settings) => settings?.mode === 'coop';
export const coopName = (settings) => (settings.className || '').trim() || 'Whole class';

/** The single "team" of a co-op game. */
export const coopTeams = (settings) => [{ id: 0, name: coopName(settings), score: 0, color: COOP_COLOR, turns: 0 }];

/* ---------- best scores, per game and class (saved in this browser) ---------- */
const BEST_KEY = 'class.best.v1';
const loadBest = () => { try { return JSON.parse(localStorage.getItem(BEST_KEY) || '{}'); } catch { return {}; } };
const bestId = (kind, name) => `${kind}:${String(name).trim().toLowerCase()}`;
export const bestFor = (kind, name) => loadBest()[bestId(kind, name)] ?? null;
/** Save the score if it beats the class's best. Returns { before, best, isNew }. */
export function recordBest(kind, name, score) {
  const all = loadBest();
  const id = bestId(kind, name);
  const before = all[id] ?? null;
  const isNew = before === null || score > before;
  if (isNew) { all[id] = score; try { localStorage.setItem(BEST_KEY, JSON.stringify(all)); } catch { /* storage off */ } }
  return { before, best: isNew ? score : before, isNew: isNew && before !== null };
}

/**
 * Call from the game's publish step: when a co-op game ends, record the score once
 * and keep the result on the game (so the big screen and phones can show it).
 */
export function trackBest(game, kind) {
  if (!game?.coop) return;
  if (game.phase !== 'over') { game.bestDone = false; return; }
  if (game.bestDone) return;
  game.best = recordBest(kind, game.teams[0].name, game.teams[0].score);
  game.bestDone = true;
}

/** Game-over heading and best-score line for co-op (shared by every screen). */
export function coopOver(game, { big = false } = {}) {
  const t = game.teams[0];
  const b = game.best;
  const line = !b ? '' : b.isNew ? `🏆 New class best! (was ${b.before})` : b.before === null ? 'First game — that’s your class best to beat.' : `Class best: ${b.best}`;
  const cls = big ? 'cv-sub' : 'coop-best';
  return {
    title: `${esc(t.name)}: ${t.score} point${t.score === 1 ? '' : 's'}!`,
    line: line ? `<p class="${cls} ${b?.isNew ? 'new' : ''}">${esc(line)}</p>` : '',
  };
}

/** "Best: n" chip for scoreboards during a co-op game. */
export function bestChip(game, kind) {
  if (!game?.coop) return '';
  const b = bestFor(kind, game.teams[0].name);
  return b === null ? '' : `<span class="best-chip" title="Class best">Best ${b}</span>`;
}

/**
 * The Teams / Whole class switch in the setup's Teams panel.
 * Expects #play-mode, #coop-box, #class-name, #team-names and the team stepper in the page.
 */
export function setupModeSwitch({ settings, save, kind }) {
  const $ = (s) => document.querySelector(s);
  const seg = $('#play-mode');
  const render = () => {
    const coop = isCoop(settings);
    seg.querySelectorAll('[data-mode]').forEach((b) => { const on = b.dataset.mode === (coop ? 'coop' : 'teams'); b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
    $('#coop-box').hidden = !coop;
    $('#team-names').hidden = coop;
    const panel = seg.closest('.panel');
    panel.querySelectorAll('.stepper, #team-shuffle, .team-random').forEach((el) => el.toggleAttribute('hidden', coop));
    if (document.activeElement !== $('#class-name')) $('#class-name').value = settings.className || '';
    const k = typeof kind === 'function' ? kind() : kind;
    const b = bestFor(k, coopName(settings));
    $('#coop-hint').textContent = `Everyone plays together for one score.${b === null ? '' : ` ${coopName(settings)}’s best: ${b}.`} Each turn, ${k === 'taboo' ? 'the next student explains' : 'the next student takes the hot seat'}.`;
    document.querySelectorAll('[data-per-team]').forEach((el) => { el.textContent = coop ? 'turns' : 'turns per team'; });
  };
  seg.addEventListener('click', (e) => {
    const b = e.target.closest('[data-mode]');
    if (!b) return;
    settings.mode = b.dataset.mode;
    save(); render();
  });
  $('#class-name').addEventListener('input', (e) => { settings.className = e.target.value; save(); render(); });
  render();
  return render;
}
