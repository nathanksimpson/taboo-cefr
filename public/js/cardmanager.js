// Manage cards: decks first, then the cards inside a deck.
//   Decks view  — ＋ New deck, your own decks, then every built-in deck by group.
//   Deck view   — open a deck to add cards, search, and switch cards on or off.
// Your own decks open in the deck builder (pick units, words, or write your own cards).
import {
  SETS, SET_NAME, SET_GROUP, SET_INFO, LEVEL_ORDER, LEVEL_COLORS, BOOK_BY_ID, store, allCards, esc, isDeck, deckCardIds, phraseProblem, singleWordInput,
} from './core.js';
import { openDeckBuilder } from './builder.js';

const HTML = `
<dialog id="cards-dlg" class="dlg cm">
  <div class="dlg-head">
    <div class="cm-head-left">
      <button class="btn ghost small" id="cm-back" type="button" hidden>← Decks</button>
      <h2 id="cm-title">Manage cards</h2>
    </div>
    <button class="btn primary small" id="cards-close" type="button">Done</button>
  </div>

  <div id="cm-decks-view" class="cm-view">
    <div class="cm-tools"><input type="search" id="cm-deck-search" placeholder="Search decks…" aria-label="Search decks"></div>
    <div id="cm-decks" class="cm-decks"></div>
  </div>

  <div id="cm-deck-view" class="cm-view" hidden>
    <form id="add-form" class="add-form">
      <input id="add-word" placeholder="New word" required maxlength="40" aria-label="New word">
      <input id="add-taboo" placeholder="Taboo words (one word each), separated by commas" required aria-label="Taboo / clue words, separated by commas">
      <button class="btn primary small">Add card</button>
    </form>
    <div class="cm-tools">
      <input type="search" id="cm-search" placeholder="Search this deck…" aria-label="Search this deck">
      <span class="muted" id="cm-count"></span>
      <button class="btn ghost small" id="cm-include-all" type="button">Include all</button>
      <button class="btn ghost small" id="cm-exclude-all" type="button">Exclude all</button>
    </div>
    <div id="cm-list" class="cm-list"></div>
  </div>

  <div class="dlg-foot">
    <span class="muted">Shared by every game. Saved in this browser.</span>
    <button class="btn ghost small" id="export" type="button">Export</button>
    <label class="btn ghost small">Import<input type="file" id="import" accept="application/json" hidden></label>
  </div>
</dialog>`;

let dlg = null;
let open = null; // the deck being viewed, or null for the deck list
let hooks = {};
const $ = (s) => document.querySelector(s);

const CEFR_C = { A1: '#ffc61a', A2: '#ffa24d', B1: '#ff8577', B2: '#6b9bff', C1: '#9a6cff', C2: '#27c3c9' };
const colorOf = (s) => (BOOK_BY_ID[s] ? LEVEL_COLORS[BOOK_BY_ID[s].level] : CEFR_C[s] || (SET_GROUP(s) === 'Korean' ? '#ff8fb0' : '#d8cfff'));

function deckCards(s) {
  const cards = allCards();
  if (isDeck(s)) {
    const d = store.getDecks().find((x) => x.id === s);
    const ids = new Set(d ? deckCardIds(d, cards) : []);
    return cards.filter((c) => ids.has(c.id));
  }
  return cards.filter((c) => c.level === s);
}

function tile(s) {
  const ex = store.getExcluded();
  const cards = deckCards(s);
  const on = cards.filter((c) => !ex.has(c.id)).length;
  const book = BOOK_BY_ID[s];
  const sub = book ? book.level : isDeck(s) ? 'Your deck' : s === 'MY' ? 'Cards you added' : SET_INFO[s] || '';
  return `<button type="button" class="cm-deck" data-open="${esc(s)}" style="--c:${colorOf(s)}">
    <span class="cm-deck-name">${esc(book ? book.name : SET_NAME(s))}</span>
    <span class="cm-deck-sub">${esc(sub)}</span>
    <span class="cm-deck-count">${on === cards.length ? `${cards.length} cards` : `${on} of ${cards.length} included`}</span>
  </button>`;
}

function renderDecks() {
  const q = $('#cm-deck-search').value.trim().toLowerCase();
  const match = (s) => !q || SET_NAME(s).toLowerCase().includes(q) || String(SET_INFO[s] || '').toLowerCase().includes(q);
  const mine = SETS.filter((s) => (isDeck(s) || s === 'MY') && match(s));
  const groups = [...LEVEL_ORDER, 'CEFR', 'Korean'];
  const head = (g) => (LEVEL_COLORS[g] ? `<span class="fdot" style="background:${LEVEL_COLORS[g]}"></span>${g}` : g === 'CEFR' ? 'CEFR levels' : '한국어 · TOPIK levels');
  const newTile = q ? '' : '<button type="button" class="cm-deck cm-new" data-new><span class="cm-deck-name">＋ New deck</span><span class="cm-deck-sub">Name it, then add cards</span></button>';
  let html = `<section class="cm-group"><h3>My decks</h3><div class="cm-grid">${newTile}${mine.map(tile).join('')}</div></section>`;
  for (const g of groups) {
    const inG = SETS.filter((s) => !isDeck(s) && s !== 'MY' && SET_GROUP(s) === g && match(s));
    if (inG.length) html += `<section class="cm-group"><h3>${head(g)}</h3><div class="cm-grid">${inG.map(tile).join('')}</div></section>`;
  }
  $('#cm-decks').innerHTML = html;
}

function countText() {
  const ex = store.getExcluded();
  const inSet = deckCards(open);
  return `${inSet.filter((c) => !ex.has(c.id)).length} of ${inSet.length} included`;
}

function renderDeck() {
  const ex = store.getExcluded();
  const q = $('#cm-search').value.trim().toLowerCase();
  const list = deckCards(open)
    .filter((c) => !q || c.word.toLowerCase().includes(q) || c.taboo.join(' ').toLowerCase().includes(q))
    .sort((a, b) => a.word.localeCompare(b.word));
  $('#cm-count').textContent = countText();
  $('#cm-list').innerHTML = list.map((c) => `<div class="cm-row ${ex.has(c.id) ? 'off' : ''}">
      <label><input type="checkbox" data-cid="${esc(c.id)}" ${ex.has(c.id) ? '' : 'checked'}>
        <b>${esc(c.word)}</b>${c.custom ? '<span class="badge">added</span>' : ''}
        <span class="cm-taboo">${c.taboo.map(esc).join(' · ')}</span></label>
      ${c.custom ? `<button class="link small" data-del="${esc(c.id)}" type="button">Delete</button>` : ''}
    </div>`).join('') || `<p class="muted pad">${q ? 'Nothing matches.' : 'No cards yet — add your first one above.'}</p>`;
}

function render() {
  const inDeck = !!open;
  $('#cm-decks-view').hidden = inDeck;
  $('#cm-deck-view').hidden = !inDeck;
  $('#cm-back').hidden = !inDeck;
  $('#cm-title').textContent = inDeck ? SET_NAME(open) : 'Manage cards';
  if (inDeck) renderDeck(); else renderDecks();
}

function openDeck(s) {
  if (isDeck(s)) {
    // your own decks have their own editor: units, single words and cards you write
    openDeckBuilder(s, { onClose: () => { hooks.onClose?.(); render(); } });
    return;
  }
  open = s;
  $('#cm-search').value = '';
  render();
  $('#add-word').focus();
}

function build() {
  document.body.insertAdjacentHTML('beforeend', HTML);
  dlg = $('#cards-dlg');
  $('#cards-close').onclick = () => dlg.close();
  $('#cm-back').onclick = () => { open = null; render(); };
  dlg.addEventListener('close', () => hooks.onClose?.());
  dlg.addEventListener('cancel', (e) => { if (open) { e.preventDefault(); open = null; render(); } }); // Esc goes back a level first

  $('#cm-deck-search').addEventListener('input', renderDecks);
  $('#cm-decks').addEventListener('click', (e) => {
    if (e.target.closest('[data-new]')) {
      openDeckBuilder(null, { onClose: (id) => { hooks.onClose?.(id); render(); } });
      return;
    }
    const t = e.target.closest('[data-open]');
    if (t) openDeck(t.dataset.open);
  });

  $('#cm-search').addEventListener('input', renderDeck);
  $('#cm-list').addEventListener('change', (e) => {
    const id = e.target.dataset.cid; if (!id) return;
    const ex = store.getExcluded();
    if (e.target.checked) ex.delete(id); else ex.add(id);
    store.setExcluded(ex);
    e.target.closest('.cm-row').classList.toggle('off', !e.target.checked);
    $('#cm-count').textContent = countText();
  });
  $('#cm-list').addEventListener('click', (e) => {
    const id = e.target.dataset?.del; if (!id) return;
    store.setCustom(store.getCustom().filter((c) => c.id !== id));
    renderDeck();
  });
  const bulk = (include) => {
    const ex = store.getExcluded();
    deckCards(open).forEach((c) => (include ? ex.delete(c.id) : ex.add(c.id)));
    store.setExcluded(ex); renderDeck();
  };
  $('#cm-include-all').onclick = () => bulk(true);
  $('#cm-exclude-all').onclick = () => bulk(false);

  singleWordInput($('#add-taboo'));
  $('#add-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const word = $('#add-word').value.trim();
    const taboo = $('#add-taboo').value.split(',').map((s) => s.trim()).filter(Boolean);
    if (!word || !taboo.length || !open) return;
    if (phraseProblem(taboo)) { $('#add-taboo').setCustomValidity(phraseProblem(taboo)); $('#add-taboo').reportValidity(); return; }
    const custom = store.getCustom();
    custom.push({ id: `C:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, level: open, word, taboo });
    store.setCustom(custom);
    hooks.onAdd?.(open);
    $('#add-word').value = ''; $('#add-taboo').value = '';
    renderDeck(); $('#add-word').focus();
  });

  $('#export').onclick = () => {
    const data = { app: 'taboo-cefr', version: 2, custom: store.getCustom(), excluded: [...store.getExcluded()], decks: store.getDecks() };
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
      const decks = store.getDecks(); const haveD = new Set(decks.map((d) => d.id));
      (data.decks || []).forEach((d) => { if (d.id && d.name && !haveD.has(d.id)) decks.push(d); }); store.setDecks(decks);
      render();
      alert(`Imported ${data.custom?.length || 0} cards, ${data.decks?.length || 0} decks and ${data.excluded?.length || 0} exclusions.`);
    } catch { alert('That file could not be read.'); }
    e.target.value = '';
  });
}

/** Open Manage cards at the deck list. hooks: { onAdd(deck), onClose() } */
export function openCardManager(h = {}) {
  hooks = h;
  if (!dlg) build();
  open = null;
  $('#cm-deck-search').value = '';
  render();
  dlg.showModal();
}

export const cardManagerOpen = () => !!dlg?.open;
