import { h, debounce } from '../util.js';
import * as td from '../td.js';
import { itemFromMessage, organise } from '../media.js';
import { mediaCard, rail, progress, spinner, emptyState, button } from '../components.js';
import { createHero } from '../hero.js';
import { chatTitle, getChat } from '../state.js';
import { openItem } from '../player.js';
import { focusFirst, focused } from '../focus.js';

export function homeScreen(app) {
  const hero = createHero();
  const rows = h('div.rows');
  const body = h('div.home-body', { 'data-vscroll': '6' }, rows);
  const el = h('div.screen.home', null, hero.el, body);
  let loaded = false;
  let firstRender = true;
  let loading = false;
  let globalItems = [];
  let nextOffset = '';

  const onFocusItem = debounce((item, kicker) => hero.show(item, { kicker }), 90);

  function cardFor(list, kicker) {
    return (item) => {
      const c = mediaCard(item, {});
      c._onfocus = () => onFocusItem(item, kicker);
      c._onselect = () => openItem(item, list);
      return c;
    };
  }

  async function load() {
    if (loading) return;
    loading = true;
    rows.innerHTML = '';
    rows.appendChild(h('div.loading-row', null, spinner()));
    hero.showText('', 'רגע, אוספים את המדיה שלכם', 'סורקים את הערוצים והקבוצות בטלגרם');
    try {
      const res = await td.send({
        '@type': 'searchMessages', chat_list: { '@type': 'chatListMain' }, only_in_channels: false, query: '', offset: '',
        limit: 100, filter: { '@type': 'searchMessagesFilterVideo' }, min_date: 0, max_date: 0,
      });
      nextOffset = res.next_offset || '';
      globalItems = res.messages.map(itemFromMessage).filter(Boolean);
      // make sure chat titles are known
      await Promise.all(Array.from(new Set(globalItems.map((i) => i.chatId))).map((id) => getChat(id)));
    } catch (e) {
      globalItems = [];
    }
    loading = false;
    loaded = true;
    render();
  }

  function render() {
    rows.innerHTML = '';
    const recents = progress.recent().map((p) => Object.assign({ stale: true }, p.item)).filter((i) => i.kind === 'video' || i.kind === 'audio');
    let first = null;
    if (recents.length) {
      const r = rail('continue', 'המשך צפייה', '', recents, cardFor(recents, 'המשך צפייה'));
      rows.appendChild(r);
      first = first || r;
    }
    if (globalItems.length) {
      const latest = globalItems.slice();
      const r = rail('latest', 'חדש בערוצים שלך', '', latest, cardFor(latest), {
        onMore: async () => {
          if (!nextOffset) return;
          const off = nextOffset;
          nextOffset = '';
          try {
            const res = await td.send({
              '@type': 'searchMessages', chat_list: { '@type': 'chatListMain' }, only_in_channels: false, query: '', offset: off,
              limit: 100, filter: { '@type': 'searchMessagesFilterVideo' }, min_date: 0, max_date: 0,
            });
            nextOffset = res.next_offset || '';
            r._append(res.messages.map(itemFromMessage).filter(Boolean));
          } catch (e) { /* end */ }
        },
      });
      rows.appendChild(r);
      first = first || r;

      // series detected across everything we just saw
      organise(globalItems).filter((s) => s.kind === 'series').slice(0, 4).forEach((s) => {
        rows.appendChild(rail(s.id, s.title, s.multiSeason ? `עונה ${s.season}` : `${s.items.length} פרקים`, s.items, (item) => {
          const c = mediaCard(item, { episodeBadge: true });
          c._onfocus = () => onFocusItem(item);
          c._onselect = () => openItem(item, s.items);
          return c;
        }));
      });

      // one shelf per channel, busiest first
      const byChat = new Map();
      globalItems.forEach((i) => {
        if (!byChat.has(i.chatId)) byChat.set(i.chatId, []);
        byChat.get(i.chatId).push(i);
      });
      Array.from(byChat.entries()).filter((e) => e[1].length >= 2).sort((a, b) => b[1].length - a[1].length).slice(0, 8)
        .forEach(([chatId, list]) => {
          const shelf = rail('chat' + chatId, chatTitle(chatId) || 'ערוץ', '', list, cardFor(list));
          const more = h('div.card.more.fx', { onselect: () => app.go('library', { chatId }) }, h('div.card-art', null, h('span', { text: 'לכל המדיה בערוץ' })));
          shelf.querySelector('.rail-track').appendChild(more);
          rows.appendChild(shelf);
        });
    }
    if (!first) {
      hero.showText('', 'עוד אין כאן סרטונים', 'ברגע שיעלו סרטונים לערוצים ולקבוצות שלכם הם יופיעו כאן');
      rows.appendChild(emptyState('הספרייה ריקה', 'אפשר לבחור ערוץ ספציפי בספרייה', button('לספרייה', () => app.go('library'), { primary: true })));
    }
    const f = focused();
    if (app.current === 'home' && (firstRender || !f || !document.body.contains(f))) focusFirst(rows);
    else if (first) { const c = first.querySelector('.card'); if (c && c._item) hero.show(c._item, {}); }
    firstRender = false;
  }

  return {
    el,
    show() {
      if (!loaded) load();
      else if (app.isStale('home')) load();
    },
    refresh: load,
    focusContent() {
      focusFirst(rows);
    },
  };
}
