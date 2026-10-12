import { h, debounce, svg, ICON } from '../util.js';
import * as td from '../td.js';
import { itemFromMessage, organise } from '../media.js';
import { mediaCard, rail, spinner, emptyState, avatar, sidePanel } from '../components.js';
import { createHero } from '../hero.js';
import { orderedChats, subscribe, chatKind, getChat } from '../state.js';
import { openItem } from '../player.js';
import { focusFirst, focus, resetScroll } from '../focus.js';

const TABS = [
  { id: 'video', label: 'סרטונים', icon: ICON.film },
  { id: 'photo', label: 'תמונות', icon: ICON.photo },
  { id: 'audio', label: 'מוזיקה', icon: ICON.note },
];

const KIND_LABEL = { channel: 'ערוץ', group: 'קבוצה', user: 'צ׳אט', other: '' };

async function search(chatId, filter, from) {
  return td.send({
    '@type': 'searchChatMessages', chat_id: chatId, query: '', sender_id: null, from_message_id: from || 0, offset: 0,
    limit: 100, filter: { '@type': filter }, message_thread_id: 0, saved_messages_topic_id: 0,
  });
}

// Pages through a filter; returns {items, next} where next() loads more.
function pager(chatId, filter, accept) {
  let from = 0;
  let done = false;
  return async function nextPage() {
    if (done) return [];
    try {
      const r = await search(chatId, filter, from);
      from = r.next_from_message_id || 0;
      if (!from || !r.messages.length) done = true;
      return r.messages.map(itemFromMessage).filter((i) => i && accept(i));
    } catch (e) {
      done = true;
      return [];
    }
  };
}

export function libraryScreen(app) {
  const side = h('div.lib-side-list', { 'data-flist': '' });
  const titleEl = h('h1.lib-title');
  const tabs = h('div.chips', { data: { fgroup: 'tabs' } });
  const hero = createHero();
  hero.el.classList.add('compact');
  const contentInner = h('div.lib-content');
  const content = h('div.lib-scroll', { 'data-vscroll': '0' }, contentInner);
  const main = h('div.lib-main', null, h('div.lib-head', null, titleEl, tabs), hero.el, content);
  const el = h('div.screen.library');
  const sideWrap = sidePanel('lib-side', 'library', 'ערוצים וצ׳אטים', side, el);
  el.appendChild(sideWrap);
  el.appendChild(main);
  sideWrap._init();

  let chatId = 0;
  let tab = 'video';
  let reqToken = 0;
  let sideBuilt = false;

  const onFocusItem = debounce((item) => hero.show(item, {}), 90);

  function buildTabs() {
    tabs.innerHTML = '';
    TABS.forEach((t) => {
      const chip = h('div.chip.fx' + (t.id === tab ? '.on' : ''), {
        onselect: () => { tab = t.id; buildTabs(); loadContent(true); },
      }, svg(t.icon, 24), h('span', { text: t.label }));
      tabs.appendChild(chip);
    });
    tabs.appendChild(h('div.chip.fx', { onselect: () => { if (chatId) app.go('search', { chatId }); } }, svg(ICON.search, 24), h('span', { text: 'חיפוש כאן' })));
  }

  function buildSide() {
    const list = orderedChats().slice(0, 160);
    if (!list.length) return;
    sideBuilt = true;
    const sp = side.querySelector('.loading-row');
    if (sp) sp.remove();
    const keep = new Set();
    list.forEach((c) => {
      keep.add(String(c.id));
      if (side.querySelector(`[data-chat="${c.id}"]`)) return;
      const row = h('div.src.fx', { data: { chat: c.id } }, avatar(c, 52), h('div.src-text', null,
        h('div.src-title', { text: c.title }), h('div.src-kind', { text: KIND_LABEL[chatKind(c)] || '' })));
      row._onfocus = () => previewChat(c.id);
      row._onselect = () => {
        selectChat(c.id, true);
      };
      side.appendChild(row);
    });
  }

  const previewChat = debounce((id) => { if (id !== chatId) selectChat(id, false); }, 650);

  async function selectChat(id, enter) {
    if (id !== chatId) {
      chatId = id;
      Array.prototype.forEach.call(side.children, (r) => r.classList.toggle('sel', r.dataset.chat === String(id)));
      const c = await getChat(id);
      titleEl.textContent = c ? c.title : '';
      loadContent(false).then(() => { if (enter) focusContent(); });
    } else if (enter) focusContent();
  }

  function focusContent() {
    const first = contentInner.querySelector('.fx');
    if (first) focus(first); else focusFirst(tabs);
  }

  function grid(items, renderOpts, list) {
    const g = h('div.grid');
    items.forEach((it) => g.appendChild(cardOf(it, list || items, renderOpts)));
    return g;
  }

  function cardOf(item, list, opts) {
    const c = mediaCard(item, opts || {});
    c._onfocus = () => onFocusItem(item);
    c._onselect = () => openItem(item, list);
    return c;
  }

  async function loadContent() {
    const my = ++reqToken;
    resetScroll(el);
    contentInner.innerHTML = '';
    contentInner.appendChild(h('div.loading-row', null, spinner()));
    if (!chatId) return;
    let items = [];
    let more = null;
    if (tab === 'video') {
      const pv = pager(chatId, 'searchMessagesFilterVideo', () => true);
      const pd = pager(chatId, 'searchMessagesFilterDocument', (i) => i.kind === 'video');
      const [a, d] = await Promise.all([pv(), pd()]);
      items = a.concat(await pv(), d);
      more = async () => (await pv()).concat(await pd());
    } else if (tab === 'photo') {
      const pp = pager(chatId, 'searchMessagesFilterPhoto', () => true);
      items = (await pp()).concat(await pp());
      more = pp;
    } else {
      const pa = pager(chatId, 'searchMessagesFilterAudio', () => true);
      const pd = pager(chatId, 'searchMessagesFilterDocument', (i) => i.kind === 'audio');
      items = (await pa()).concat(await pd());
      more = async () => (await pa()).concat(await pd());
    }
    if (my !== reqToken) return;
    render(items, more);
  }

  function render(items, more) {
    contentInner.innerHTML = '';
    if (!items.length) {
      const what = tab === 'video' ? 'סרטונים' : tab === 'photo' ? 'תמונות' : 'קטעי שמע';
      contentInner.appendChild(emptyState(`אין כאן ${what}`, 'נסו לשונית אחרת או ערוץ אחר מהרשימה'));
      hero.showText('', '', '');
      return;
    }
    if (tab === 'video') {
      const shelves = organise(items);
      let loose = [];
      shelves.forEach((s) => {
        if (s.kind === 'series' || s.kind === 'movies') {
          contentInner.appendChild(rail(s.id, s.title,
            s.kind === 'series' ? (s.multiSeason ? `עונה ${s.season}, ${s.items.length} פרקים` : `${s.items.length} פרקים`) : `${s.items.length}`, s.items, (it) => cardOf(it, s.items, { episodeBadge: s.kind === 'series' }), { pad: 80 }));
        } else loose = s.items;
      });
      if (loose.length) {
        contentInner.appendChild(h('div.shelf-head.grid-head', { data: { row: 'gh' } }, h('h3.shelf-title', { text: shelves.length > 1 ? 'עוד סרטונים' : 'כל הסרטונים' }), h('span.shelf-meta', { text: String(loose.length) })));
        contentInner.appendChild(grid(loose));
      }
    } else {
      const g = grid(items, { noText: tab === 'photo' });
      if (tab === 'photo') g.classList.add('photos');
      contentInner.appendChild(g);
      hookMore(g, items, more);
    }
    const f = contentInner.querySelector('.card');
    if (f && f._item) hero.show(f._item, {});
  }

  function hookMore(g, items, more) {
    if (!more) return;
    const last = g.lastElementChild;
    if (!last) return;
    const prev = last._onfocus;
    last._onfocus = async () => {
      if (prev) prev();
      last._onfocus = prev;
      const add = await more();
      add.forEach((it) => { items.push(it); g.appendChild(cardOf(it, items, { noText: tab === 'photo' })); });
      if (add.length) hookMore(g, items, more);
    };
  }

  buildTabs();
  subscribe(() => { if (app.current === 'library') buildSide(); });

  return {
    el,
    show(params) {
      buildSide();
      if (params && params.chatId) selectChat(params.chatId, true);
      else if (!chatId) {
        const first = orderedChats().find((c) => chatKind(c) === 'channel') || orderedChats()[0];
        if (first) selectChat(first.id, false);
      }
      if (!sideBuilt) side.appendChild(h('div.loading-row', null, spinner()));
    },
    focusContent() {
      const sel = side.querySelector('.sel') || side.querySelector('.fx');
      if (sel) focus(sel);
    },
  };
}
