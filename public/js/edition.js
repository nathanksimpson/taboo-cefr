// Editions: one codebase, two front doors.
//
//   Classroom — taboo-cefr.nathanksimpson.workers.dev — for teaching: the teacher runs the game,
//               CEFR levels and the Simson book decks, projector big screen, English only.
//   Nadu      — nadu-taboo.nathanksimpson.workers.dev — for playing at home: English and Korean,
//               each team (or player) picks its language, everyone on their own phone.
//
// The edition comes from the address the site was opened at. To preview the other one on any
// address, add ?edition=nadu (or ?edition=classroom) — it sticks for that browser tab.
// (A small script at the top of each page sets the same thing early, so nothing flashes.)

export const EDITIONS = {
  classroom: {
    id: 'classroom',
    name: 'Taboo CEFR', // installed-app name and page titles
    home: 'CEFR Word Games', // home page title
    brandSub: 'CEFR', // small word after the game name in the top bar
    themeColor: '#ffc61a',
    features: {
      bookDecks: true, // Simson book decks (Rainbow levels) alongside the CEFR levels
      korean: false, // Korean TOPIK decks, and each team choosing the language it explains in
      koreanMenus: false, // EN / 한국어 switch for the menus
      teacherRooms: true, // 🌐 Online: the teacher's screen runs a room that phones join (join.html)
      playerRooms: false, // "Own devices": rooms the server runs, everyone equal (online.html, screen.html)
    },
  },
  nadu: {
    id: 'nadu',
    name: 'Nadu Taboo',
    home: 'Nadu Word Games',
    brandSub: 'Nadu',
    themeColor: '#27c3c9',
    icons: 'nadu/', // folder with this edition's favicon, app icons and manifest
    features: {
      bookDecks: false,
      korean: true,
      koreanMenus: true,
      teacherRooms: false,
      playerRooms: true,
    },
  },
};

function pick() {
  const early = document.documentElement.dataset.edition;
  if (EDITIONS[early]) return early;
  try {
    const asked = new URLSearchParams(location.search).get('edition');
    if (asked && EDITIONS[asked]) { sessionStorage.setItem('edition', asked); return asked; }
    const kept = sessionStorage.getItem('edition');
    if (kept && EDITIONS[kept]) return kept;
  } catch { /* storage unavailable */ }
  return /nadu/i.test(location.hostname) ? 'nadu' : 'classroom';
}

export const EDITION = EDITIONS[pick()];
export const has = (feature) => !!EDITION.features[feature];

/** Name, colours, icons and titles for this edition. The HTML is written for Classroom, so it changes nothing there. */
export function applyEdition(doc = document) {
  const e = EDITION;
  doc.documentElement.dataset.edition = e.id;
  if (e.id === 'classroom') return;
  const base = EDITIONS.classroom;
  doc.title = doc.title.replace(base.home, e.home).replace(base.name, e.name).replace(/\bCEFR\b/, e.brandSub);
  doc.querySelector('meta[name="theme-color"]')?.setAttribute('content', e.themeColor);
  doc.querySelector('meta[name="apple-mobile-web-app-title"]')?.setAttribute('content', e.name);
  doc.querySelectorAll('.brand-sub').forEach((el) => { if (el.textContent.trim() === base.brandSub) el.textContent = e.brandSub; });
  if (e.icons) {
    doc.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]').forEach((l) => {
      const f = l.getAttribute('href');
      if (f && !f.startsWith(e.icons)) l.setAttribute('href', e.icons + f);
    });
    doc.querySelector('link[rel="manifest"]')?.setAttribute('href', `${e.icons}site.webmanifest`);
  }
}

applyEdition();
if (has('koreanMenus')) import('./i18n.js');
