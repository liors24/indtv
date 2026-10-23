import { h, debounce, store } from '../util.js';
import * as td from '../td.js';
import { itemFromMessage, organise } from '../media.js';
import { mediaCard, rail, progress, spinner, emptyState, button } from '../components.js';
import { createHero } from '../hero.js';
import { chatTitle, getChat } from '../state.js';
import { openItem } from '../player.js';
import { focusFirst, focused } from '../focus.js';
import * as reco from '../reco.js';
import * as preview from '../preview.js';
import { theme } from '../theme.js';
import { billboard, tilesRow, posterRail } from '../nfhome.js';

export function homeScreen(app) {
  const hero = createHero();
  const rows = h('div.rows');
  const body = h('div.home-body', { 'data-vscroll': '6' }, rows);
  const el = h('div.screen.home', null, hero.el, body);
  let loaded = false;
  let firstRender = true;
  let loading = false;
  let globalItems = [];
  let pool = [];          // candidates for recommendations: latest everywhere + your favourite chats
  let poolDay = 0;
  let nextOffset = '';
  let drawnTheme = '';

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
    el.classList.toggle('nf', theme() === 'calm');
    hero.showText('', 'רגע, אוספים את המדיה שלכם', 'סורקים את הערוצים והקבוצות בטלגרם');
    try {
      const res = await td.send({
        '@type': 'searchMessages', chat_list: { '@type': 'chatListMain' }, only_in_channels: false, query: '', offset: '',
        limit: 100, filter: { '@type': 'searchMessagesFilterVideo' }, min_date: 0, max_date: 0,
      });
      nextOffset = res.next_offset || '';
      const hid = new Set(store.get('hiddenChats', []).map(String));   // chats hidden in the library stay out of Home too
      globalItems = res.messages.map(itemFromMessage).filter((i) => i && !hid.has(String(i.chatId)));
      // a deeper pool from the chats you actually watch
      const fav = reco.topChats(6).filter((id) => !hid.has(String(id))).slice(0, 4);
      const extra = await Promise.all(fav.map((chatId) => td.send({
        '@type': 'searchChatMessages', chat_id: chatId, query: '', sender_id: null, from_message_id: 0, offset: 0, limit: 80,
        filter: { '@type': 'searchMessagesFilterVideo' }, message_thread_id: 0, saved_messages_topic_id: 0,
      }).then((r) => r.messages.map(itemFromMessage).filter(Boolean)).catch(() => [])));
      const seen = new Set();
      pool = globalItems.concat.apply(globalItems, extra).filter((i) => !seen.has(i.key) && seen.add(i.key));
      poolDay = reco.dayKey();
      // make sure chat titles are known
      await Promise.all(Array.from(new Set(globalItems.map((i) => i.chatId))).map((id) => getChat(id)));
    } catch (e) {
      globalItems = [];
    }
    loading = false;
    loaded = true;
    render();
  }

  // What Home shows, independent of how it is drawn.
  function sections() {
    const out = [];
    const recents = progress.recent().map((p) => Object.assign({ stale: true }, p.item)).filter((i) => i.kind === 'video' || i.kind === 'audio');
    if (recents.length) out.push({ id: 'continue', title: 'המשך צפייה', meta: '', items: recents, kicker: 'המשך צפייה' });
    let pick = null, pickList = null, pickKicker = '';
    if (pool.length) {
      const inProgress = new Set(recents.map((i) => i.key));
      const nexts = reco.nextEpisodes(pool).filter((i) => !inProgress.has(i.key));
      if (nexts.length) out.push({ id: 'next', title: 'הפרקים הבאים שלך', meta: 'ממשיכים מאיפה שעצרת', items: nexts, kicker: 'הפרק הבא בשבילך' });
      const exclude = new Set(nexts.map((i) => i.key).concat(Array.from(inProgress)));
      const recs = reco.recommend(pool, exclude, 16);
      if (recs.length) {
        const learned = reco.hasHistory();
        out.push({
          id: 'reco', title: learned ? 'המומלצים שלך להיום' : 'בחירות היום',
          meta: learned ? 'לפי מה שאתה הכי צופה, מתחלף כל יום' : 'מתחלף כל יום, ולומד ממה שאתה צופה', items: recs,
          kickerFor: (item) => (item._why && item._why.indexOf('chat:') !== 0 ? `כי אתה צופה ב־${item._why}` : (learned ? 'מומלץ בשבילך' : 'בחירת היום')),
        });
        pick = recs[0]; pickList = recs; pickKicker = learned ? 'מומלץ בשבילך' : 'בחירת היום';
        const fav = reco.favouriteSeriesName();
        const favChat = reco.topChats(1)[0];
        if (learned && favChat) {
          const more = pool.filter((i) => i.chatId === favChat && !exclude.has(i.key) && recs.indexOf(i) < 0).slice(0, 20);
          if (more.length >= 3) out.push({ id: 'because', title: `כי אתה אוהב את ${chatTitle(favChat) || fav}`, meta: '', items: more });
        }
      }
    }
    const chatsSeen = [];
    if (globalItems.length) {
      const latest = globalItems.slice();
      out.push({ id: 'latest', title: 'חדש בערוצים שלך', meta: '', items: latest, onMore: true });
      if (!pick) { pick = latest[0]; pickList = latest; pickKicker = 'חדש בערוצים שלך'; }
      organise(globalItems).filter((s) => s.kind === 'series').slice(0, 4).forEach((s) => {
        out.push({ id: s.id, title: s.title, meta: s.multiSeason ? `עונה ${s.season}` : `${s.items.length} פרקים`, items: s.items, episodes: true });
      });
      const byChat = new Map();
      globalItems.forEach((i) => {
        if (!byChat.has(i.chatId)) byChat.set(i.chatId, []);
        byChat.get(i.chatId).push(i);
      });
      Array.from(byChat.entries()).sort((a, b) => b[1].length - a[1].length).forEach(([chatId, list]) => {
        chatsSeen.push({ id: chatId, title: chatTitle(chatId) || 'ערוץ' });
        if (list.length >= 2 && out.filter((x) => x.chatId).length < 8) out.push({ id: 'chat' + chatId, chatId, title: chatTitle(chatId) || 'ערוץ', meta: '', items: list });
      });
    }
    return { list: out, recents, pick, pickList, pickKicker, chats: chatsSeen };
  }

  async function moreLatest(r) {
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
  }

  function render() {
    drawnTheme = theme();
    preview.stop();
    rows.innerHTML = '';
    rows.style.transform = ''; rows._ty = 0;
    el.classList.toggle('nf', drawnTheme === 'calm');
    if (drawnTheme === 'calm') return renderStreaming();
    const S = sections();
    let first = null;
    S.list.forEach((sec) => {
      const r = rail(sec.id, sec.title, sec.meta, sec.items, (item) => {
        const c = mediaCard(item, sec.episodes ? { episodeBadge: true } : {});
        c._onfocus = () => onFocusItem(item, sec.kickerFor ? sec.kickerFor(item) : sec.kicker);
        c._onselect = () => openItem(item, sec.items);
        return c;
      }, sec.onMore ? { onMore: () => moreLatest(r) } : undefined);
      if (sec.chatId) {
        const more = h('div.card.more.fx', { onselect: () => app.go('library', { chatId: sec.chatId }) }, h('div.card-art', null, h('span', { text: 'לכל המדיה בערוץ' })));
        r.querySelector('.rail-track').appendChild(more);
      }
      rows.appendChild(r);
      first = first || r;
    });
    if (!first) {
      hero.showText('', 'עוד אין כאן סרטונים', 'ברגע שיעלו סרטונים לערוצים ולקבוצות שלכם הם יופיעו כאן');
      rows.appendChild(emptyState('הספרייה ריקה', 'אפשר לבחור ערוץ ספציפי בספרייה', button('לספרייה', () => app.go('library'), { primary: true })));
    }
    const f = focused();
    if (app.current === 'home' && (firstRender || !f || !document.body.contains(f))) {
      // land on today's pick so the hero opens with a recommendation
      const pickCard = S.pick && rows.querySelector('[data-row="reco"] .card');
      if (pickCard && !S.recents.length) focusFirst(rows, pickCard); else focusFirst(rows);
    }
    else if (first) { const c = first.querySelector('.card'); if (c && c._item) hero.show(c._item, {}); }
    firstRender = false;
  }

  function renderStreaming() {
    const S = sections();
    if (S.pick) {
      rows.appendChild(billboard(S.pick, {
        kicker: S.pickKicker,
        onPlay: () => openItem(S.pick, S.pickList),
        onMore: () => app.go('library', { chatId: S.pick.chatId }),
        moreLabel: 'לכל המדיה בערוץ',
      }));
    }
    if (S.chats.length > 1) rows.appendChild(tilesRow(S.chats.slice(0, 14), (chatId) => app.go('library', { chatId })));
    S.list.forEach((sec) => {
      const r = posterRail(sec.id, sec.title, sec.meta, sec.items, {
        episodes: sec.episodes,
        onOpen: (item, list) => openItem(item, list),
        onMore: sec.onMore ? () => moreLatest(r) : null,
        tail: sec.chatId ? { label: 'לכל המדיה בערוץ', onselect: () => app.go('library', { chatId: sec.chatId }) } : null,
      });
      rows.appendChild(r);
    });
    if (!S.pick) {
      rows.appendChild(emptyState('עוד אין כאן סרטונים', 'ברגע שיעלו סרטונים לערוצים ולקבוצות שלכם הם יופיעו כאן. אפשר גם לבחור ערוץ בספרייה.', button('לספרייה', () => app.go('library'), { primary: true })));
    }
    const f = focused();
    if (app.current === 'home' && (firstRender || !f || !document.body.contains(f))) focusFirst(rows);
    firstRender = false;
  }

  return {
    el,
    show() {
      // a new day means new picks
      if (!loaded || app.isStale('home') || poolDay !== reco.dayKey()) load();
      else if (drawnTheme !== theme()) render();
    },
    refresh: load,
    focusContent() {
      focusFirst(rows);
    },
  };
}
