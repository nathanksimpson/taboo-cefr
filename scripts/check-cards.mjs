const { RAW } = await import(new URL("../public/js/cards.js", import.meta.url));
const seen = new Map(); let bad = 0;
for (const [lvl, txt] of Object.entries(RAW)) {
  const lines = txt.trim().split('\n').filter(Boolean);
  console.log(lvl, lines.length);
  for (const l of lines) {
    const i = l.indexOf(':'); if (i < 0) { console.log('NO COLON', l); bad++; continue; }
    const w = l.slice(0, i).trim().toLowerCase();
    const t = l.slice(i + 1).split(',').map(s => s.trim().toLowerCase());
    if (seen.has(w)) { console.log('DUP', w, seen.get(w), lvl); bad++; }
    seen.set(w, lvl);
    if (t.length < 4) { console.log('SHORT', l); bad++; }
    if (t.includes(w)) { console.log('SELF', l); bad++; }
    if (new Set(t).size !== t.length) { console.log('REPEAT', l); bad++; }
  }
}
console.log('total', seen.size, 'problems', bad);
