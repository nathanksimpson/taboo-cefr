// Editions: one codebase, two front doors.
//
//   Classroom — taboo-cefr.nathanksimpson.workers.dev — for teaching: the teacher runs the game,
//               CEFR levels and the Simson book decks, projector big screen, English only.
//   Nadu      — nadu-taboo.nathanksimpson.workers.dev — for playing at home: English and Korean,
//               everyone equal, co-op for two. (Its extras move across in later steps.)
//
// The edition comes from the address the site was opened at. To preview the other one on any
// address, add ?edition=nadu (or ?edition=classroom) — it sticks for that browser tab.

export const EDITIONS = {
  classroom: {
    id: 'classroom',
    name: 'Taboo CEFR', // installed-app name and page titles
    home: 'CEFR Word Games', // home page title
    brandSub: 'CEFR', // small word after the game name in the top bar
    themeColor: '#ffc61a',
    features: {
      bookDecks: true, // Simson book decks (Rainbow levels) alongside the CEFR levels
    },
  },
  nadu: {
    id: 'nadu',
    name: 'Nadu Taboo',
    home: 'Nadu Word Games',
    brandSub: 'Nadu',
    themeColor: '#27c3c9',
    features: {
      bookDecks: false,
    },
  },
};

function pick() {
  try {
    const asked = new URLSearchParams(location.search).get('edition');
    if (asked && EDITIONS[asked]) { sessionStorage.setItem('edition', asked); return asked; }
    const kept = sessionStorage.getItem('edition');
    if (kept && EDITIONS[kept]) return kept;
  } catch { /* storage unavailable */ }
  return /nadu/i.test(location.hostname) ? 'nadu' : 'classroom';
}

export const EDITION = EDITIONS[pick()];

/** Name, colours and titles for this edition. The HTML is written for Classroom, so it changes nothing there. */
export function applyEdition(doc = document) {
  const e = EDITION;
  doc.documentElement.dataset.edition = e.id;
  if (e.id === 'classroom') return;
  const base = EDITIONS.classroom;
  doc.title = doc.title.replace(base.home, e.home).replace(base.name, e.name).replace(/\bCEFR\b/, e.brandSub);
  doc.querySelector('meta[name="theme-color"]')?.setAttribute('content', e.themeColor);
  doc.querySelector('meta[name="apple-mobile-web-app-title"]')?.setAttribute('content', e.name);
  doc.querySelectorAll('.brand-sub').forEach((el) => { if (el.textContent.trim() === base.brandSub) el.textContent = e.brandSub; });
  if (!e.features.bookDecks) doc.querySelectorAll('input[placeholder*="Write Now"]').forEach((el) => { el.placeholder = el.placeholder.replace('Write Now', 'B1'); });
}

applyEdition();
