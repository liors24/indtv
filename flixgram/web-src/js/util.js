// Small DOM + formatting helpers. No framework: TV boxes are slow, the DOM is fast enough.

export function h(tag, attrs, ...kids) {
  const parts = tag.split('.');
  const el = document.createElement(parts[0] || 'div');
  if (parts.length > 1) el.className = parts.slice(1).join(' ');
  if (attrs) {
    for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className += (el.className ? ' ' : '') + v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') el['_' + k] = v;
      else if (k === 'data') for (const d in v) el.dataset[d] = v[d];
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  append(el, kids);
  return el;
}

function append(el, kids) {
  for (const k of kids) {
    if (k == null || k === false) continue;
    if (Array.isArray(k)) append(el, k);
    else el.appendChild(typeof k === 'object' ? k : document.createTextNode(String(k)));
  }
}

export const $ = (sel, root) => (root || document).querySelector(sel);
export const $$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

export function svg(path, size) {
  const s = size || 24;
  return h('span.ic', { html: `<svg viewBox="0 0 24 24" width="${s}" height="${s}" aria-hidden="true">${path}</svg>` });
}

export const ICON = {
  play: '<path d="M7 4.8v14.4a1 1 0 0 0 1.5.86l12-7.2a1 1 0 0 0 0-1.72l-12-7.2A1 1 0 0 0 7 4.8Z" fill="currentColor"/>',
  pause: '<rect x="6" y="4.5" width="4" height="15" rx="1.2" fill="currentColor"/><rect x="14" y="4.5" width="4" height="15" rx="1.2" fill="currentColor"/>',
  skipL: '<path d="M17 5.5v13a.8.8 0 0 1-1.25.66L6.5 12.66a.8.8 0 0 1 0-1.32l9.25-6.5A.8.8 0 0 1 17 5.5Z" fill="currentColor"/><rect x="3.5" y="5" width="2.6" height="14" rx="1" fill="currentColor"/>',
  skipR: '<path d="M7 5.5v13a.8.8 0 0 0 1.25.66l9.25-6.5a.8.8 0 0 0 0-1.32L8.25 4.84A.8.8 0 0 0 7 5.5Z" fill="currentColor"/><rect x="17.9" y="5" width="2.6" height="14" rx="1" fill="currentColor"/>',
  dblL: '<path d="M11 6.5 5 12l6 5.5M19 6.5 13 12l6 5.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  dblR: '<path d="M13 6.5 19 12l-6 5.5M5 6.5 11 12l-6 5.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  speed: '<path d="M12 13.5 16.5 8" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M4.2 17a8.5 8.5 0 1 1 15.6 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  cc: '<rect x="3" y="5" width="18" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10.5 10.2a2.4 2.4 0 1 0 0 3.6M17 10.2a2.4 2.4 0 1 0 0 3.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="m15.5 15.5 5 5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  photo: '<rect x="3" y="4.5" width="18" height="15" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="9" cy="10" r="1.8" fill="currentColor"/><path d="m4 18 5.5-5 3.5 3 3-2.5L20.5 17" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  film: '<rect x="3" y="4" width="18" height="16" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10 9v6l5-3z" fill="currentColor"/>',
  note: '<path d="M9 17.5V6l10-2v11.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="6.5" cy="17.5" r="2.5" fill="currentColor"/><circle cx="16.5" cy="15.5" r="2.5" fill="currentColor"/>',
  file: '<path d="M6 3.5h8l4.5 4.5v12a.5.5 0 0 1-.5.5H6a.5.5 0 0 1-.5-.5v-16A.5.5 0 0 1 6 3.5Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M13.5 3.5V8.5h5" fill="none" stroke="currentColor" stroke-width="2"/>',
  vol: '<path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z" fill="currentColor" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  muted: '<path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z" fill="currentColor" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="m15.5 9.5 5 5m0-5-5 5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  menu: '<path d="M4 6.5h16M4 12h16M4 17.5h16" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
  send: '<path d="M20 4 3.5 11l6.5 2.5L12.5 20z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  shuffle: '<path d="M4 7h3.5c4.5 0 4.5 10 9 10H20M4 17h3.5c1.6 0 2.6-1.2 3.4-2.8M14 9.8c.8-1.6 1.8-2.8 3.5-2.8H20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
};

export function pad2(n) {
  return n < 10 ? '0' + n : '' + n;
}

export function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}:${pad2(m)}:${pad2(s)}` : `${m}:${pad2(s)}`;
}

export function fmtDurationWords(sec) {
  sec = sec || 0;
  if (sec < 60) return `${sec} שנ׳`;
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} דק׳`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} שע׳ ${r} דק׳` : `${h} שע׳`;
}

export function fmtSize(bytes) {
  if (!bytes) return '0 MB';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0, v = bytes;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v >= 100 || i < 2 ? Math.round(v) : v.toFixed(1)} ${u[i]}`;
}

const MONTHS = ['ינו׳', 'פבר׳', 'מרץ', 'אפר׳', 'מאי', 'יוני', 'יולי', 'אוג׳', 'ספט׳', 'אוק׳', 'נוב׳', 'דצמ׳'];
export function fmtDate(unix) {
  if (!unix) return '';
  const d = new Date(unix * 1000), now = new Date();
  const days = Math.floor((now - d) / 86400000);
  if (days === 0 && d.getDate() === now.getDate()) return `היום ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  if (days < 2) return 'אתמול';
  if (days < 7) return `לפני ${days} ימים`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${d.getFullYear() !== now.getFullYear() ? ' ' + d.getFullYear() : ''}`;
}

export function debounce(fn, ms) {
  let t = 0;
  return function () {
    const args = arguments;
    clearTimeout(t);
    t = setTimeout(() => fn.apply(null, args), ms);
  };
}

export const store = {
  get(key, def) {
    try {
      const v = localStorage.getItem('nova.' + key);
      return v == null ? def : JSON.parse(v);
    } catch (e) {
      return def;
    }
  },
  set(key, val) {
    try {
      localStorage.setItem('nova.' + key, JSON.stringify(val));
    } catch (e) { /* storage full / unavailable */ }
  },
  del(key) {
    try { localStorage.removeItem('nova.' + key); } catch (e) { /* ignore */ }
  },
};

export function initials(title) {
  const w = (title || '?').replace(/[^A-Za-z0-9À-ɏЀ-ӿ֐-׿؀-ۿ\s]/g, '').trim().split(/\s+/);
  return ((w[0] || '?')[0] + (w[1] ? w[1][0] : '')).toUpperCase();
}

// Stable hue per chat for avatars without photos.
export function hueOf(id) {
  let x = Math.abs(Number(id) || 0) % 2147483647;
  x = (x * 48271) % 2147483647;
  return x % 360;
}

export function nextFrame() {
  return new Promise((r) => requestAnimationFrame(() => r()));
}
