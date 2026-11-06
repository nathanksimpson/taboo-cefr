// Shared data, storage and sync used by both windows.
import { RAW } from './cards.js';
import { BOOKS, LEVEL_ORDER, LEVEL_COLORS } from './books/index.js';
import { KO_RAW, KO_LEVELS, KO_INFO } from './korean.js';

export { BOOKS, LEVEL_ORDER, LEVEL_COLORS, KO_LEVELS };
export const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
export const BOOK_IDS = BOOKS.map((b) => b.id);
export const BOOK_BY_ID = Object.fromEntries(BOOKS.map((b) => [b.id, b]));
export const SETS = [...BOOK_IDS, ...LEVELS, ...KO_LEVELS, 'MY'];
export const isKorean = (s) => KO_LEVELS.includes(s);
/** Language a card set is in: 'ko' for the TOPIK decks, otherwise 'en'. */
export const SET_LANG = (s) => (isKorean(s) ? 'ko' : 'en');
export const SET_INFO = {
  A1: 'Beginner', A2: 'Elementary', B1: 'Intermediate',
  B2: 'Upper-intermediate', C1: 'Advanced', C2: 'Proficiency', MY: 'My cards',
  ...KO_INFO,
  ...Object.fromEntries(BOOKS.map((b) => [b.id, `${b.level} level`])),
};
/** Short label, used on cards and tabs: "WN 3 · Navy", "B1", "My cards". */
export const SET_LABEL = (s) => (s === 'MY' ? 'My cards' : BOOK_BY_ID[s] ? `${BOOK_BY_ID[s].short} · ${BOOK_BY_ID[s].level}` : isKorean(s) ? `TOPIK ${s.slice(1)}` : s);
/** Full deck name: "Write Now 3 · Navy". */
export const SET_NAME = (s) => (BOOK_BY_ID[s] ? `${BOOK_BY_ID[s].name} · ${BOOK_BY_ID[s].level}` : s === 'MY' ? 'My cards' : isKorean(s) ? `한국어 ${KO_INFO[s]}` : `CEFR ${s}`);
/** Which filter group a set belongs to: a Rainbow level, 'CEFR' or 'MY'. */
export const SET_GROUP = (s) => (BOOK_BY_ID[s] ? BOOK_BY_ID[s].level : s === 'MY' ? 'MY' : isKorean(s) ? 'Korean' : 'CEFR');
export const TEAM_COLORS = ['#ef4b3f', '#2f6df6', '#13a35f', '#e29a0f', '#8b4ef0', '#e5428f'];

function parse(level, text) {
  return text.trim().split('\n').map((l) => l.trim()).filter(Boolean).map((line) => {
    const i = line.indexOf(':');
    const word = line.slice(0, i).trim();
    const taboo = line.slice(i + 1).split(',').map((s) => s.trim()).filter(Boolean);
    return { id: `${level}:${word.toLowerCase()}`, level, word, taboo, custom: false, lang: SET_LANG(level) };
  });
}
function parseBook(book) {
  let unit = '';
  const out = [];
  for (const raw of book.raw.trim().split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#')) { unit = line.slice(1).trim(); continue; }
    const i = line.indexOf(':');
    const word = line.slice(0, i).trim();
    const taboo = line.slice(i + 1).split(',').map((s) => s.trim()).filter(Boolean);
    out.push({ id: `${book.id}:${word.toLowerCase()}`, level: book.id, unit, word, taboo, custom: false });
  }
  return out;
}
export const BUILTIN = [...BOOKS.flatMap(parseBook), ...LEVELS.flatMap((l) => parse(l, RAW[l])), ...KO_LEVELS.flatMap((l) => parse(l, KO_RAW[l]))];

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

/** Normalise a word so the same word from different decks matches: "The Earth" = "earth", "cookies" = "cookie". */
export function wordKey(w) {
  let k = String(w).toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9'\u3131-\u318e\uac00-\ud7a3 -]/g, '').replace(/\s+/g, ' ').trim();
  k = k.replace(/^(a|an|the) /, '');
  return k.split(' ').map((t) => (t.length > 3 && /[^s]s$/.test(t) ? t.slice(0, -1) : t)).join(' ');
}

/** Cards in play for these decks. When decks share a word, only one copy is kept (your own cards win). */
export function activeCards(sets) {
  const ex = store.getExcluded();
  const pool = allCards().filter((c) => sets.includes(c.level) && !ex.has(c.id));
  const seen = new Set();
  const out = [];
  for (const c of [...pool.filter((x) => x.custom), ...pool.filter((x) => !x.custom)]) {
    const k = wordKey(c.word);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(c);
  }
  return out;
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
// Each game gets its own storage key and channel.
export function makeSync(gameKey, channelName) {
  const bc = 'BroadcastChannel' in window ? new BroadcastChannel(channelName) : null;
  return {
    load: () => load(gameKey, null),
    publish(game) { save(gameKey, game); bc?.postMessage({ type: 'state', game }); },
    onMessage(fn) {
      bc?.addEventListener('message', (e) => fn(e.data));
      window.addEventListener('storage', (e) => {
        if (e.key === gameKey) fn({ type: 'state', game: e.newValue ? JSON.parse(e.newValue) : null });
      });
    },
    send(msg) { bc?.postMessage(msg); },
  };
}
const tabooSync = makeSync(K.game, 'taboo-cefr');
export const publish = tabooSync.publish;
export const onMessage = tabooSync.onMessage;
export const send = tabooSync.send;

// Settings saved per game.
export function settingsStore(key, defaults) {
  return {
    get: () => ({ ...defaults, ...load(key, {}) }),
    set: (s) => save(key, s),
  };
}

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

// Read shortcuts by physical key so they work in Korean (한글) input mode too:
// in 한글 mode X types ㅌ, S ㄴ, Z ㅋ, P ㅔ, F ㄹ, but e.code stays KeyX etc.
const JAMO = { 'ㅌ': 'x', 'ㄴ': 's', 'ㅋ': 'z', 'ㅔ': 'p', 'ㄹ': 'f' };
export function shortcutKey(e) {
  const c = e.code || '';
  if (/^Key[A-Z]$/.test(c)) return c.slice(3).toLowerCase();
  if (c === 'Space') return ' ';
  if (c === 'Enter' || c === 'NumpadEnter') return 'enter';
  if (c === 'ArrowRight') return 'arrowright';
  const k = (e.key || '').toLowerCase();
  return JAMO[k] || k;
}

// Words already played, remembered across games so new games use fresh words first.
export function seenStore(name) {
  const key = `${name}.seen.v1`;
  const get = () => new Set(load(key, []));
  return {
    get,
    add(k) { const s = get(); if (!s.has(k)) { s.add(k); save(key, [...s]); } },
    remove(k) { const s = get(); if (s.delete(k)) save(key, [...s]); },
    clear() { save(key, []); },
  };
}
export const unplayedCount = (cards, seen) => { const s = seen.get(); return cards.filter((c) => !s.has(wordKey(c.word))).length; };
/** Deck order: words not played yet (shuffled), then played ones (shuffled). Starts a fresh round when everything has been played. */
export function buildDeck(cards, seen) {
  const s = seen.get();
  const fresh = cards.filter((c) => !s.has(wordKey(c.word)));
  if (!fresh.length) { seen.clear(); return shuffle(cards).map((c) => c.id); }
  const old = cards.filter((c) => s.has(wordKey(c.word)));
  return [...shuffle(fresh), ...shuffle(old)].map((c) => c.id);
}
