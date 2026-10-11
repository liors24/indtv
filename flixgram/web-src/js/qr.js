// Compact QR Code encoder (byte mode, ECC level M), adapted from Project Nayuki's
// reference algorithm (MIT). Returns a 2D boolean matrix.

const ECC_CW = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28];
const ECC_BLOCKS = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49];
const ECL_FORMAT_BITS = 0; // M

function rawModules(ver) {
  let r = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const na = Math.floor(ver / 7) + 2;
    r -= (25 * na - 10) * na - 55;
    if (ver >= 7) r -= 36;
  }
  return r;
}

function dataCodewords(ver) {
  return Math.floor(rawModules(ver) / 8) - ECC_CW[ver] * ECC_BLOCKS[ver];
}

function rsMul(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

function rsDivisor(degree) {
  const res = new Array(degree).fill(0);
  res[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < res.length; j++) {
      res[j] = rsMul(res[j], root);
      if (j + 1 < res.length) res[j] ^= res[j + 1];
    }
    root = rsMul(root, 0x02);
  }
  return res;
}

function rsRemainder(data, div) {
  const res = div.map(() => 0);
  for (const b of data) {
    const factor = b ^ res.shift();
    res.push(0);
    div.forEach((coef, i) => { res[i] ^= rsMul(coef, factor); });
  }
  return res;
}

function utf8(str) {
  const out = [];
  const s = unescape(encodeURIComponent(str));
  for (let i = 0; i < s.length; i++) out.push(s.charCodeAt(i));
  return out;
}

export function encodeQR(text) {
  const bytes = utf8(text);
  let ver = 1;
  for (; ver <= 40; ver++) {
    const ccBits = ver < 10 ? 8 : 16;
    if (4 + ccBits + bytes.length * 8 <= dataCodewords(ver) * 8) break;
  }
  if (ver > 40) throw new Error('data too long');
  const ccBits = ver < 10 ? 8 : 16;
  const bits = [];
  const put = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  put(4, 4);
  put(bytes.length, ccBits);
  for (const b of bytes) put(b, 8);
  const cap = dataCodewords(ver) * 8;
  put(0, Math.min(4, cap - bits.length));
  put(0, (8 - (bits.length % 8)) % 8);
  for (let p = 0xec; bits.length < cap; p ^= 0xec ^ 0x11) put(p, 8);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) {
    let v = 0;
    for (let j = 0; j < 8; j++) v = (v << 1) | bits[i + j];
    data.push(v);
  }

  // split into blocks + ECC, interleave
  const numBlocks = ECC_BLOCKS[ver], blockEcc = ECC_CW[ver];
  const raw = Math.floor(rawModules(ver) / 8);
  const numShort = numBlocks - (raw % numBlocks);
  const shortLen = Math.floor(raw / numBlocks);
  const blocks = [];
  const div = rsDivisor(blockEcc);
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const dat = data.slice(k, k + shortLen - blockEcc + (i < numShort ? 0 : 1));
    k += dat.length;
    const ecc = rsRemainder(dat, div);
    if (i < numShort) dat.push(0);
    blocks.push(dat.concat(ecc));
  }
  const all = [];
  for (let i = 0; i < blocks[0].length; i++) {
    blocks.forEach((b, j) => {
      if (i !== shortLen - blockEcc || j >= numShort) all.push(b[i]);
    });
  }

  const size = ver * 4 + 17;
  const mod = [], fn = [];
  for (let i = 0; i < size; i++) { mod.push(new Array(size).fill(false)); fn.push(new Array(size).fill(false)); }
  const setF = (x, y, d) => { mod[y][x] = d; fn[y][x] = true; };

  // timing
  for (let i = 0; i < size; i++) { setF(6, i, i % 2 === 0); setF(i, 6, i % 2 === 0); }
  // finders
  const finder = (x, y) => {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const d = Math.max(Math.abs(dx), Math.abs(dy)), xx = x + dx, yy = y + dy;
      if (xx >= 0 && xx < size && yy >= 0 && yy < size) setF(xx, yy, d !== 2 && d !== 4);
    }
  };
  finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
  // alignment
  const align = [];
  if (ver > 1) {
    const n = Math.floor(ver / 7) + 2;
    const step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2;
    align.push(6);
    for (let p = size - 7; align.length < n; p -= step) align.splice(1, 0, p);
  }
  for (let i = 0; i < align.length; i++) for (let j = 0; j < align.length; j++) {
    if ((i === 0 && j === 0) || (i === 0 && j === align.length - 1) || (i === align.length - 1 && j === 0)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++)
      setF(align[i] + dx, align[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  const drawFormat = (mask) => {
    const data5 = (ECL_FORMAT_BITS << 3) | mask;
    let rem = data5;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const b = ((data5 << 10) | rem) ^ 0x5412;
    const g = (i) => ((b >>> i) & 1) !== 0;
    for (let i = 0; i <= 5; i++) setF(8, i, g(i));
    setF(8, 7, g(6)); setF(8, 8, g(7)); setF(7, 8, g(8));
    for (let i = 9; i < 15; i++) setF(14 - i, 8, g(i));
    for (let i = 0; i < 8; i++) setF(size - 1 - i, 8, g(i));
    for (let i = 8; i < 15; i++) setF(8, size - 15 + i, g(i));
    setF(8, size - 8, true);
  };
  drawFormat(0);
  if (ver >= 7) {
    let rem = ver;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const b = (ver << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const bit = ((b >>> i) & 1) !== 0;
      const a = size - 11 + (i % 3), c = Math.floor(i / 3);
      setF(a, c, bit); setF(c, a, bit);
    }
  }
  // data zigzag
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
      const x = right - j;
      const upward = ((right + 1) & 2) === 0;
      const y = upward ? size - 1 - vert : vert;
      if (!fn[y][x] && i < all.length * 8) {
        mod[y][x] = ((all[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0;
        i++;
      }
    }
  }
  // masks: choose lowest penalty
  const maskFn = [
    (x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => (x * y) % 2 + (x * y) % 3 === 0,
    (x, y) => ((x * y) % 2 + (x * y) % 3) % 2 === 0, (x, y) => ((x + y) % 2 + (x * y) % 3) % 2 === 0,
  ];
  const applyMask = (m) => {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && maskFn[m](x, y)) mod[y][x] = !mod[y][x];
  };
  const penalty = () => {
    let p = 0;
    for (let y = 0; y < size; y++) {
      for (let pass = 0; pass < 2; pass++) {
        let run = 1;
        for (let x = 1; x <= size; x++) {
          const a = pass ? (x < size ? mod[x][y] : null) : (x < size ? mod[y][x] : null);
          const b = pass ? mod[x - 1][y] : mod[y][x - 1];
          if (a === b) run++;
          else { if (run >= 5) p += run - 2; run = 1; }
        }
      }
    }
    for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) {
      const c = mod[y][x];
      if (c === mod[y][x + 1] && c === mod[y + 1][x] && c === mod[y + 1][x + 1]) p += 3;
    }
    let dark = 0;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (mod[y][x]) dark++;
    const total = size * size;
    p += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
    return p;
  };
  let best = 0, bestP = Infinity;
  for (let m = 0; m < 8; m++) {
    applyMask(m); drawFormat(m);
    const pp = penalty();
    if (pp < bestP) { bestP = pp; best = m; }
    applyMask(m);
  }
  applyMask(best); drawFormat(best);
  return mod;
}

export function qrSvg(text, px) {
  const m = encodeQR(text);
  const n = m.length, q = 2, s = n + q * 2;
  let d = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (m[y][x]) d += `M${x + q},${y + q}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}" width="${px}" height="${px}" shape-rendering="crispEdges"><rect width="${s}" height="${s}" fill="#fff8ec"/><path d="${d}" fill="#0e0b14"/></svg>`;
}
