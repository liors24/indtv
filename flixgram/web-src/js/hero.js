// The large "now focused" stage at the top of Home and Library.
import { h, fmtDurationWords, fmtSize, fmtDate } from './util.js';
import { displayTitle } from './media.js';
import { thumbUrl } from './td.js';
import { chatTitle } from './state.js';
import { setAmbient } from './ambient.js';
import { progress } from './components.js';

export function createHero() {
  const title = h('h1.hero-title');
  const sub = h('div.hero-sub');
  const meta = h('div.hero-meta');
  const cap = h('p.hero-cap');
  const text = h('div.hero-text', null, sub, title, meta, cap);
  const el = h('div.hero', null, text);
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
      if (p && p.dur) meta.appendChild(h('span.resume', { text: 'ממשיכים מ־' + Math.round((p.pos / p.dur) * 100) + '%' }));
      const lines = (item.caption || '').split('\n').filter((l) => l.trim());
      const genericName = !item.name || /^(video|file|document|audio)[_\-\d]*\.\w+$/i.test(item.name);
      const capText = lines.slice(1, 4).join(' ').trim() || (!genericName && item.name !== t.main ? item.name : '');
      cap.textContent = capText.length > 220 ? capText.slice(0, 220) + '…' : capText;
      text.classList.add('in');
    });
    setAmbient(item.thumb ? thumbUrl(item.thumb) : item.mini);
  }

  function showText(kicker, main, line) {
    ++token;
    sub.textContent = kicker || '';
    title.textContent = main || '';
    title.classList.toggle('long', (main || '').length > 26);
    meta.innerHTML = '';
    cap.textContent = line || '';
    text.classList.add('in');
  }

  return { el, show, showText };
}
