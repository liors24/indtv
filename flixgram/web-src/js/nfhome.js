// The streaming-service home (calm theme): a framed billboard with Play, a row of channel tiles,
// and shelves of portrait posters where the focused one opens up into a wide picture with its
// details underneath. The live preview plays inside the billboard or inside the opened card.
import { h, svg, ICON, fmtTime, fmtDurationWords } from './util.js';
import { thumbUrl } from './td.js';
import { displayTitle } from './media.js';
import { chatTitle } from './state.js';
import { lazyImg, progress } from './components.js';
import { setAmbient } from './ambient.js';
import { hover } from './prefetch.js';
import * as preview from './preview.js';

function quality(item) {
  if (!item.height) return '';
  return item.height >= 2000 ? '4K' : item.height >= 1000 ? 'Full HD' : item.height >= 700 ? 'HD' : 'SD';
}

/** "ערוץ • עונה 2, פרק 3 • 42 דק׳ • HD" */
export function metaLine(item) {
  const t = displayTitle(item);
  const bits = [];
  const ch = chatTitle(item.chatId);
  if (ch && ch !== t.main) bits.push(ch);
  if (t.sub) bits.push(t.sub);
  if (item.duration) bits.push(fmtDurationWords(item.duration));
  const q = quality(item);
  if (q) bits.push(q);
  return bits;
}

function metaEl(item, cls) {
  const el = h('div.' + cls);
  metaLine(item).forEach((b, i) => {
    if (i) el.appendChild(h('i.dot', { text: '•' }));
    el.appendChild(h('span', { text: b, dir: 'auto' }));
  });
  return el;
}

function captionOf(item) {
  const t = displayTitle(item);
  const lines = (item.caption || '').split('\n').filter((l) => l.trim());
  const generic = !item.name || /^(video|file|document|audio)[_\-\d]*\.\w+$/i.test(item.name);
  const cap = lines.slice(1, 4).join(' ').trim() || (!generic && item.name !== t.main ? item.name : '');
  return cap.length > 240 ? cap.slice(0, 240) + '…' : cap;
}

function art(item, cls) {
  const a = h('div.' + cls);
  if (item.mini) a.appendChild(h('img.mini', { src: item.mini, alt: '' }));
  if (item.thumb) a.appendChild(lazyImg(thumbUrl(item.thumb), 'thumb'));
  return a;
}

function resumeText(item) {
  const p = progress.get(item.key);
  if (!p || !p.dur || p.pos < 20) return '';
  return 'נשארו ' + Math.max(1, Math.round((p.dur - p.pos) / 60)) + ' דק׳';
}

// ------------------------------------------------------------------ billboard

export function billboard(item, opts) {
  const t = displayTitle(item);
  const pic = art(item, 'bb-art');
  const resume = resumeText(item);
  const play = h('div.nf-btn.fx.is-default', { onselect: opts.onPlay }, svg(ICON.play, 30), h('span', { text: resume ? 'המשך צפייה' : 'נגן' }));
  const more = opts.onMore ? h('div.nf-btn.fx', { onselect: opts.onMore }, h('span', { text: opts.moreLabel || 'לכל הפרקים' })) : null;
  [play, more].forEach((b) => {
    if (!b) return;
    b._onfocus = () => {
      setAmbient(item.thumb ? thumbUrl(item.thumb) : item.mini);
      hover(item);
      preview.rest(item, pic);
    };
  });
  const info = h('div.bb-info', null,
    opts.kicker ? h('div.bb-kicker', { text: opts.kicker }) : null,
    h('h1.bb-title' + (t.main.length > 28 ? '.long' : ''), { text: t.main, dir: 'auto' }),
    metaEl(item, 'bb-meta'),
    resume ? h('div.bb-resume', { text: resume }) : null,
    h('div.bb-actions', null, play, more));
  return h('section.bb-row', { data: { row: 'billboard', fgroup: 'billboard' } },
    h('div.bb', null, pic, h('div.bb-shade'), info));
}

// ------------------------------------------------------------------ channel tiles

export function tilesRow(chats, onPick) {
  const track = h('div.rail-track');
  chats.forEach((c) => {
    const tile = h('div.tile.fx', { onselect: () => onPick(c.id) }, h('span', { text: c.title, dir: 'auto' }));
    tile._onfocus = () => preview.stop();
    track.appendChild(tile);
  });
  return h('section.shelf.tiles-row', { data: { row: 'tiles' } }, h('div.rail', { data: { fgroup: 'tiles', pad: 96, align: 'start' } }, track));
}

// ------------------------------------------------------------------ poster shelves

export function posterRail(id, title, meta, items, opts) {
  opts = opts || {};
  const track = h('div.rail-track');
  const desc = h('div.nf-desc');
  let rendered = 0;
  const CHUNK = 9;

  function showDesc(item) {
    desc.innerHTML = '';
    desc.appendChild(metaEl(item, 'nf-meta'));
    const cap = captionOf(item);
    if (cap) desc.appendChild(h('p.nf-cap', { text: cap, dir: 'auto' }));
    desc.classList.add('on');
  }

  function card(item) {
    const t = displayTitle(item);
    const pic = art(item, 'nf-art');
    pic.appendChild(h('div.nf-shade'));
    const p = progress.get(item.key);
    if (p && p.dur) pic.appendChild(h('span.prog', null, h('i', { style: { width: Math.min(100, (p.pos / p.dur) * 100) + '%' } })));
    if (item.duration) pic.appendChild(h('span.badge', { text: fmtTime(item.duration) }));
    const name = opts.episodes && t.sub ? t.sub : t.main;
    pic.appendChild(h('div.nf-title', { text: name, dir: 'auto' }));
    const c = h('div.nf-card.fx', { data: { key: item.key } }, pic);
    c._item = item;
    c._onfocus = () => {
      showDesc(item);
      setAmbient(item.thumb ? thumbUrl(item.thumb) : item.mini);
      hover(item);
      preview.rest(item, pic);
    };
    c._onblur = () => { desc.classList.remove('on'); };
    c._onselect = () => opts.onOpen(item, items);
    return c;
  }

  function more() {
    const end = Math.min(items.length, rendered + CHUNK);
    for (let i = rendered; i < end; i++) {
      const c = card(items[i]);
      if (i >= end - 3 && end < items.length) {
        const prev = c._onfocus;
        c._onfocus = () => { prev(); if (rendered === end) more(); };
      }
      track.appendChild(c);
    }
    rendered = end;
    if (opts.onMore && rendered >= items.length) {
      const last = track.lastElementChild;
      if (last && !last._hooked) {
        last._hooked = true;
        const prev = last._onfocus;
        last._onfocus = () => { prev(); opts.onMore(); };
      }
    }
    if (opts.tail && rendered >= items.length && !track.querySelector('.nf-more')) {
      const m = h('div.nf-card.nf-more.fx', { onselect: opts.tail.onselect }, h('div.nf-art', null, h('span', { text: opts.tail.label })));
      m._onfocus = () => { preview.stop(); desc.classList.remove('on'); };
      track.appendChild(m);
    }
  }
  more();
  const head = h('div.shelf-head', null, h('h3.shelf-title', { text: title }), meta ? h('span.shelf-meta', { text: meta }) : null);
  const section = h('section.shelf.nf-shelf', { data: { row: id } }, head,
    h('div.rail', { data: { fgroup: id, pad: 96, align: 'start' } }, track), desc);
  section._append = (newItems) => { newItems.forEach((it) => items.push(it)); more(); };
  return section;
}
