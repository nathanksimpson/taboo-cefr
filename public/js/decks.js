// Deck picker shared by both games: filter by level, search, sort, select.
import {
  SETS, SET_INFO, SET_NAME, SET_GROUP, BOOK_BY_ID, LEVEL_ORDER, LEVEL_COLORS, KO_LEVELS, allCards, store, esc, isDeck, deckCardIds,
} from './core.js';
import { openDeckBuilder } from './builder.js';

const VIEW_KEY = 'decks.view.v1';
const CEFR_COLORS = { A1: '#ffc61a', A2: '#ffa24d', B1: '#ff8577', B2: '#6b9bff', C1: '#9a6cff', C2: '#27c3c9',
  K1: '#ffd6e0', K2: '#ffb3c7', K3: '#ff8fb0', K4: '#f06a99', K5: '#d94d84', K6: '#b8336a' };
const KO = KO_LEVELS.length ? ['Korean'] : []; // Korean decks: Nadu edition only
const FILTERS = ['All', ...LEVEL_ORDER, 'CEFR', ...KO, 'MY', 'Selected'];
const FILTER_LABEL = { MY: 'My decks', Korean: '한국어' };
const SORTS = { level: 'Level order', az: 'A–Z', cards: 'Most cards' };

function loadView() {
  try { return { filter: 'All', sort: 'level', q: '', ...JSON.parse(localStorage.getItem(VIEW_KEY) || '{}') }; } catch { return { filter: 'All', sort: 'level', q: '' }; }
}
function saveView(v) { try { localStorage.setItem(VIEW_KEY, JSON.stringify({ filter: v.filter, sort: v.sort })); } catch { /* ignore */ } }

const colorOf = (s) => (BOOK_BY_ID[s] ? LEVEL_COLORS[BOOK_BY_ID[s].level] : CEFR_COLORS[s] || '#ff6fb5');
const darkTile = (s) => BOOK_BY_ID[s]?.level === 'Navy' || s === 'K6' || s === 'K5';

/**
 * Mount the picker into #deck-picker.
 * settings.sets is updated in place; save() persists and re-renders the rest of setup.
 */
export function setupDeckPicker({ settings, save, root = document.getElementById('deck-picker') }) {
  const view = loadView();
  view.q = '';

  root.innerHTML = `
    <div class="deck-tools">
      <div class="deck-filters" role="tablist" aria-label="Filter decks"></div>
      <div class="deck-row">
        <input type="search" class="deck-search" placeholder="Search decks, e.g. ${Object.keys(BOOK_BY_ID).length ? 'Write Now' : KO_LEVELS.length ? 'TOPIK' : 'B1'}" aria-label="Search decks">
        <label class="deck-sort">Sort <select>${Object.entries(SORTS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
        <button type="button" class="link small deck-clear">Clear selection</button>
      </div>
    </div>
    <div class="deck-list"></div>`;
  const filtersEl = root.querySelector('.deck-filters');
  const listEl = root.querySelector('.deck-list');
  const searchEl = root.querySelector('.deck-search');
  const sortEl = root.querySelector('.deck-sort select');
  sortEl.value = view.sort;

  function counts() {
    const ex = store.getExcluded();
    const map = {};
    for (const c of allCards()) {
      const m = (map[c.level] ||= { total: 0, active: 0 });
      m.total += 1; if (!ex.has(c.id)) m.active += 1;
    }
    const cards = allCards();
    for (const d of store.getDecks()) {
      const ids = deckCardIds(d, cards);
      map[d.id] = { total: ids.length, active: ids.filter((id) => !ex.has(id)).length };
    }
    return map;
  }

  function tile(s, cnt) {
    const on = settings.sets.includes(s);
    const c = cnt[s] || { total: 0, active: 0 };
    const book = BOOK_BY_ID[s];
    const deck = isDeck(s);
    const ko = SET_GROUP(s) === 'Korean';
    const title = book ? book.name : s === 'MY' ? 'My cards' : deck ? SET_NAME(s) : ko ? `TOPIK ${s.slice(1)}` : s;
    const sub = book ? `<span class="lvl-chip" style="--lc:${colorOf(s)}">${book.level}</span>` : `<span class="set-name">${s === 'MY' ? 'Cards you added' : deck ? 'Your deck' : ko ? `한국어 · ${SET_INFO[s].split('· ')[1]}` : `CEFR · ${SET_INFO[s]}`}</span>`;
    const btn = `<button type="button" class="set-tile ${on ? 'on' : ''} ${book || deck ? 'book' : ''} ${darkTile(s) ? 'dark' : ''}" style="--c:${colorOf(s)}" data-set="${s}" aria-pressed="${on}" title="${esc(SET_NAME(s))}">
      <span class="set-code">${esc(title)}</span>
      ${sub}
      <span class="set-count">${c.active}${c.active !== c.total ? ` / ${c.total}` : ''} card${c.total === 1 ? '' : 's'}</span>
    </button>`;
    return deck ? `<div class="tile-wrap">${btn}<button type="button" class="tile-edit" data-edit-deck="${esc(s)}" title="Edit this deck" aria-label="Edit ${esc(SET_NAME(s))}">✎</button></div>` : btn;
  }
  const newTile = '<button type="button" class="set-tile new-deck" data-new-deck><span class="set-code">＋ New deck</span><span class="set-name">Pick units, words or write your own</span></button>';

  function render() {
    const valid = settings.sets.filter((s) => SETS.includes(s));
    if (valid.length !== settings.sets.length) settings.sets = valid; // a deck was deleted
    const cnt = counts();
    const sel = settings.sets.length;
    filtersEl.innerHTML = FILTERS.map((f) => {
      const label = f === 'Selected' ? `Selected (${sel})` : FILTER_LABEL[f] || f;
      const dot = LEVEL_COLORS[f] ? `<span class="fdot" style="background:${LEVEL_COLORS[f]}"></span>` : '';
      return `<button type="button" role="tab" aria-selected="${view.filter === f}" class="${view.filter === f ? 'on' : ''}" data-filter="${f}">${dot}${label}</button>`;
    }).join('');

    const q = view.q.trim().toLowerCase();
    let sets = SETS.filter((s) => {
      if (view.filter === 'Selected' && !settings.sets.includes(s)) return false;
      if (!['All', 'Selected'].includes(view.filter) && SET_GROUP(s) !== view.filter) return false;
      if (q && !SET_NAME(s).toLowerCase().includes(q) && !(SET_INFO[s] || '').toLowerCase().includes(q)) return false;
      return true;
    });
    if (view.sort === 'az') sets.sort((a, b) => SET_NAME(a).localeCompare(SET_NAME(b)));
    if (view.sort === 'cards') sets.sort((a, b) => (cnt[b]?.active || 0) - (cnt[a]?.active || 0));

    if (!sets.length) {
      listEl.innerHTML = `<p class="muted pad">${view.filter === 'Selected' ? 'No decks selected yet.' : 'No decks match.'}</p>`;
      return;
    }
    if (view.sort === 'level') {
      const groups = [...LEVEL_ORDER, 'CEFR', ...KO, 'MY'];
      listEl.innerHTML = groups.map((g) => {
        const inG = sets.filter((s) => SET_GROUP(s) === g);
        if (!inG.length) return '';
        const head = LEVEL_COLORS[g] ? `<span class="fdot" style="background:${LEVEL_COLORS[g]}"></span>${g}` : g === 'CEFR' ? 'CEFR levels' : g === 'Korean' ? '한국어 · TOPIK levels' : 'My decks';
        const allOn = inG.every((s) => settings.sets.includes(s));
        return `<section class="deck-group">
          <div class="deck-group-head"><h3>${head}</h3>${inG.length > 1 ? `<button type="button" class="link small" data-group="${g}">${allOn ? 'Unselect all' : 'Select all'}</button>` : ''}</div>
          <div class="set-grid">${inG.map((s) => tile(s, cnt)).join('')}${g === 'MY' && view.filter !== 'Selected' && !q ? newTile : ''}</div>
        </section>`;
      }).join('');
    } else {
      listEl.innerHTML = `<div class="set-grid">${sets.map((s) => tile(s, cnt)).join('')}${['All', 'MY'].includes(view.filter) && !q ? newTile : ''}</div>`;
    }
  }

  const setSets = (next) => { settings.sets = SETS.filter((x) => next.includes(x)); save(); };

  filtersEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-filter]'); if (!b) return;
    view.filter = b.dataset.filter; saveView(view); render();
  });
  searchEl.addEventListener('input', () => { view.q = searchEl.value; render(); });
  sortEl.addEventListener('change', () => { view.sort = sortEl.value; saveView(view); render(); });
  root.querySelector('.deck-clear').onclick = () => setSets([]);
  const openBuilder = (id) => {
    const before = new Set(store.getDecks().map((d) => d.id));
    openDeckBuilder(id, {
      onClose(deckId) {
        // A brand-new deck with cards in it gets selected straight away.
        const d = store.getDecks().find((x) => x.id === deckId);
        if (d && !before.has(deckId) && deckCardIds(d).length && !settings.sets.includes(deckId)) settings.sets = [...settings.sets, deckId];
        settings.sets = settings.sets.filter((s) => SETS.includes(s));
        save();
      },
    });
  };
  listEl.addEventListener('click', (e) => {
    if (e.target.closest('[data-new-deck]')) { openBuilder(null); return; }
    const ed = e.target.closest('[data-edit-deck]');
    if (ed) { openBuilder(ed.dataset.editDeck); return; }
    const g = e.target.closest('[data-group]');
    if (g) {
      const inG = SETS.filter((s) => SET_GROUP(s) === g.dataset.group);
      const allOn = inG.every((s) => settings.sets.includes(s));
      setSets(allOn ? settings.sets.filter((s) => !inG.includes(s)) : [...settings.sets, ...inG]);
      return;
    }
    const t = e.target.closest('[data-set]'); if (!t) return;
    const s = t.dataset.set;
    setSets(settings.sets.includes(s) ? settings.sets.filter((x) => x !== s) : [...settings.sets, s]);
  });

  return render;
}

/** One-line summary of what's selected, for under the picker. */
export function deckSummary(sets, n) {
  if (!sets.length) return 'Pick at least one deck.';
  const names = sets.map(SET_NAME);
  const list = names.length <= 3 ? names.join(', ') : `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`;
  return `${n} cards in play from ${list}.`;
}
