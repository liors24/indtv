import { h, debounce, svg, ICON, store } from '../util.js';
import * as td from '../td.js';
import { itemFromMessage } from '../media.js';
import { mediaCard, spinner, emptyState } from '../components.js';
import { openItem } from '../player.js';
import { setAmbient } from '../ambient.js';
import { getChat } from '../state.js';
import { focus } from '../focus.js';

export function searchScreen() {
  const input = h('input.search-input.fx.is-default', { type: 'search', placeholder: 'מה בא לכם לראות?', dir: 'auto', autocomplete: 'off' });
  const box = h('div.search-box', null, svg(ICON.search, 34), input);
  const recent = h('div.chips.recent', { data: { fgroup: 'recent' } });
  const results = h('div.search-results');
  const scroll = h('div.lib-scroll', { 'data-vscroll': '0' }, results);
  const el = h('div.screen.search', null, h('div.search-top', null, box, recent), scroll);
  let token = 0;

  function renderRecent() {
    recent.innerHTML = '';
    store.get('recentSearches', []).slice(0, 8).forEach((q) => {
      recent.appendChild(h('div.chip.fx', { onselect: () => { input.value = q; run(q); } }, h('span', { text: q })));
    });
  }

  async function run(q) {
    q = (q || '').trim();
    const my = ++token;
    results.innerHTML = '';
    if (q.length < 2) return;
    results.appendChild(h('div.loading-row', null, spinner()));
    const rs = store.get('recentSearches', []).filter((x) => x !== q);
    rs.unshift(q);
    store.set('recentSearches', rs.slice(0, 12));
    let items = [];
    try {
      const [v, d] = await Promise.all(['searchMessagesFilterVideo', 'searchMessagesFilterDocument'].map((f) => td.send({
        '@type': 'searchMessages', chat_list: null, only_in_channels: false, query: q, offset: '', limit: 60,
        filter: { '@type': f }, min_date: 0, max_date: 0,
      }).catch(() => ({ messages: [] }))));
      items = v.messages.concat(d.messages).map(itemFromMessage).filter((i) => i && i.kind === 'video');
      items.sort((a, b) => b.date - a.date);
      await Promise.all(Array.from(new Set(items.map((i) => i.chatId))).map(getChat));
    } catch (e) { items = []; }
    if (my !== token) return;
    results.innerHTML = '';
    renderRecent();
    if (!items.length) {
      results.appendChild(emptyState(`לא מצאנו סרטונים עבור "${q}"`, 'נסו מילה אחרת, שם של סדרה או מספר פרק'));
      return;
    }
    results.appendChild(h('div.shelf-head', null, h('h3.shelf-title', { text: 'סרטונים' }), h('span.shelf-meta', { text: String(items.length) })));
    const g = h('div.grid');
    items.forEach((it) => {
      const c = mediaCard(it);
      c._onfocus = () => setAmbient(it.thumb ? td.thumbUrl(it.thumb) : it.mini);
      c._onselect = () => openItem(it, items);
      g.appendChild(c);
    });
    results.appendChild(g);
  }

  const live = debounce(() => run(input.value), 900);
  input.addEventListener('input', live);
  input._onfocus = () => box.classList.add('on');
  input._onblur = () => box.classList.remove('on');
  input.addEventListener('keydown', (e) => {
    if (e.keyCode === 13) {
      e.preventDefault();
      run(input.value);
      input.blur();
      const first = results.querySelector('.fx');
      if (first) setTimeout(() => focus(results.querySelector('.fx') || input), 600);
    }
  });

  return {
    el,
    show() {
      renderRecent();
      if (!results.firstChild) results.appendChild(emptyState('חיפוש בכל טלגרם', 'שם של סדרה, סרט, שחקן או "פרק 5". מחפשים בכל הערוצים, הקבוצות והצ׳אטים שלכם בבת אחת.'));
    },
    focusContent() { focus(input); },
  };
}
