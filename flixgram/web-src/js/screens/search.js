import { h, debounce, svg, ICON, store } from '../util.js';
import * as td from '../td.js';
import { itemFromMessage } from '../media.js';
import { mediaCard, spinner, emptyState, avatar } from '../components.js';
import { openItem } from '../player.js';
import { setAmbient } from '../ambient.js';
import { hover } from '../prefetch.js';
import { getChat, orderedChats, chatTitle, subscribe } from '../state.js';
import { focus } from '../focus.js';

// Search everywhere, or inside one chat picked from the horizontal scope bar.
export function searchScreen(app) {
  const input = h('input.search-input.fx.is-default', { type: 'search', placeholder: 'מה בא לכם לראות?', dir: 'auto', autocomplete: 'off' });
  const box = h('div.search-box', null, svg(ICON.search, 34), input);
  const scopeTrack = h('div.rail-track');
  const scopeBar = h('div.rail.scope-bar', { data: { fgroup: 'scope', pad: 96 } }, scopeTrack);
  const recent = h('div.chips.recent', { data: { fgroup: 'recent' } });
  const results = h('div.search-results');
  const scroll = h('div.lib-scroll', { 'data-vscroll': '0' }, results);
  const el = h('div.screen.search', null, h('div.search-top', null, box), scopeBar, h('div.search-top.tight', null, recent), scroll);
  let token = 0;
  let scope = 0; // 0 = all of Telegram, otherwise a chat id

  function scopeChip(id, label, chat) {
    const chip = h('div.chip.scope.fx' + (id === scope ? '.on' : ''), { data: { scope: id } },
      chat ? avatar(chat, 36) : svg(ICON.search, 24), h('span', { text: label }));
    chip._onselect = () => {
      scope = id;
      Array.prototype.forEach.call(scopeTrack.children, (c) => c.classList.toggle('on', c.dataset.scope === String(id)));
      input.placeholder = id ? `חיפוש בתוך ${label}` : 'מה בא לכם לראות?';
      run(input.value, true);
    };
    return chip;
  }

  function buildScopes() {
    const keepFocus = scopeTrack.querySelector('.is-focus');
    if (keepFocus) return; // never rebuild under the cursor
    scopeTrack.innerHTML = '';
    scopeTrack.appendChild(scopeChip(0, 'כל טלגרם'));
    orderedChats().slice(0, 40).forEach((c) => scopeTrack.appendChild(scopeChip(c.id, c.title, c)));
  }

  function renderRecent() {
    recent.innerHTML = '';
    store.get('recentSearches', []).slice(0, 8).forEach((q) => {
      recent.appendChild(h('div.chip.fx', { onselect: () => { input.value = q; run(q); } }, h('span', { text: q })));
    });
  }

  async function searchGlobal(q) {
    const [v, d, p] = await Promise.all(['searchMessagesFilterVideo', 'searchMessagesFilterDocument', 'searchMessagesFilterPhoto'].map((f) => td.send({
      '@type': 'searchMessages', chat_list: null, only_in_channels: false, query: q, offset: '', limit: 60,
      filter: { '@type': f }, min_date: 0, max_date: 0,
    }).catch(() => ({ messages: [] }))));
    return v.messages.concat(d.messages, p.messages);
  }

  async function searchChat(chatId, q) {
    const [v, d, p] = await Promise.all(['searchMessagesFilterVideo', 'searchMessagesFilterDocument', 'searchMessagesFilterPhoto'].map((f) => td.send({
      '@type': 'searchChatMessages', chat_id: chatId, query: q, sender_id: null, from_message_id: 0, offset: 0, limit: 100,
      filter: { '@type': f }, message_thread_id: 0, saved_messages_topic_id: 0,
    }).catch(() => ({ messages: [] }))));
    return v.messages.concat(d.messages, p.messages);
  }

  async function run(q, fromScope) {
    q = (q || '').trim();
    const my = ++token;
    results.innerHTML = '';
    // inside a chat an empty query lists everything in it; globally we need at least 2 letters
    if (!scope && q.length < 2) { showHint(); return; }
    results.appendChild(h('div.loading-row', null, spinner()));
    if (q.length >= 2) {
      const rs = store.get('recentSearches', []).filter((x) => x !== q);
      rs.unshift(q);
      store.set('recentSearches', rs.slice(0, 12));
    }
    let items = [];
    try {
      const msgs = scope ? await searchChat(scope, q) : await searchGlobal(q);
      const seen = new Set();
      items = msgs.map(itemFromMessage).filter((i) => {
        if (!i || (i.kind !== 'video' && i.kind !== 'photo') || seen.has(i.key)) return false;
        seen.add(i.key);
        return true;
      });
      items.sort((a, b) => b.date - a.date);
      await Promise.all(Array.from(new Set(items.map((i) => i.chatId))).map(getChat));
    } catch (e) { items = []; }
    if (my !== token) return;
    results.innerHTML = '';
    renderRecent();
    const where = scope ? ` ב${chatTitle(scope)}` : '';
    if (!items.length) {
      results.appendChild(emptyState(q ? `לא מצאנו כלום עבור "${q}"${where}` : `אין מדיה${where}`,
        scope ? 'נסו מילה אחרת, או חזרו ל"כל טלגרם"' : 'נסו מילה אחרת, שם של סדרה או מספר פרק'));
      return;
    }
    const videos = items.filter((i) => i.kind === 'video');
    const photos = items.filter((i) => i.kind === 'photo');
    section('סרטונים' + where, videos, false);
    section('תמונות' + where, photos, true);
    if (!fromScope) {
      const first = results.querySelector('.fx');
      if (first) setTimeout(() => { if (document.activeElement !== input) focus(results.querySelector('.fx')); }, 50);
    }
  }

  function section(title, list, photos) {
    if (!list.length) return;
    results.appendChild(h('div.shelf-head', { data: { row: title } }, h('h3.shelf-title', { text: title }), h('span.shelf-meta', { text: String(list.length) })));
    const g = h('div.grid' + (photos ? '.photos' : ''));
    list.forEach((it) => {
      const c = mediaCard(it, { noText: photos });
      c._onfocus = () => { setAmbient(it.thumb ? td.thumbUrl(it.thumb) : it.mini); hover(it); };
      c._onselect = () => openItem(it, list);
      g.appendChild(c);
    });
    results.appendChild(g);
  }

  function showHint() {
    results.innerHTML = '';
    results.appendChild(emptyState('חיפוש בכל טלגרם או בתוך צ׳אט',
      'בחרו בשורה למעלה איפה לחפש: "כל טלגרם", או ערוץ/קבוצה/צ׳אט מסוים. בתוך צ׳אט אפשר גם בלי מילים, ותופיע כל המדיה שבו.'));
  }

  const live = debounce(() => run(input.value), 900);
  input.addEventListener('input', live);
  input._onfocus = () => box.classList.add('on');
  input._onblur = () => box.classList.remove('on');
  input.addEventListener('keydown', (e) => {
    if (e.keyCode === 13) {
      e.preventDefault();
      input.blur();
      run(input.value);
    }
  });

  subscribe(() => { if (app && app.current === 'search') buildScopes(); });

  return {
    el,
    show(params) {
      buildScopes();
      renderRecent();
      if (params && params.chatId) {
        const chip = scopeTrack.querySelector(`[data-scope="${params.chatId}"]`);
        if (chip) chip._onselect();
      } else if (!results.firstChild) showHint();
    },
    focusContent() { focus(input); },
  };
}
