/* TeleTV — small helpers */
export function el(tag, attrs, kids) {
  const n = document.createElement(tag);
  if (attrs) for (const k of Object.keys(attrs)) {
    const v = attrs[k];
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(n.style, v);
    else if (k.indexOf('on') === 0 && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  if (kids) (Array.isArray(kids) ? kids : [kids]).forEach((c) => {
    if (c === null || c === undefined || c === false) return;
    n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return n;
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export function fmtDur(sec) {
  if (!isFinite(sec) || sec < 0) return '--:--';
  sec = Math.floor(sec);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return (h ? h + ':' + ('0' + m).slice(-2) : String(m)) + ':' + ('0' + s).slice(-2);
}
export function fmtSize(b) {
  if (!b) return '';
  if (b >= 1e9) return (b / 1e9).toFixed(1) + ' GB';
  if (b >= 1e6) return Math.round(b / 1e6) + ' MB';
  return Math.max(1, Math.round(b / 1e3)) + ' KB';
}
export function fmtDate(ts, lang) {
  try {
    const d = new Date(ts * 1000), now = new Date();
    const same = d.toDateString() === now.toDateString();
    const loc = lang === 'he' ? 'he-IL' : 'en-GB';
    return same ? d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString(loc, { day: 'numeric', month: 'short', year: now.getFullYear() === d.getFullYear() ? undefined : '2-digit' });
  } catch (e) { return ''; }
}
export function ls(key, val) {
  try {
    if (val === undefined) { const v = localStorage.getItem('teletv:' + key); return v === null ? null : JSON.parse(v); }
    if (val === null) localStorage.removeItem('teletv:' + key); else localStorage.setItem('teletv:' + key, JSON.stringify(val));
  } catch (e) { /* storage unavailable */ }
  return null;
}
/** First letters for a letter avatar. */
export function initials(name) {
  const p = String(name || '?').trim().split(/\s+/).slice(0, 2);
  return p.map((w) => (w[0] || '').toUpperCase()).join('') || '?';
}
const COLORS = ['#e17076', '#eda86c', '#a695e7', '#7bc862', '#6ec9cb', '#65aadd', '#ee7aae'];
export function colorFor(key) {
  let h = 0; const s = String(key);
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length];
}
/** Run async jobs with limited concurrency. */
export class Queue {
  constructor(n) { this.n = n; this.running = 0; this.q = []; }
  add(fn) { return new Promise((res, rej) => { this.q.push({ fn, res, rej }); this._pump(); }); }
  clear() { this.q.forEach((j) => j.res(null)); this.q = []; }
  _pump() {
    while (this.running < this.n && this.q.length) {
      const j = this.q.shift(); this.running++;
      Promise.resolve().then(j.fn).then(j.res, j.rej).then(() => { this.running--; this._pump(); });
    }
  }
}
