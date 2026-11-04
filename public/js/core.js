// Shared data, storage and sync used by both windows.
import { RAW } from './cards.js';

export const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
export const SETS = [...LEVELS, 'MY'];
export const SET_INFO = {
  A1: 'Beginner', A2: 'Elementary', B1: 'Intermediate',
  B2: 'Upper-intermediate', C1: 'Advanced', C2: 'Proficiency', MY: 'My cards',
};
export const SET_LABEL = (s) => (s === 'MY' ? 'My cards' : s);
export const TEAM_COLORS = ['#ef4b3f', '#2f6df6', '#13a35f', '#e29a0f', '#8b4ef0', '#e5428f'];

function parse(level, text) {
  return text.trim().split('\n').map((l) => l.trim()).filter(Boolean).map((line) => {
    const i = line.indexOf(':');
    const word = line.slice(0, i).trim();
    const taboo = line.slice(i + 1).split(',').map((s) => s.trim()).filter(Boolean);
    return { id: `${level}:${word.toLowerCase()}`, level, word, taboo, custom: false };
  });
}
export const BUILTIN = LEVELS.flatMap((l) => parse(l, RAW[l]));

const K = {
  excluded: 'taboo.excluded.v1',
  custom: 'taboo.custom.v1',
  settings: 'taboo.settings.v1',
  game: 'taboo.game.v1',
};
export const GAME_KEY = K.game;

function load(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function save(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* storage unavailable */ }
}

export const DEFAULT_SETTINGS = {
  sets: ['A2', 'B1'],
  seconds: 60,
  skipMode: 'limited', // 'free' | 'penalty' | 'limited'
  freeSkips: 1,
  tabooPenalty: true,
  turnsPerTeam: 0, // 0 = play until you end the game
  sounds: true,
  revealWords: true,
  teams: ['Team 1', 'Team 2'],
};

export const store = {
  getExcluded: () => new Set(load(K.excluded, [])),
  setExcluded: (s) => save(K.excluded, [...s]),
  getCustom: () => load(K.custom, []),
  setCustom: (c) => save(K.custom, c),
  getSettings: () => ({ ...DEFAULT_SETTINGS, ...load(K.settings, {}) }),
  setSettings: (s) => save(K.settings, s),
  getGame: () => load(K.game, null),
  setGame: (g) => save(K.game, g),
};

export function allCards() {
  return [...BUILTIN, ...store.getCustom().map((c) => ({ ...c, custom: true }))];
}

export function activeCards(sets) {
  const ex = store.getExcluded();
  return allCards().filter((c) => sets.includes(c.level) && !ex.has(c.id));
}

// Points for each entry of a turn log, applying the skip rule in order.
export function scoreTurn(log, s) {
  let skips = 0;
  return log.map((e) => {
    if (e.result === 'correct') return 1;
    if (e.result === 'taboo') return s.tabooPenalty ? -1 : 0;
    if (e.result === 'skip') {
      skips += 1;
      if (s.skipMode === 'penalty') return -1;
      if (s.skipMode === 'limited') return skips > s.freeSkips ? -1 : 0;
      return 0;
    }
    return 0;
  });
}
export const sum = (a) => a.reduce((x, y) => x + y, 0);

export function skipRuleText(s) {
  if (s.skipMode === 'free') return 'Skips are free';
  if (s.skipMode === 'penalty') return 'Every skip costs 1 point';
  return `${s.freeSkips} free skip${s.freeSkips === 1 ? '' : 's'} per turn, then −1 each`;
}

export function remainingMs(g) {
  if (!g) return 0;
  if (g.phase === 'playing') return Math.max(0, g.endAt - Date.now());
  if (g.phase === 'paused') return g.remaining;
  if (g.phase === 'review') return 0;
  return g.settings.seconds * 1000;
}

export function fmtTime(ms) {
  const t = Math.ceil(ms / 1000);
  const m = Math.floor(t / 60);
  const s = t % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : String(s);
}

export function shuffle(a) {
  const arr = [...a];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Same-browser window sync: BroadcastChannel, with localStorage events as backup.
const bc = 'BroadcastChannel' in window ? new BroadcastChannel('taboo-cefr') : null;
export function publish(game) {
  store.setGame(game);
  bc?.postMessage({ type: 'state', game });
}
export function onMessage(fn) {
  bc?.addEventListener('message', (e) => fn(e.data));
  window.addEventListener('storage', (e) => {
    if (e.key === K.game) fn({ type: 'state', game: e.newValue ? JSON.parse(e.newValue) : null });
  });
}
export function send(msg) { bc?.postMessage(msg); }

// Small Web Audio sound kit — no files needed.
let ctx;
function tone(freq, dur, type = 'sine', vol = 0.18, when = 0) {
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    const t0 = ctx.currentTime + when;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t0); o.stop(t0 + dur + 0.02);
  } catch { /* audio unavailable */ }
}
export const sfx = {
  correct: () => { tone(660, 0.12, 'triangle'); tone(990, 0.22, 'triangle', 0.18, 0.1); },
  taboo: () => { tone(150, 0.45, 'sawtooth', 0.22); tone(155, 0.45, 'square', 0.08); },
  skip: () => tone(330, 0.15, 'sine', 0.12),
  tick: () => tone(1200, 0.05, 'square', 0.06),
  timeUp: () => { tone(220, 0.9, 'sawtooth', 0.22); tone(110, 0.9, 'square', 0.1); },
  start: () => { tone(523, 0.1, 'triangle'); tone(784, 0.18, 'triangle', 0.18, 0.1); },
};
