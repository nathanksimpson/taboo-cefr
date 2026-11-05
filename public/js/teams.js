// Team names + colour picker, shared by both games' setup screens.
import { esc } from './core.js';

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
 */
export function setupTeams({ settings, save, persist, min = 2, max = 6 }) {
  const $ = (s) => document.querySelector(s);
  const root = $('#team-names');
  let openPicker = null;

  function render() {
    ensureColors(settings);
    $('#team-count').textContent = settings.teams.length;
    root.innerHTML = settings.teams.map((t, i) => {
      const color = settings.colors[i];
      const name = PALETTE.find((p) => p.c === color)?.n || 'Colour';
      return `<div class="team-name" style="--team:${color}">
        <button type="button" class="swatch" data-pick="${i}" aria-label="Team ${i + 1} colour: ${name}. Change colour" aria-expanded="${openPicker === i}"></button>
        <input data-team="${i}" value="${esc(t)}" maxlength="24" aria-label="Team ${i + 1} name">
        ${openPicker === i ? `<div class="palette" role="listbox" aria-label="Pick a colour">${PALETTE.map((p) => {
          const owner = settings.colors.indexOf(p.c);
          const taken = owner !== -1 && owner !== i;
          return `<button type="button" class="pal ${p.c === color ? 'on' : ''} ${taken ? 'taken' : ''}" style="--c:${p.c}" data-color="${p.c}" data-for="${i}" title="${p.n}${taken ? ` (swap with ${esc(settings.teams[owner])})` : ''}" aria-label="${p.n}"></button>`;
        }).join('')}</div>` : ''}
      </div>`;
    }).join('');
  }

  root.addEventListener('click', (e) => {
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
    if (settings.teams.length > min) { settings.teams.pop(); settings.colors.pop(); openPicker = null; save(); render(); }
  };
  $('#team-plus').onclick = () => {
    if (settings.teams.length < max) { settings.teams.push(`Team ${settings.teams.length + 1}`); ensureColors(settings); save(); render(); }
  };

  render();
  return render;
}
