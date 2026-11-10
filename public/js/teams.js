// Team names + colour picker, shared by both games' setup screens.
import { makeSortable } from './sortable.js';
import { esc, activeCards, langsIn, LANG_NAME, wordKey, SETS } from './core.js';
import { setupDeckPicker, deckSummary } from './decks.js';
import { has } from './edition.js';

export const PALETTE = [
  { c: '#ff5a4e', n: 'Red' },
  { c: '#ff8a3d', n: 'Orange' },
  { c: '#ffc61a', n: 'Yellow' },
  { c: '#7fd13b', n: 'Lime' },
  { c: '#1fb36b', n: 'Green' },
  { c: '#27c3c9', n: 'Teal' },
  { c: '#5b8cff', n: 'Blue' },
  { c: '#9a6cff', n: 'Purple' },
  { c: '#ff6fb5', n: 'Pink' },
  { c: '#b07a4f', n: 'Brown' },
];
const DEFAULT_ORDER = ['#ff5a4e', '#5b8cff', '#ffc61a', '#1fb36b', '#9a6cff', '#ff6fb5'];

/* ---------------- Nadu edition: each team's language and own decks ----------------
   In the Classroom edition these all answer "no": English, shared decks, no warnings. */
/** The language a team explains in (kept with the team's colour, so it follows reordering). */
export const teamLang = (settings, i) => (has('korean') ? settings.teamLangs?.[settings.colors?.[i]] || 'en' : undefined);

/** A team's own decks, or null if it uses the shared ones (also kept with the team's colour). */
export const teamOwnSets = (settings, i) => {
  if (!has('korean')) return null;
  const own = settings.teamDecks?.[settings.colors?.[i]];
  return own ? own.filter((s) => SETS.includes(s)) : null;
};
/** The decks a team draws from. */
export const teamSets = (settings, i) => teamOwnSets(settings, i) || settings.sets;
/** Every deck any team draws from (the game's shared pile). */
export function allSets(settings) {
  if (!settings.teams.some((_, i) => teamOwnSets(settings, i))) return settings.sets; // the usual case
  const out = new Set();
  settings.teams.forEach((_, i) => teamSets(settings, i).forEach((s) => out.add(s)));
  return SETS.filter((s) => out.has(s));
}

/** Warnings (one line each) for teams whose language or decks won't work as set. */
export function langWarning(settings) {
  if (!has('korean')) return [];
  const notes = [];
  settings.teams.forEach((t, i) => {
    const cards = activeCards(teamSets(settings, i));
    const name = t || `Team ${i + 1}`;
    if (!cards.length) { notes.push(`${name} has no cards: pick some decks for it.`); return; }
    const have = langsIn(cards);
    const l = teamLang(settings, i);
    if (!have.includes(l)) notes.push(`${name} explains in ${LANG_NAME[l]}, but its decks have no ${LANG_NAME[l]} cards, so it'll get ${have.map((x) => LANG_NAME[x]).join(' / ')} cards.`);
  });
  return notes;
}
/** True if every team has at least one card to draw. */
export const everyTeamHasCards = (settings) => settings.teams.every((_, i) => activeCards(teamSets(settings, i)).length > 0);
/** "Team 2 uses its own decks: TOPIK 1 (35 cards)." for the setup summary. */
export function ownDecksNote(settings) {
  return settings.teams.map((t, i) => {
    const own = teamOwnSets(settings, i);
    if (!own) return '';
    return `${t || `Team ${i + 1}`} uses its own decks: ${deckSummary(own, activeCards(own).length)}`;
  }).filter(Boolean);
}

/** Each team's word filter during a game: only words from its own decks, in its language. */
const POOLS = new Map(); // decks → { word keys, languages }, kept out of the saved game
export function teamFilter(game, team) {
  const sets = team?.sets || game.settings.sets;
  const key = sets.join('|');
  let pool = POOLS.get(key);
  if (!pool) {
    const cards = activeCards(sets);
    pool = { keys: new Set(cards.map((c) => wordKey(c.word))), langs: langsIn(cards) };
    POOLS.set(key, pool);
  }
  const own = key !== game.settings.sets.join('|');
  const lang = team?.lang && pool.langs.includes(team.lang) ? team.lang : null;
  if (!own && !lang) return null;
  return (c) => (!own || pool.keys.has(wordKey(c.word))) && (!lang || (c.lang || (/[\u3131-\u318e\uac00-\ud7a3]/.test(c.word) ? 'ko' : 'en')) === lang);
}

/* ---------------- a team's own decks (dialog) ---------------- */
let tdDlg = null;
function openTeamDecks(settings, i, done) {
  if (!tdDlg) {
    document.body.insertAdjacentHTML('beforeend', `<dialog id="team-decks-dlg" class="dlg team-decks">
      <div class="dlg-head"><h2 id="td-title"></h2><button type="button" class="btn primary small" id="td-done">Done</button></div>
      <div class="td-body">
        <label class="check td-shared"><input type="checkbox" id="td-shared"> <span>Same decks as everyone</span></label>
        <p class="hint" id="td-note"></p>
        <div id="td-picker"></div>
      </div></dialog>`);
    tdDlg = document.getElementById('team-decks-dlg');
    tdDlg.querySelector('#td-done').onclick = () => tdDlg.close();
  }
  const color = settings.colors[i];
  const state = { sets: [...(teamOwnSets(settings, i) || settings.sets)] };
  let shared = !teamOwnSets(settings, i);
  const $d = (s) => tdDlg.querySelector(s);
  const commit = () => {
    const td = { ...(settings.teamDecks || {}) };
    if (shared) delete td[color]; else td[color] = [...state.sets];
    settings.teamDecks = td;
    // own decks all in one language: the team explains in that language
    if (!shared) {
      const langs = langsIn(activeCards(state.sets));
      if (langs.length === 1) settings.teamLangs = { ...(settings.teamLangs || {}), [color]: langs[0] };
    }
  };
  const show = () => {
    $d('#td-shared').checked = shared;
    $d('#td-picker').hidden = shared;
    $d('#td-note').textContent = shared
      ? 'This team uses the decks picked in step 1. Untick to give it its own.'
      : deckSummary(state.sets, activeCards(state.sets).length);
  };
  $d('#td-title').textContent = `${settings.teams[i] || `Team ${i + 1}`}: decks`;
  const renderPicker = setupDeckPicker({ settings: state, save: () => { commit(); renderPicker(); show(); }, root: $d('#td-picker') });
  $d('#td-shared').onchange = (e) => { shared = e.target.checked; if (!shared) state.sets = [...settings.sets]; commit(); renderPicker(); show(); };
  renderPicker(); show();
  tdDlg.onclose = () => { commit(); done(); };
  tdDlg.showModal();
}


/** Make sure settings.colors has one distinct colour per team. */
export function ensureColors(settings) {
  const out = [];
  (settings.teams || []).forEach((_, i) => {
    let c = settings.colors?.[i];
    if (!c || out.includes(c)) c = [...DEFAULT_ORDER, ...PALETTE.map((p) => p.c)].find((x) => !out.includes(x));
    out.push(c);
  });
  settings.colors = out;
  return out;
}

/**
 * Wire up the Teams panel. Expects #team-names, #team-count, #team-minus, #team-plus.
 * save(): persist settings and re-render the rest of setup.
 * onReorder(order): teams moved or one removed — order[newIndex] = oldIndex.
 */
export function setupTeams({ settings, save, persist, onReorder = () => {}, min = 2, max = 6 }) {
  const $ = (s) => document.querySelector(s);
  const root = $('#team-names');
  let openPicker = null;

  function render() {
    ensureColors(settings);
    $('#team-count').textContent = settings.teams.length;
    root.innerHTML = settings.teams.map((t, i) => {
      const color = settings.colors[i];
      const name = PALETTE.find((p) => p.c === color)?.n || 'Colour';
      const last = settings.teams.length - 1;
      return `<div class="team-name" data-row="${i}" style="--team:${color}">
        <span class="drag-handle" data-drag="${i}" tabindex="0" role="button" title="Drag to reorder" aria-label="Move ${esc(t)}: drag, or use the arrow keys">⠿</span>
        <span class="team-order" aria-hidden="true">${i + 1}</span>
        <button type="button" class="swatch" data-pick="${i}" aria-label="Team ${i + 1} colour: ${name}. Change colour" aria-expanded="${openPicker === i}"></button>
        <input data-team="${i}" value="${esc(t)}" maxlength="24" aria-label="Team ${i + 1} name">
        ${has('korean') ? `<button type="button" class="team-decks-btn ${teamOwnSets(settings, i) ? 'own' : ''}" data-tdecks="${i}" title="Pick the decks this team draws from">${teamOwnSets(settings, i) ? `Own decks · ${activeCards(teamOwnSets(settings, i)).length}` : 'Shared decks'}</button>
        <span class="seg team-lang" role="group" aria-label="${esc(t)} explains in">${['en', 'ko'].map((l) => `<button type="button" data-tlang="${l}" data-for="${i}" class="${teamLang(settings, i) === l ? 'on' : ''}" title="Explains in ${LANG_NAME[l]}">${l === 'en' ? 'EN' : '한국어'}</button>`).join('')}</span>` : ''}
        ${openPicker === i ? `<div class="palette" role="listbox" aria-label="Pick a colour">${PALETTE.map((p) => {
          const owner = settings.colors.indexOf(p.c);
          const taken = owner !== -1 && owner !== i;
          return `<button type="button" class="pal ${p.c === color ? 'on' : ''} ${taken ? 'taken' : ''}" style="--c:${p.c}" data-color="${p.c}" data-for="${i}" title="${p.n}${taken ? ` (swap with ${esc(settings.teams[owner])})` : ''}" aria-label="${p.n}"></button>`;
        }).join('')}</div>` : ''}
      </div>`;
    }).join('');
  }

  // Move a team (name and colour together) to a new position.
  function moveTeam(from, to) {
    if (to < 0 || to >= settings.teams.length || from === to) return;
    const [n] = settings.teams.splice(from, 1); settings.teams.splice(to, 0, n);
    const [c] = settings.colors.splice(from, 1); settings.colors.splice(to, 0, c);
    const order = settings.teams.map((_, i) => i); const [o] = order.splice(from, 1); order.splice(to, 0, o);
    openPicker = null; save(); render(); onReorder(order);
    root.querySelector(`[data-drag="${to}"]`)?.focus();
  }

  // Drag to reorder: the team you hold floats under the pointer and the others slide out of the way.
  makeSortable(root, {
    items: '.team-name',
    ignore: 'input, button, .palette, .team-lang, .team-decks-btn',
    onChange: () => root.querySelectorAll('.team-order').forEach((el, i) => { el.textContent = i + 1; }),
    onDrop: (order) => {
      if (openPicker !== null) openPicker = null;
      settings.teams = order.map((i) => settings.teams[i]);
      settings.colors = order.map((i) => settings.colors[i]);
      save(); render(); onReorder(order);
    },
    onKey: (i, dir) => moveTeam(i, i + dir),
  });

  root.addEventListener('click', (e) => {
    const td = e.target.closest('[data-tdecks]');
    if (td) { openTeamDecks(settings, +td.dataset.tdecks, () => { save(); render(); }); return; }
    const tl = e.target.closest('[data-tlang]');
    if (tl) {
      settings.teamLangs = { ...(settings.teamLangs || {}), [settings.colors[+tl.dataset.for]]: tl.dataset.tlang };
      save(); render(); return;
    }
    const sw = e.target.closest('[data-pick]');
    const pal = e.target.closest('[data-color]');
    if (sw) { const i = +sw.dataset.pick; openPicker = openPicker === i ? null : i; render(); return; }
    if (pal) {
      const i = +pal.dataset.for;
      const c = pal.dataset.color;
      const owner = settings.colors.indexOf(c);
      if (owner !== -1 && owner !== i) settings.colors[owner] = settings.colors[i]; // swap
      settings.colors[i] = c;
      openPicker = null;
      save(); render();
    }
  });
  document.addEventListener('click', (e) => {
    if (openPicker !== null && !e.target.closest('.team-name')) { openPicker = null; render(); }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && openPicker !== null) { openPicker = null; render(); } });
  root.addEventListener('input', (e) => {
    const i = e.target.dataset.team; if (i == null) return;
    settings.teams[i] = e.target.value; persist();
  });
  $('#team-minus').onclick = () => {
    if (settings.teams.length > min) {
      settings.teams.pop(); settings.colors.pop(); openPicker = null; save(); render();
      onReorder(settings.teams.map((_, i) => i));
    }
  };
  $('#team-plus').onclick = () => {
    if (settings.teams.length < max) { settings.teams.push(`Team ${settings.teams.length + 1}`); ensureColors(settings); save(); render(); }
  };

  // Shuffle button + "shuffle at the start of each game" option.
  $('#team-count').closest('.stepper').insertAdjacentHTML('beforebegin',
    '<button type="button" class="btn ghost small" id="team-shuffle" title="Put the teams in a random order">🔀 Shuffle order</button>');
  root.insertAdjacentHTML('afterend',
    '<label class="check team-random"><input type="checkbox" id="team-random"> Shuffle the team order automatically when each game starts</label>');
  $('#team-shuffle').onclick = () => {
    const order = settings.teams.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    if (order.every((v, i) => v === i) && order.length > 1) order.push(order.shift()); // always change something
    settings.teams = order.map((i) => settings.teams[i]);
    settings.colors = order.map((i) => settings.colors[i]);
    openPicker = null; save(); render(); onReorder(order);
  };
  $('#team-random').checked = !!settings.randomOrder;
  $('#team-random').onchange = (e) => { settings.randomOrder = e.target.checked; save(); };

  render();
  return render;
}
