// Taboo Online — game rules shared by the room server (src/worker.js) and the browser.
// Pure functions, no DOM: the server applies every action, then sends each player their own view.

export const MAX_PLAYERS = 12;
export const MAX_TEAMS = 4;
export const RESULTS = ['correct', 'taboo', 'skip'];

export const STYLES = ['taboo', 'hotseat', 'whoami'];

export const DEFAULT_SETTINGS = {
  style: 'taboo',        // 'taboo' | 'hotseat' (describe to the player in the hot seat) | 'whoami' (hot seat asks yes/no questions)
  showAvoid: false,      // Hot Seat: show the card's taboo words as words to avoid
  mode: 'coop',          // 'coop' = everyone on one side, shared score · 'teams' = teams compete
  teamCount: 2,
  teamNames: ['Team 1', 'Team 2', 'Team 3', 'Team 4'],
  seconds: 60,
  skipMode: 'limited',   // 'free' | 'limited' | 'penalty'
  freeSkips: 1,
  tabooPenalty: true,
  rounds: 3,             // a round = everyone (co-op) or every team (teams) explains once · 0 = until you end it
};

export function newRoom(code) {
  return {
    code, players: {}, order: [], settings: { ...DEFAULT_SETTINGS },
    phase: 'lobby', scores: [], rot: [], team: 0, turnsDone: 0, turn: null,
    history: [], best: 0, lastTurn: null,
  };
}

const clampInt = (v, lo, hi, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const cleanStr = (v, max) => String(v ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, max);

export const teamCount = (s) => (s.settings.mode === 'coop' ? 1 : s.settings.teamCount);
export const teamName = (s, t) => (s.settings.mode === 'coop' ? '' : s.settings.teamNames[t] || `Team ${t + 1}`);
/** Players on a team, in join order. In co-op everyone is on team 0. */
export const members = (s, t) => s.order.filter((p) => s.players[p] && (s.settings.mode === 'coop' || s.players[p].team === t));
export function explainerOf(s) {
  const m = members(s, s.team);
  return m.length ? m[(s.rot[s.team] || 0) % m.length] : null;
}
/**
 * Who sits in the hot seat (can't see the card) for a turn led by `lead`.
 * Taboo: nobody special (the lead's teammates just can't see it).
 * Hot Seat: the next player on the lead's team. Who Am I?: the lead, who asks the questions.
 */
export function seatFor(s, lead, team) {
  if (s.settings.style === 'whoami') return lead;
  if (s.settings.style !== 'hotseat') return null;
  const m = members(s, team);
  const i = m.indexOf(lead);
  return m.length > 1 ? m[(i + 1) % m.length] : null;
}
/** Can this player see the card right now? */
export function canSee(s, pid, turn) {
  const st = s.settings;
  if (st.style === 'taboo') return turn.explainer === pid || (st.mode === 'teams' && s.players[pid] && s.players[pid].team !== turn.team);
  return !!s.players[pid] && pid !== turn.seat;
}
/** Can this player press Correct / Skip / Undo? */
export function canRun(s, pid, turn) {
  if (turn.explainer === pid && s.settings.style !== 'whoami') return true;
  if (s.settings.style === 'taboo') return false;
  const p = s.players[pid];
  return !!p && pid !== turn.seat && (s.settings.mode === 'coop' || p.team === turn.team);
}

export function turnLimit(s) {
  if (!s.settings.rounds) return 0;
  return s.settings.rounds * (s.settings.mode === 'coop' ? Math.max(1, s.order.length) : teamCount(s));
}

/** Points per log entry, applying the skip rule in order (same rule as the classroom game). */
export function scoreLog(log, st) {
  let skips = 0;
  return log.map((e) => {
    if (e.result === 'correct') return 1;
    if (e.result === 'taboo') return st.tabooPenalty ? -1 : 0;
    if (e.result === 'skip') {
      skips += 1;
      if (st.skipMode === 'penalty') return -1;
      if (st.skipMode === 'limited') return skips > st.freeSkips ? -1 : 0;
    }
    return 0;
  });
}
const total = (a) => a.reduce((x, y) => x + y, 0);

function smallestTeam(s) {
  let best = 0;
  for (let t = 1; t < s.settings.teamCount; t++) if (members(s, t).length < members(s, best).length) best = t;
  return best;
}

function cleanCard(c) {
  if (!c || typeof c !== 'object') return null;
  const word = cleanStr(c.word, 60);
  const taboo = Array.isArray(c.taboo) ? c.taboo.slice(0, 6).map((t) => cleanStr(t, 40)).filter(Boolean) : [];
  if (!word) return null;
  return { word, taboo, level: cleanStr(c.level, 12), lang: c.lang === 'ko' ? 'ko' : 'en', id: cleanStr(c.id, 80) };
}

function finishTurn(s) {
  s.phase = 'review';
  s.turn.remaining = 0;
}

function nextTurn(s) {
  s.rot[s.team] = (s.rot[s.team] || 0) + 1;
  s.team = (s.team + 1) % teamCount(s);
  s.turn = null;
  const lim = turnLimit(s);
  if (lim && s.turnsDone >= lim) endGame(s);
  else s.phase = 'ready';
}

function endGame(s) {
  s.phase = 'over';
  s.turn = null;
  if (s.settings.mode === 'coop') s.best = Math.max(s.best || 0, s.scores[0] || 0);
}

/**
 * Apply one action from player `pid` at server time `now`.
 * Returns an error string (state unchanged) or null.
 */
export function apply(s, pid, a, now) {
  const me = s.players[pid];
  const st = s.settings;
  switch (a.type) {
    case 'hello': {
      if (!me) {
        if (s.order.length >= MAX_PLAYERS) return 'full';
        s.players[pid] = { name: cleanStr(a.name, 24) || 'Player', lang: a.lang === 'ko' ? 'ko' : 'en', team: 0 };
        s.order.push(pid);
        if (st.mode === 'teams') s.players[pid].team = smallestTeam(s);
      } else {
        if (a.name) me.name = cleanStr(a.name, 24) || me.name;
        if (a.lang) me.lang = a.lang === 'ko' ? 'ko' : 'en';
      }
      return null;
    }
    case 'profile': {
      if (!me) return 'not-joined';
      if (a.name !== undefined) me.name = cleanStr(a.name, 24) || me.name;
      if (a.lang !== undefined) me.lang = a.lang === 'ko' ? 'ko' : 'en';
      if (a.team !== undefined && s.phase === 'lobby') me.team = clampInt(a.team, 0, MAX_TEAMS - 1, 0);
      return null;
    }
    case 'assign': {
      // Anyone in the room can move a player to another team (lobby, between turns, or after the game).
      if (!me || st.mode !== 'teams' || !['lobby', 'ready', 'over'].includes(s.phase)) return 'no';
      const who = s.players[a.pid];
      if (!who) return 'no';
      const to = clampInt(a.team, 0, st.teamCount - 1, 0);
      // Once the game has started, a team can't be left without enough players to take its turn.
      const need = st.style === 'hotseat' ? 2 : 1;
      if (s.phase !== 'lobby' && to !== who.team && members(s, who.team).length <= need) return st.style === 'hotseat' ? 'small-team' : 'empty-team';
      who.team = to;
      return null;
    }
    case 'shuffleTeams': {
      // Deal everyone out into even teams at random.
      if (!me || st.mode !== 'teams' || !['lobby', 'ready', 'over'].includes(s.phase)) return 'no';
      const ids = [...s.order];
      for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
      if (s.phase !== 'lobby' && ids.length < st.teamCount * (st.style === 'hotseat' ? 2 : 1)) return 'empty-team';
      const start = Math.floor(Math.random() * st.teamCount);
      ids.forEach((q, i) => { s.players[q].team = (start + i) % st.teamCount; });
      return null;
    }
    case 'renameTeam': {
      // Team names can change at any time.
      if (!me) return 'no';
      const t = clampInt(a.team, 0, MAX_TEAMS - 1, 0);
      const name = cleanStr(a.name, 20);
      if (name) st.teamNames[t] = name;
      return null;
    }
    case 'remove': {
      if (!me || s.phase !== 'lobby' || !s.players[a.pid] || a.pid === pid) return 'no';
      delete s.players[a.pid];
      s.order = s.order.filter((p) => p !== a.pid);
      return null;
    }
    case 'settings': {
      if (!me || s.phase !== 'lobby') return 'no';
      const p = a.patch || {};
      const toTeams = p.mode === 'teams' && st.mode !== 'teams';
      if (p.mode === 'coop' || p.mode === 'teams') st.mode = p.mode;
      if (STYLES.includes(p.style)) st.style = p.style;
      if (p.showAvoid !== undefined) st.showAvoid = !!p.showAvoid;
      if (p.teamCount !== undefined) st.teamCount = clampInt(p.teamCount, 2, MAX_TEAMS, 2);
      if (Array.isArray(p.teamNames)) st.teamNames = st.teamNames.map((n, i) => cleanStr(p.teamNames[i], 20) || n);
      if (p.seconds !== undefined) st.seconds = clampInt(p.seconds, 10, 600, 60);
      if (['free', 'limited', 'penalty'].includes(p.skipMode)) st.skipMode = p.skipMode;
      if (p.freeSkips !== undefined) st.freeSkips = clampInt(p.freeSkips, 0, 20, 1);
      if (p.tabooPenalty !== undefined) st.tabooPenalty = !!p.tabooPenalty;
      if (p.rounds !== undefined) st.rounds = clampInt(p.rounds, 0, 20, 3);
      // switching to teams: deal players out evenly; otherwise just keep everyone on a real team
      if (toTeams) s.order.forEach((q, i) => { s.players[q].team = i % st.teamCount; });
      else for (const q of s.order) if (s.players[q].team >= st.teamCount) s.players[q].team = smallestTeam(s);
      return null;
    }
    case 'start': {
      if (!me || s.phase !== 'lobby') return 'no';
      if (s.order.length < 2) return 'need-two';
      if (st.mode === 'teams') {
        for (let t = 0; t < st.teamCount; t++) if (!members(s, t).length) return 'empty-team';
        if (st.style === 'hotseat') for (let t = 0; t < st.teamCount; t++) if (members(s, t).length < 2) return 'small-team';
      }
      const n = teamCount(s);
      s.scores = Array(n).fill(0);
      s.rot = Array(n).fill(0);
      s.team = 0; s.turnsDone = 0; s.history = []; s.lastTurn = null; s.turn = null;
      s.phase = 'ready';
      return null;
    }
    case 'beginTurn': {
      if (s.phase !== 'ready' || explainerOf(s) !== pid) return 'not-your-turn';
      const cards = (Array.isArray(a.cards) ? a.cards : []).slice(0, 80).map(cleanCard).filter(Boolean);
      if (!cards.length) return 'no-cards';
      s.turn = { team: s.team, explainer: pid, seat: seatFor(s, pid, s.team), cards, idx: 0, log: [], endAt: now + st.seconds * 1000, remaining: st.seconds * 1000 };
      s.phase = 'playing';
      return null;
    }
    case 'mark': {
      if (s.phase !== 'playing' || !RESULTS.includes(a.result)) return 'no';
      if (now >= s.turn.endAt) { finishTurn(s); return null; }
      // Correct / skip: whoever runs the turn. Taboo (rule broken): also anyone else who can see the card.
      if (!(canRun(s, pid, s.turn) || (a.result === 'taboo' && canSee(s, pid, s.turn)))) return 'no';
      // ignore double taps aimed at a card that has already moved on
      if (a.idx !== undefined && a.idx !== s.turn.idx) return 'stale';
      s.turn.log.push({ card: s.turn.cards[s.turn.idx], result: a.result, by: pid });
      s.turn.idx += 1;
      if (s.turn.idx >= s.turn.cards.length) finishTurn(s);
      return null;
    }
    case 'undo': {
      if (s.phase !== 'playing' || !canRun(s, pid, s.turn) || !s.turn.log.length) return 'no';
      s.turn.log.pop();
      s.turn.idx -= 1;
      return null;
    }
    case 'pause': {
      if (s.phase !== 'playing' || !me) return 'no';
      s.turn.remaining = Math.max(0, s.turn.endAt - now);
      s.phase = 'paused';
      return null;
    }
    case 'resume': {
      if (s.phase !== 'paused' || !me) return 'no';
      s.turn.endAt = now + s.turn.remaining;
      s.phase = 'playing';
      return null;
    }
    case 'timeUp': {
      if (s.phase !== 'playing' || now < s.turn.endAt - 250) return 'no';
      finishTurn(s);
      return null;
    }
    case 'fix': {
      if (s.phase !== 'review' || !me || !RESULTS.includes(a.result)) return 'no';
      const e = s.turn.log[a.i];
      if (!e) return 'no';
      e.result = a.result;
      return null;
    }
    case 'confirm': {
      if (s.phase !== 'review' || !me) return 'no';
      const pts = total(scoreLog(s.turn.log, st));
      s.scores[s.turn.team] = (s.scores[s.turn.team] || 0) + pts;
      s.lastTurn = { team: s.turn.team, explainer: s.turn.explainer, pts, got: s.turn.log.filter((e) => e.result === 'correct').length };
      s.history.push({ ...s.lastTurn, words: s.turn.log.map((e) => ({ word: e.card.word, lang: e.card.lang, result: e.result })) });
      if (s.history.length > 60) s.history.shift();
      s.turnsDone += 1;
      nextTurn(s);
      return null;
    }
    case 'passTurn': {
      // explainer is away: move on to the next person on the same team
      if (s.phase !== 'ready' || !me) return 'no';
      s.rot[s.team] = (s.rot[s.team] || 0) + 1;
      return null;
    }
    case 'adjust': {
      if (!me || !['ready', 'review', 'over'].includes(s.phase)) return 'no';
      const t = clampInt(a.team, 0, teamCount(s) - 1, 0);
      s.scores[t] = (s.scores[t] || 0) + (a.delta > 0 ? 1 : -1);
      return null;
    }
    case 'endGame': {
      if (!me || s.phase === 'lobby') return 'no';
      endGame(s);
      return null;
    }
    case 'lobby': {
      if (!me) return 'no';
      if (s.phase !== 'over' && s.phase !== 'ready') return 'no';
      s.phase = 'lobby'; s.turn = null;
      return null;
    }
    default:
      return 'unknown';
  }
}

/**
 * What one player (or the main screen) is allowed to see. While a turn runs, the card goes to the explainer
 * and (in team games) to the other teams, who watch for taboo words — never to the guessers.
 */
export function viewFor(s, pid, { display = false } = {}) {
  const v = { ...s, turn: null, you: pid };
  if (!s.turn) return v;
  const t = s.turn;
  const running = s.phase === 'playing' || s.phase === 'paused';
  // The main screen is seen by the whole room: never the Taboo card (the guessers would see it),
  // but the Hot Seat / Who Am I? word, like the one-screen class view (the hot seat faces away).
  const seesCard = display ? s.settings.style !== 'taboo' : canSee(s, pid, t);
  v.turn = {
    team: t.team, explainer: t.explainer, seat: t.seat ?? null, idx: t.idx, endAt: t.endAt, remaining: t.remaining,
    cardsLeft: t.cards.length - t.idx,
    card: running && seesCard ? t.cards[t.idx] || null : null,
    // finished cards are fine to show; guessers only see results while the turn runs
    log: t.log.map((e) => (running && !seesCard ? { result: e.result } : e)),
  };
  return v;
}
