// Deck builder: make your own named decks from units, single words and new cards.
import {
  BOOKS, LEVELS, LEVEL_ORDER, BOOK_BY_ID, SET_LABEL, store, allCards, deckCardIds, wordKey, esc,
} from './core.js';

const HTML = `
<dialog id="builder-dlg" class="dlg builder">
  <div class="dlg-head bd-head">
    <label class="bd-name-wrap"><span class="sr">Deck name</span>
      <input id="bd-name" maxlength="40" placeholder="Deck name, e.g. Week 10 Review"></label>
    <div class="bd-head-btns">
      <button class="btn ghost small" id="bd-delete" type="button">Delete deck</button>
      <button class="btn primary small" id="bd-done" type="button">Done</button>
    </div>
  </div>
  <div class="bd-body">
    <section class="bd-pane bd-source" aria-label="Add words">
      <div class="bd-tools">
        <h3>Add words</h3>
        <div class="bd-row">
          <select id="bd-src" aria-label="Book or level"></select>
          <input type="search" id="bd-q" placeholder="Search every deck…" aria-label="Search every deck">
        </div>
        <div class="bd-units" id="bd-units"></div>
        <div class="bd-row bd-row-end">
          <span class="muted" id="bd-src-count"></span>
          <button class="btn small" id="bd-add-all" type="button">Add all shown</button>
        </div>
      </div>
      <div class="bd-list" id="bd-src-list"></div>
    </section>
    <section class="bd-pane bd-deck" aria-label="In this deck">
      <div class="bd-tools">
        <h3>In this deck <span class="bd-count" id="bd-count">0</span></h3>
        <form class="bd-own" id="bd-own">
          <input id="bd-own-word" placeholder="Your own word" maxlength="40" required>
          <input id="bd-own-taboo" placeholder="3 taboo words, comma-separated" required>
          <button class="btn primary small">Add</button>
        </form>
        <div class="bd-row bd-row-end">
          <span class="muted" id="bd-dupes"></span>
          <button class="link small" id="bd-clear" type="button">Remove all</button>
        </div>
      </div>
      <div class="bd-list" id="bd-deck-list"></div>
    </section>
  </div>
</dialog>`;

let dlg = null;
let deck = null;
let startedNew = false;
let hooks = {};
let src = 'B1';
let unit = '';
const $ = (s) => dlg.querySelector(s);

const saveDeck = () => {
  const decks = store.getDecks();
  const i = decks.findIndex((d) => d.id === deck.id);
  if (i === -1) decks.push(deck); else decks[i] = deck;
  store.setDecks(decks);
};

function sourceCards(cards) {
  const q = $('#bd-q').value.trim().toLowerCase();
  const notMine = cards.filter((c) => c.level !== deck.id);
  if (q) return notMine.filter((c) => c.word.toLowerCase().includes(q)).slice(0, 200);
  return notMine.filter((c) => c.level === src && (!unit || c.unit === unit));
}

function render() {
  const cards = allCards();
  const byId = new Map(cards.map((c) => [c.id, c]));
  const inDeck = deckCardIds(deck, cards);
  const inSet = new Set(inDeck);
  const keys = new Set(inDeck.map((id) => wordKey(byId.get(id).word)));
  const q = $('#bd-q').value.trim();

  // units for the chosen book
  const book = BOOK_BY_ID[src];
  const units = book ? [...new Set(cards.filter((c) => c.level === src).map((c) => c.unit))] : [];
  $('#bd-units').hidden = !units.length || !!q;
  $('#bd-units').innerHTML = `<button type="button" class="${unit ? '' : 'on'}" data-unit="">All units</button>` +
    units.map((u) => `<button type="button" class="${u === unit ? 'on' : ''}" data-unit="${esc(u)}">${esc(u)}</button>`).join('');

  const list = sourceCards(cards);
  const toAdd = list.filter((c) => !inSet.has(c.id) && !keys.has(wordKey(c.word)));
  $('#bd-src-count').textContent = q ? `${list.length} match${list.length === 1 ? '' : 'es'}` : `${list.length} words`;
  $('#bd-add-all').textContent = toAdd.length ? `Add all shown (${toAdd.length})` : 'All added';
  $('#bd-add-all').disabled = !toAdd.length;
  $('#bd-src-list').innerHTML = list.map((c) => {
    const added = inSet.has(c.id);
    const dupe = !added && keys.has(wordKey(c.word));
    return `<button type="button" class="bw ${added ? 'added' : ''}" data-add="${esc(c.id)}" ${added || dupe ? 'aria-disabled="true"' : ''} title="${dupe ? 'This word is already in the deck' : added ? 'Already in the deck' : 'Add to deck'}">
      <span class="bw-mark">${added ? '✓' : dupe ? '=' : '+'}</span>
      <span class="bw-word">${esc(c.word)}</span>
      <span class="bw-meta">${esc(q ? SET_LABEL(c.level) : c.unit || '')}</span>
    </button>`;
  }).join('') || `<p class="muted pad">${q ? 'No words match.' : 'No words here.'}</p>`;

  // the deck itself
  $('#bd-count').textContent = inDeck.length;
  $('#bd-clear').hidden = !inDeck.length;
  const sorted = inDeck.map((id) => byId.get(id)).sort((a, b) => a.word.localeCompare(b.word));
  $('#bd-deck-list').innerHTML = sorted.map((c) => `<div class="bw in">
      <span class="bw-word">${esc(c.word)}${c.level === deck.id ? '<span class="badge">yours</span>' : ''}</span>
      <span class="bw-meta">${c.level === deck.id ? esc(c.taboo.join(' · ')) : esc(SET_LABEL(c.level))}</span>
      <button type="button" class="bw-x" data-remove="${esc(c.id)}" aria-label="Remove ${esc(c.word)}">×</button>
    </div>`).join('') || '<p class="muted pad">Pick words on the left, or add your own above.</p>';
  $('#bd-dupes').textContent = inDeck.length ? `${inDeck.length} card${inDeck.length === 1 ? '' : 's'}` : '';
}

function addIds(ids) {
  const cards = allCards();
  const byId = new Map(cards.map((c) => [c.id, c]));
  const have = new Set(deckCardIds(deck, cards).map((id) => wordKey(byId.get(id).word)));
  for (const id of ids) {
    const c = byId.get(id); if (!c) continue;
    const k = wordKey(c.word);
    if (have.has(k)) continue;
    have.add(k);
    deck.cardIds.push(id);
  }
  saveDeck(); render();
}

function removeId(id) {
  deck.cardIds = deck.cardIds.filter((x) => x !== id);
  const custom = store.getCustom();
  if (custom.some((c) => c.id === id && c.level === deck.id)) store.setCustom(custom.filter((c) => c.id !== id));
  saveDeck(); render();
}

function build() {
  document.body.insertAdjacentHTML('beforeend', HTML);
  dlg = document.getElementById('builder-dlg');

  const opt = (v, t) => `<option value="${v}">${esc(t)}</option>`;
  $('#bd-src').innerHTML =
    LEVEL_ORDER.map((lvl) => `<optgroup label="${lvl}">${BOOKS.filter((b) => b.level === lvl).map((b) => opt(b.id, b.name)).join('')}</optgroup>`).join('') +
    `<optgroup label="CEFR">${LEVELS.map((l) => opt(l, `CEFR ${l}`)).join('')}</optgroup>` +
    `<optgroup label="Your own">${opt('MY', 'My cards')}</optgroup>`;

  $('#bd-src').addEventListener('change', (e) => { src = e.target.value; unit = ''; $('#bd-q').value = ''; render(); $('#bd-src-list').scrollTop = 0; });
  $('#bd-q').addEventListener('input', render);
  $('#bd-units').addEventListener('click', (e) => {
    const b = e.target.closest('[data-unit]'); if (!b) return;
    unit = b.dataset.unit; render(); $('#bd-src-list').scrollTop = 0;
  });
  $('#bd-src-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-add]'); if (!b || b.getAttribute('aria-disabled')) return;
    addIds([b.dataset.add]);
  });
  $('#bd-add-all').onclick = () => addIds(sourceCards(allCards()).map((c) => c.id));
  $('#bd-deck-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-remove]'); if (b) removeId(b.dataset.remove);
  });
  $('#bd-clear').onclick = () => {
    if (!confirm('Remove every card from this deck? Cards you wrote for it will be deleted.')) return;
    deck.cardIds = [];
    store.setCustom(store.getCustom().filter((c) => c.level !== deck.id));
    saveDeck(); render();
  };
  $('#bd-own').addEventListener('submit', (e) => {
    e.preventDefault();
    const word = $('#bd-own-word').value.trim();
    const taboo = $('#bd-own-taboo').value.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 5);
    if (!word || !taboo.length) return;
    const custom = store.getCustom();
    custom.push({ id: `C:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, level: deck.id, word, taboo });
    store.setCustom(custom);
    $('#bd-own-word').value = ''; $('#bd-own-taboo').value = '';
    saveDeck(); render(); $('#bd-own-word').focus();
  });
  $('#bd-name').addEventListener('input', (e) => { deck.name = e.target.value.trim() || 'Untitled deck'; saveDeck(); });
  $('#bd-done').onclick = () => dlg.close();
  $('#bd-delete').onclick = () => {
    if (!confirm(`Delete "${deck.name}"? Cards you wrote for it will be deleted too.`)) return;
    store.setCustom(store.getCustom().filter((c) => c.level !== deck.id));
    store.setDecks(store.getDecks().filter((d) => d.id !== deck.id));
    deck = null;
    dlg.close();
  };
  dlg.addEventListener('close', () => {
    // A new deck closed without any cards isn't kept.
    if (deck && startedNew && !deckCardIds(deck).length) {
      store.setDecks(store.getDecks().filter((d) => d.id !== deck.id));
      deck = null;
    }
    hooks.onClose?.(deck?.id || null);
  });
}

/** Open the builder for an existing deck id, or with no id to start a new deck. */
export function openDeckBuilder(id = null, h = {}) {
  hooks = h;
  if (!dlg) build();
  const decks = store.getDecks();
  deck = id ? decks.find((d) => d.id === id) : null;
  const isNew = !deck;
  startedNew = isNew;
  if (isNew) {
    deck = { id: `D:${Date.now().toString(36)}`, name: `My deck ${decks.length + 1}`, cardIds: [] };
    saveDeck();
  }
  deck.cardIds ||= [];
  $('#bd-name').value = deck.name;
  $('#bd-q').value = '';
  $('#bd-src').value = src; unit = '';
  render();
  dlg.showModal();
  if (isNew) { $('#bd-name').focus(); $('#bd-name').select(); }
}
export const builderOpen = () => !!dlg?.open;
