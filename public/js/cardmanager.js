// Card manager dialog shared by every game: browse, exclude, add, export/import.
import { SETS, SET_INFO, SET_LABEL, store, allCards, esc } from './core.js';

const HTML = `
<dialog id="cards-dlg" class="dlg">
  <div class="dlg-head">
    <h2>Manage cards</h2>
    <button class="btn ghost small" id="cards-close">Done</button>
  </div>
  <div class="tabs" id="cm-tabs"></div>
  <form id="add-form" class="add-form">
    <input id="add-word" placeholder="New word" required maxlength="40">
    <input id="add-taboo" placeholder="Taboo / clue words, separated by commas" required>
    <select id="add-level"></select>
    <button class="btn primary small">Add card</button>
  </form>
  <div class="cm-tools">
    <input type="search" id="cm-search" placeholder="Search this set…">
    <span class="muted" id="cm-count"></span>
    <button class="btn ghost small" id="cm-include-all">Include all</button>
    <button class="btn ghost small" id="cm-exclude-all">Exclude all</button>
  </div>
  <div id="cm-list" class="cm-list"></div>
  <div class="dlg-foot">
    <span class="muted">Shared by Taboo and Hot Seat. Saved in this browser.</span>
    <button class="btn ghost small" id="export">Export</button>
    <label class="btn ghost small">Import<input type="file" id="import" accept="application/json" hidden></label>
  </div>
</dialog>`;

let dlg = null;
let cmSet = 'A1';
let hooks = {};
const $ = (s) => document.querySelector(s);

function countText() {
  const ex = store.getExcluded();
  const inSet = allCards().filter((c) => c.level === cmSet);
  return `${inSet.filter((c) => !ex.has(c.id)).length} of ${inSet.length} included`;
}

function render() {
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
  $('#cm-count').textContent = countText();
  $('#cm-list').innerHTML = list.map((c) => `<div class="cm-row ${ex.has(c.id) ? 'off' : ''}">
      <label><input type="checkbox" data-cid="${esc(c.id)}" ${ex.has(c.id) ? '' : 'checked'}>
        <b>${esc(c.word)}</b>${c.custom ? '<span class="badge">added</span>' : ''}
        <span class="cm-taboo">${c.taboo.map(esc).join(' · ')}</span></label>
      ${c.custom ? `<button class="link small" data-del="${esc(c.id)}">Delete</button>` : ''}
    </div>`).join('') || `<p class="muted pad">${cmSet === 'MY' && !q ? 'No cards yet — add your own above.' : 'Nothing matches.'}</p>`;
}

function build() {
  document.body.insertAdjacentHTML('beforeend', HTML);
  dlg = $('#cards-dlg');
  $('#add-level').innerHTML = SETS.map((s) => `<option value="${s}">${s === 'MY' ? 'My cards' : `${s} — ${SET_INFO[s]}`}</option>`).join('');
  $('#cards-close').onclick = () => dlg.close();
  dlg.addEventListener('close', () => hooks.onClose?.());

  $('#cm-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]'); if (!b) return;
    cmSet = b.dataset.tab; $('#cm-search').value = ''; render();
  });
  $('#cm-search').addEventListener('input', render);
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
    render();
  });
  const bulk = (include) => {
    const ex = store.getExcluded();
    allCards().filter((c) => c.level === cmSet).forEach((c) => (include ? ex.delete(c.id) : ex.add(c.id)));
    store.setExcluded(ex); render();
  };
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
    hooks.onAdd?.(level);
    $('#add-word').value = ''; $('#add-taboo').value = '';
    cmSet = level; render(); $('#add-word').focus();
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
      render();
      alert(`Imported ${data.custom?.length || 0} cards and ${data.excluded?.length || 0} exclusions.`);
    } catch { alert('That file could not be read.'); }
    e.target.value = '';
  });
}

/** Open the shared card manager. hooks: { onAdd(level), onClose() } */
export function openCardManager(h = {}) {
  hooks = h;
  if (!dlg) build();
  render();
  dlg.showModal();
}
export const cardManagerOpen = () => !!dlg?.open;
