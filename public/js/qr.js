// QR codes for join links, drawn as SVG. No outside service, so it works on any network.
// Byte mode, error correction level M (still scans if ~15% is hidden or glary), versions 1–10
// (up to 213 characters — a join link is about 65).

const EC_M = [ // version → [ec codewords per block, [data codewords per block, …]]
  null,
  [10, [16]], [16, [28]], [26, [44]], [18, [32, 32]], [24, [43, 43]],
  [16, [27, 27, 27, 27]], [18, [31, 31, 31, 31]], [22, [38, 38, 39, 39]],
  [22, [36, 36, 36, 37, 37]], [26, [43, 43, 43, 43, 44]],
];
const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];

/* ---------- Reed–Solomon over GF(256) ---------- */
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
for (let i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11d; }
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

function rsGenerator(n) {
  let g = [1];
  for (let i = 0; i < n; i++) {
    const next = new Array(g.length + 1).fill(0);
    g.forEach((c, j) => { next[j] ^= c; next[j + 1] ^= mul(c, EXP[i]); });
    g = next;
  }
  return g;
}
function rsRemainder(data, n) {
  const g = rsGenerator(n);
  const r = new Array(n).fill(0);
  for (const d of data) {
    const f = d ^ r.shift();
    r.push(0);
    for (let i = 0; i < n; i++) r[i] ^= mul(g[i + 1], f);
  }
  return r;
}

/* ---------- data → codewords ---------- */
function codewords(bytes, v) {
  const [ec, blocks] = EC_M[v];
  const total = blocks.reduce((a, b) => a + b, 0);
  const bits = [];
  const put = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  put(0b0100, 4); // byte mode
  put(bytes.length, v < 10 ? 8 : 16);
  bytes.forEach((b) => put(b, 8));
  put(0, Math.min(4, total * 8 - bits.length)); // terminator
  while (bits.length % 8) bits.push(0);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  for (let p = 0; data.length < total; p++) data.push(p % 2 ? 0x11 : 0xec);
  // split into blocks, add error correction, interleave
  const dBlocks = [];
  let at = 0;
  for (const n of blocks) { dBlocks.push(data.slice(at, at + n)); at += n; }
  const eBlocks = dBlocks.map((b) => rsRemainder(b, ec));
  const out = [];
  for (let i = 0; i < Math.max(...blocks); i++) dBlocks.forEach((b) => { if (i < b.length) out.push(b[i]); });
  for (let i = 0; i < ec; i++) eBlocks.forEach((b) => out.push(b[i]));
  return out;
}

/* ---------- the symbol ---------- */
const bch = (val, poly, polyBits) => {
  let r = val << (polyBits - 1);
  for (let i = 31; i >= polyBits - 1; i--) if ((r >>> i) & 1) r ^= poly << (i - polyBits + 1);
  return r;
};
const MASKS = [
  (r, c) => (r + c) % 2 === 0, (r) => r % 2 === 0, (r, c) => c % 3 === 0, (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0, (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0, (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

function build(v, words, mask) {
  const n = 17 + 4 * v;
  const m = Array.from({ length: n }, () => new Array(n).fill(null)); // null = free for data
  const set = (r, c, on) => { if (r >= 0 && r < n && c >= 0 && c < n) m[r][c] = on; };
  // finders + separators
  for (const [r0, c0] of [[0, 0], [0, n - 7], [n - 7, 0]]) {
    for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) {
      const ring = Math.max(Math.abs(r - 3), Math.abs(c - 3));
      set(r0 + r, c0 + c, ring !== 2 && ring !== 4);
    }
  }
  // alignment patterns
  const al = ALIGN[v];
  for (const r of al) for (const c of al) {
    if (m[r][c] !== null) continue; // overlaps a finder
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) m[r + dr][c + dc] = Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
  }
  // timing
  for (let i = 8; i < n - 8; i++) { if (m[6][i] === null) m[6][i] = i % 2 === 0; if (m[i][6] === null) m[i][6] = i % 2 === 0; }
  // reserve format (and version) areas, dark module
  const fmtCells = [];
  for (let i = 0; i < 9; i++) { if (m[8][i] === null) fmtCells.push([8, i]); if (m[i][8] === null) fmtCells.push([i, 8]); }
  for (let i = 0; i < 8; i++) { fmtCells.push([8, n - 1 - i]); fmtCells.push([n - 1 - i, 8]); }
  fmtCells.forEach(([r, c]) => { m[r][c] = false; });
  m[n - 8][8] = true;
  if (v >= 7) for (let i = 0; i < 18; i++) { m[Math.floor(i / 3)][n - 11 + (i % 3)] = false; m[n - 11 + (i % 3)][Math.floor(i / 3)] = false; }
  const fixed = m.map((row) => row.map((x) => x !== null));
  // data, zigzag from the bottom right
  let bit = 0;
  const total = words.length * 8;
  for (let right = n - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < n; vert++) {
      for (let j = 0; j < 2; j++) {
        const c = right - j;
        const up = ((right + 1) & 2) === 0;
        const r = up ? n - 1 - vert : vert;
        if (fixed[r][c]) continue;
        const on = bit < total ? ((words[bit >>> 3] >>> (7 - (bit & 7))) & 1) === 1 : false;
        bit++;
        m[r][c] = on !== MASKS[mask](r, c);
      }
    }
  }
  // format info: level M (00) + mask, BCH, then XOR 0x5412
  const fmt = (((0b00 << 3) | mask) << 10 | bch((0b00 << 3) | mask, 0x537, 11)) ^ 0x5412;
  const fb = (i) => ((fmt >>> i) & 1) === 1;
  // m[row][column]: first copy around the top-left finder, second split between the other two
  for (let i = 0; i <= 5; i++) m[i][8] = fb(i);
  m[7][8] = fb(6); m[8][8] = fb(7); m[8][7] = fb(8);
  for (let i = 9; i < 15; i++) m[8][14 - i] = fb(i);
  for (let i = 0; i < 8; i++) m[8][n - 1 - i] = fb(i);
  for (let i = 8; i < 15; i++) m[n - 15 + i][8] = fb(i);
  m[n - 8][8] = true;
  if (v >= 7) {
    const ver = (v << 12) | bch(v, 0x1f25, 13);
    for (let i = 0; i < 18; i++) {
      const on = ((ver >>> i) & 1) === 1;
      m[Math.floor(i / 3)][n - 11 + (i % 3)] = on;
      m[n - 11 + (i % 3)][Math.floor(i / 3)] = on;
    }
  }
  return m;
}

function penalty(m) {
  const n = m.length;
  let p = 0;
  const line = (get) => {
    for (let a = 0; a < n; a++) {
      let run = 1;
      for (let b = 1; b <= n; b++) {
        if (b < n && get(a, b) === get(a, b - 1)) run++;
        else { if (run >= 5) p += run - 2; run = 1; }
      }
      for (let b = 0; b + 10 < n; b++) {
        const s = Array.from({ length: 11 }, (_, k) => (get(a, b + k) ? 1 : 0)).join('');
        if (s === '10111010000' || s === '00001011101') p += 40;
      }
    }
  };
  line((a, b) => m[a][b]);
  line((a, b) => m[b][a]);
  for (let r = 0; r < n - 1; r++) for (let c = 0; c < n - 1; c++) {
    const x = m[r][c];
    if (x === m[r + 1][c] && x === m[r][c + 1] && x === m[r + 1][c + 1]) p += 3;
  }
  const dark = m.flat().filter(Boolean).length;
  p += Math.floor(Math.abs(dark * 20 - n * n * 10) / (n * n)) * 10;
  return p;
}

/** The QR modules for `text`: an array of rows of true (dark) / false (light). */
export function qrMatrix(text) {
  const bytes = [...new TextEncoder().encode(String(text))];
  let v = 1;
  while (v <= 10 && bytes.length + 2 + (v >= 10 ? 1 : 0) > EC_M[v][1].reduce((a, b) => a + b, 0)) v++;
  if (v > 10) throw new Error('Text too long for a QR code here');
  const words = codewords(bytes, v);
  let best = null;
  for (let mask = 0; mask < 8; mask++) {
    const m = build(v, words, mask);
    const s = penalty(m);
    if (!best || s < best.s) best = { m, s };
  }
  return best.m;
}

/** An SVG QR code for `text` (with the usual quiet border). Scales to fit its box. */
export function qrSvg(text, { title = 'Scan to join', dark = '#18142b', light = '#fff' } = {}) {
  const m = qrMatrix(text);
  const q = 4;
  const size = m.length + q * 2;
  let d = '';
  m.forEach((row, r) => {
    let c = 0;
    while (c < row.length) {
      if (!row[c]) { c++; continue; }
      let e = c; while (e < row.length && row[e]) e++;
      d += `M${c + q} ${r + q}h${e - c}v1h${c - e}z`;
      c = e;
    }
  });
  const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  return `<svg class="qr" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" role="img" aria-label="${esc(title)}"><title>${esc(title)}</title><rect width="${size}" height="${size}" fill="${light}"/><path d="${d}" fill="${dark}"/></svg>`;
}
