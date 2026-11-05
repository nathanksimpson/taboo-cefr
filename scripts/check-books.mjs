const { BOOKS } = await import(new URL("../public/js/books/index.js", import.meta.url));
let bad = 0, total = 0;
for (const b of BOOKS) {
  const seen = new Set(); let n = 0;
  for (const line of b.raw.trim().split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue;
    const i = line.indexOf(':'); if (i < 0) { console.log(b.id, 'NO COLON', line); bad++; continue; }
    const w = line.slice(0, i).trim(); const t = line.slice(i + 1).split(',').map((s) => s.trim().toLowerCase());
    if (seen.has(w.toLowerCase())) { console.log(b.id, 'DUP', w); bad++; }
    seen.add(w.toLowerCase()); n++;
    if (t.length !== 3) { console.log(b.id, 'COUNT', line); bad++; }
    if (new Set(t).size !== t.length) { console.log(b.id, 'REPEAT', line); bad++; }
    if (t.includes(w.toLowerCase())) { console.log(b.id, 'SELF', line); bad++; }
  }
  total += n; console.log(`${b.level.padEnd(7)} ${b.name.padEnd(28)} ${n}`);
}
console.log('books', BOOKS.length, 'cards', total, 'problems', bad);
