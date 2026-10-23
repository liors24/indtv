// The large "now focused" stage at the top of Home and Library.
import { h, fmtDurationWords, fmtSize, fmtDate } from './util.js';
import { displayTitle } from './media.js';
import { thumbUrl } from './td.js';
import { chatTitle } from './state.js';
import { setAmbient } from './ambient.js';
import { progress } from './components.js';
import { hover } from './prefetch.js';
import * as preview from './preview.js';

export function createHero() {
  const title = h('h1.hero-title');
  const sub = h('div.hero-sub');
  const meta = h('div.hero-meta');
  const cap = h('p.hero-cap');
  const text = h('div.hero-text', null, sub, title, meta, cap);
  // the backdrop: the focused video's own picture, large, fading into the room (shown by the calm theme)
  const arts = [h('div.hero-art-img'), h('div.hero-art-img')];
  const art = h('div.hero-art', null, arts[0], arts[1]);
  let artFront = 0, artSrc = '';
  function setArt(src) {
    if (src === artSrc) return;
    artSrc = src;
    const next = arts[1 - artFront];
    if (!src) { arts.forEach((a) => a.classList.remove('on')); return; }
    const img = new Image();
    img.onload = () => {
      if (artSrc !== src) return;
      next.style.backgroundImage = 'url("' + src + '")';
      next.classList.add('on');
      arts[artFront].classList.remove('on');
      artFront = 1 - artFront;
    };
    img.src = src;
  }
  const el = h('div.hero', null, art, text);
  let token = 0;

  function show(item, extra) {
    const my = ++token;
    text.classList.remove('in');
    // restart the entrance on the next frame so quick moves feel immediate
    requestAnimationFrame(() => {
      if (my !== token) return;
      const t = displayTitle(item);
      title.textContent = t.main;
      title.classList.toggle('long', t.main.length > 26);
      sub.textContent = extra && extra.kicker ? extra.kicker : (t.sub || chatTitle(item.chatId));
      const bits = [];
      if (t.sub && extra && extra.kicker) bits.push(t.sub);
      if (item.duration) bits.push(fmtDurationWords(item.duration));
      if (item.height) bits.push(item.height >= 2000 ? '4K' : item.height >= 1000 ? 'Full HD' : item.height >= 700 ? 'HD' : 'SD');
      if (item.size) bits.push(fmtSize(item.size));
      if (item.date) bits.push(fmtDate(item.date));
      const p = progress.get(item.key);
      meta.innerHTML = '';
      bits.forEach((b) => meta.appendChild(h('span', { text: b, dir: 'auto' })));
      if (p && p.dur && p.pos > 20) {
        const left = Math.max(1, Math.round((p.dur - p.pos) / 60));
        meta.appendChild(h('span.resume', { text: 'OK ממשיך מאיפה שעצרת · נשארו ' + left + ' דק׳' }));
      }
      const lines = (item.caption || '').split('\n').filter((l) => l.trim());
      const genericName = !item.name || /^(video|file|document|audio)[_\-\d]*\.\w+$/i.test(item.name);
      const capText = lines.slice(1, 4).join(' ').trim() || (!genericName && item.name !== t.main ? item.name : '');
      cap.textContent = capText.length > 220 ? capText.slice(0, 220) + '…' : capText;
      text.classList.add('in');
    });
    setAmbient(item.thumb ? thumbUrl(item.thumb) : item.mini);
    setArt(item.thumb ? thumbUrl(item.thumb) : item.mini || '');
    hover(item);
    preview.rest(item);
  }

  function showText(kicker, main, line) {
    ++token;
    preview.stop();
    setArt('');
    sub.textContent = kicker || '';
    title.textContent = main || '';
    title.classList.toggle('long', (main || '').length > 26);
    meta.innerHTML = '';
    cap.textContent = line || '';
    text.classList.add('in');
  }

  return { el, show, showText };
}
