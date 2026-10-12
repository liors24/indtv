import { h, svg, ICON, fmtTime, initials, hueOf, store } from './util.js';
import { thumbUrl } from './td.js';
import { displayTitle } from './media.js';

// ------------------------------------------------------------------ lazy images

let io = null;
function observer() {
  if (io || !('IntersectionObserver' in window)) return io;
  io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        load(e.target);
        io.unobserve(e.target);
      }
    });
  }, { rootMargin: '400px 900px' });
  return io;
}

function load(img) {
  const src = img.dataset.src;
  if (!src) return;
  img.onload = () => img.classList.add('ok');
  img.onerror = () => img.classList.add('err');
  img.src = src;
  delete img.dataset.src;
}

export function lazyImg(src, cls) {
  const img = h('img' + (cls ? '.' + cls : ''), { alt: '', decoding: 'async' });
  if (!src) return img;
  img.dataset.src = src;
  const o = observer();
  if (o) o.observe(img); else load(img);
  return img;
}

// ------------------------------------------------------------------ resume positions

export const progress = {
  get(key) {
    const all = store.get('progress', {});
    return all[key] || null;
  },
  set(item, pos, dur) {
    const all = store.get('progress', {});
    if (dur > 0 && pos / dur > 0.94) delete all[item.key];
    else if (pos > 15) {
      all[item.key] = {
        pos, dur, t: Date.now(),
        item: { key: item.key, chatId: item.chatId, msgId: item.msgId, kind: item.kind, caption: item.caption, name: item.name, mini: item.mini, thumb: item.thumb, duration: item.duration, date: item.date },
      };
    }
    // keep the 60 most recent
    const keys = Object.keys(all).sort((a, b) => all[b].t - all[a].t);
    keys.slice(60).forEach((k) => delete all[k]);
    store.set('progress', all);
  },
  recent() {
    const all = store.get('progress', {});
    return Object.keys(all).map((k) => all[k]).sort((a, b) => b.t - a.t);
  },
};

// ------------------------------------------------------------------ cards

export function mediaCard(item, opts) {
  opts = opts || {};
  const t = displayTitle(item);
  const art = h('div.card-art');
  if (item.mini) art.appendChild(h('img.mini', { src: item.mini, alt: '' }));
  if (item.thumb) art.appendChild(lazyImg(thumbUrl(item.thumb), 'thumb'));
  else if (!item.mini) art.appendChild(h('div.card-glyph', null, svg(item.kind === 'audio' ? ICON.note : item.kind === 'file' ? ICON.file : ICON.film, 44)));
  if (item.duration) art.appendChild(h('span.badge', { text: fmtTime(item.duration) }));
  const prog = progress.get(item.key);
  if (prog && prog.dur) art.appendChild(h('span.prog', null, h('i', { style: { width: Math.min(100, (prog.pos / prog.dur) * 100) + '%' } })));
  if (item._t && item._t.episode && opts.episodeBadge) art.appendChild(h('span.ep', { text: String(item._t.episode) }));
  const card = h('div.card.fx' + (opts.wide ? '.wide' : '') + (item.kind === 'photo' ? '.photo' : ''), { data: { key: item.key } },
    art,
    opts.noText ? null : h('div.card-text', null,
      h('div.card-title', { text: opts.episodeBadge && item._t && item._t.episode ? (t.sub || t.main) : t.main }),
      t.sub && !opts.episodeBadge ? h('div.card-sub', { text: t.sub }) : null));
  card._item = item;
  return card;
}

export function avatar(chat, size) {
  const s = size || 56;
  const hue = hueOf(chat.id);
  const el = h('div.avatar', { style: { width: s / 10 + 'rem', height: s / 10 + 'rem', background: `linear-gradient(140deg, hsl(${hue},45%,42%), hsl(${(hue + 40) % 360},50%,26%))` } },
    h('span', { text: initials(chat.title), style: { fontSize: (s * 0.036).toFixed(2) + 'rem' } }));
  const p = chat.photo;
  if (p) {
    if (p.minithumbnail) el.appendChild(h('img.mini', { src: 'data:image/jpeg;base64,' + p.minithumbnail.data, alt: '' }));
    if (p.small) el.appendChild(lazyImg(thumbUrl(p.small.id), 'thumb'));
  }
  return el;
}

// A horizontally scrolling shelf. `items` are rendered in chunks as the user moves along.
export function rail(id, title, meta, items, render, opts) {
  opts = opts || {};
  const track = h('div.rail-track');
  const railEl = h('div.rail', { data: { fgroup: id, pad: opts.pad || 120 } }, track);
  let rendered = 0;
  const CHUNK = 9;
  function more() {
    const end = Math.min(items.length, rendered + CHUNK);
    for (let i = rendered; i < end; i++) {
      const card = render(items[i], i);
      if (i >= end - 3 && end < items.length) {
        const prev = card._onfocus;
        card._onfocus = () => { if (prev) prev(); if (rendered === end) more(); };
      }
      track.appendChild(card);
    }
    rendered = end;
    if (opts.onMore && rendered >= items.length) {
      const last = track.lastElementChild;
      if (last && !last._hooked) {
        last._hooked = true;
        const prev = last._onfocus;
        last._onfocus = () => { if (prev) prev(); opts.onMore(); };
      }
    }
  }
  more();
  const head = title ? h('div.shelf-head', null, h('h3.shelf-title', { text: title }), meta ? h('span.shelf-meta', { text: meta }) : null) : null;
  const section = h('section.shelf', { data: { row: id } }, head, railEl);
  section._append = (newItems) => {
    newItems.forEach((it) => items.push(it));
    more();
  };
  return section;
}

// Side panel with a ☰ button that folds it down to a slim strip of avatars (remembered per screen).
export function sidePanel(cls, key, title, list, screenEl) {
  const btn = h('div.menu-btn.fx', { role: 'button', 'aria-label': 'הצגה או הסתרה של התפריט' }, svg(ICON.menu, 30));
  const head = h('div.side-head', null, btn, h('span.side-title', { text: title }));
  const scroll = h('div.side-scroll', { 'data-vscroll': '0' }, list);
  const aside = h('aside.' + cls, { data: { fgroup: 'side' } }, head, scroll);
  const apply = (collapsed) => screenEl.classList.toggle('side-collapsed', collapsed);
  btn._onselect = () => {
    const c = !screenEl.classList.contains('side-collapsed');
    store.set('side.' + key, c);
    apply(c);
  };
  aside._init = () => apply(store.get('side.' + key, false));
  return aside;
}

export function spinner() {
  return h('div.spinner', null, h('i'), h('i'), h('i'));
}

export function emptyState(title, body, action) {
  return h('div.empty', null, h('div.empty-title', { text: title }), body ? h('p', { text: body }) : null, action || null);
}

export function button(label, onselect, opts) {
  opts = opts || {};
  return h('div.btn.fx' + (opts.primary ? '.primary' : '') + (opts.danger ? '.danger' : '') + (opts.cls ? '.' + opts.cls : ''),
    { onselect, role: 'button' }, opts.icon ? svg(opts.icon, 26) : null, h('span', { text: label }));
}
