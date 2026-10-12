import { h, debounce, fmtDate, svg, ICON, pad2 } from '../util.js';
import * as td from '../td.js';
import { orderedChats, subscribe, previewText, senderName, chatKind, getChat } from '../state.js';
import { avatar, lazyImg, spinner, emptyState, sidePanel } from '../components.js';
import { itemFromMessage } from '../media.js';
import { openItem } from '../player.js';
import { focus, focusFirst } from '../focus.js';
import { toast } from '../ui.js';

export function chatsScreen(app) {
  const list = h('div.chat-list', { 'data-flist': '' });
  const msgs = h('div.msgs');
  const msgScroll = h('div.msg-scroll', { 'data-vscroll': '0' }, msgs);
  const head = h('div.conv-head');
  const input = h('input.composer-input.fx', { type: 'text', placeholder: 'כתבו הודעה…', dir: 'auto' });
  const sendBtn = h('div.pl-btn.fx.send', { 'aria-label': 'שליחה' }, svg(ICON.send, 28));
  const composer = h('div.composer', null, input, sendBtn);
  const conv = h('div.conv', null, head, msgScroll, composer);
  const el = h('div.screen.chats');
  const listWrap = sidePanel('chat-side', 'chats', 'צ׳אטים', list, el);
  el.appendChild(listWrap);
  el.appendChild(conv);
  listWrap._init();

  let openId = 0;
  let token = 0;
  let loaded = [];

  function rowFor(c) {
    const unread = c.unread_count ? h('span.unread', { text: c.unread_count > 999 ? '999+' : String(c.unread_count) }) : null;
    const row = h('div.chat-row.fx', { data: { chat: c.id } }, avatar(c, 60), h('div.chat-row-text', null,
      h('div.chat-row-top', null, h('span.chat-row-title', { text: c.title }), h('span.chat-row-date', { text: c.last_message ? fmtDate(c.last_message.date) : '' })),
      h('div.chat-row-last', null, h('span', { text: previewText(c.last_message).split('\n')[0] }), unread)));
    row._onfocus = () => preview(c.id);
    row._onselect = () => { openChat(c.id); setTimeout(() => focusLastMessage(), 400); };
    return row;
  }

  function buildList() {
    const chats = orderedChats().slice(0, 200);
    const focusedId = list.querySelector('.is-focus') && list.querySelector('.is-focus').dataset.chat;
    if (focusedId) return; // don't rebuild under the user's cursor
    list.innerHTML = '';
    chats.forEach((c) => list.appendChild(rowFor(c)));
    if (!chats.length) list.appendChild(h('div.loading-row', null, spinner()));
  }

  const preview = debounce((id) => openChat(id), 500);

  async function openChat(id) {
    if (id === openId) return;
    if (openId) td.fire({ '@type': 'closeChat', chat_id: openId });
    openId = id;
    const my = ++token;
    Array.prototype.forEach.call(list.children, (r) => r.classList.toggle('sel', r.dataset.chat === String(id)));
    const c = await getChat(id);
    head.innerHTML = '';
    if (c) {
      head.appendChild(avatar(c, 64));
      head.appendChild(h('div', null, h('h2', { text: c.title }), h('div.conv-kind', { text: chatKind(c) === 'channel' ? 'ערוץ' : chatKind(c) === 'group' ? 'קבוצה' : '' })));
      composer.style.display = c.permissions && c.permissions.can_send_basic_messages === false && chatKind(c) === 'channel' ? 'none' : '';
    }
    msgs.innerHTML = '';
    msgs.appendChild(h('div.loading-row', null, spinner()));
    td.fire({ '@type': 'openChat', chat_id: id });
    const history = await loadHistory(id, 0, 40);
    if (my !== token) return;
    loaded = history;
    renderMessages();
    if (history.length) td.fire({ '@type': 'viewMessages', chat_id: id, message_ids: history.slice(-20).map((m) => m.id), source: null, force_read: true });
  }

  async function loadHistory(id, from, want) {
    let out = [];
    let fromId = from;
    for (let tries = 0; tries < 4 && out.length < want; tries++) {
      try {
        const r = await td.send({ '@type': 'getChatHistory', chat_id: id, from_message_id: fromId, offset: 0, limit: Math.min(50, want - out.length), only_local: false });
        if (!r.messages.length) break;
        out = out.concat(r.messages);
        fromId = r.messages[r.messages.length - 1].id;
      } catch (e) { break; }
    }
    return out.reverse(); // oldest first
  }

  function bubble(m) {
    const item = itemFromMessage(m);
    const text = m.content['@type'] === 'messageText' ? m.content.text.text : (m.content.caption && m.content.caption.text) || '';
    const d = new Date(m.date * 1000);
    const parts = [];
    if (!m.is_outgoing && m.sender_id && m.sender_id['@type'] === 'messageSenderUser') {
      const n = senderName(m.sender_id);
      if (n) parts.push(h('div.b-from', { text: n }));
    }
    if (item && item.kind !== 'file') {
      const art = h('div.b-media' + (item.kind === 'photo' ? '.photo' : ''));
      if (item.mini) art.appendChild(h('img.mini', { src: item.mini, alt: '' }));
      if (item.thumb) art.appendChild(lazyImg(td.thumbUrl(item.thumb), 'thumb'));
      if (item.kind === 'video' || item.kind === 'audio') art.appendChild(h('span.b-play', null, svg(item.kind === 'audio' ? ICON.note : ICON.play, 36)));
      parts.push(art);
    } else if (item && item.kind === 'file') {
      parts.push(h('div.b-file', null, svg(ICON.file, 28), h('span', { text: item.name })));
    }
    const body = text || (item ? '' : previewText(m));
    if (body) parts.push(h('div.b-text', { text: body.length > 900 ? body.slice(0, 900) + '…' : body, dir: 'auto' }));
    parts.push(h('div.b-time', { text: pad2(d.getHours()) + ':' + pad2(d.getMinutes()) }));
    const b = h('div.bubble.fx' + (m.is_outgoing ? '.out' : '') + (item && item.kind !== 'file' ? '.has-media' : ''), { data: { mid: m.id } }, parts);
    if (item) b._onselect = () => openItem(item, loaded.map(itemFromMessage).filter(Boolean));
    return b;
  }

  function renderMessages() {
    msgs.innerHTML = '';
    if (!loaded.length) { msgs.appendChild(emptyState('אין הודעות להצגה', '')); return; }
    let lastDay = '';
    loaded.forEach((m) => {
      const day = new Date(m.date * 1000).toDateString();
      if (day !== lastDay) { msgs.appendChild(h('div.day', null, h('span', { text: fmtDate(m.date).replace(/ \d\d:\d\d$/, '') }))); lastDay = day; }
      msgs.appendChild(bubble(m));
    });
    // older messages when reaching the top
    const firstB = msgs.querySelector('.bubble');
    if (firstB) firstB._onedge = (dir) => { if (dir === 'up') loadOlder(); };
    requestAnimationFrame(() => scrollToEnd());
  }

  function scrollToEnd() {
    const inner = msgs;
    const max = Math.max(0, inner.scrollHeight - msgScroll.clientHeight + 40);
    inner._ty = -max;
    inner.style.transform = `translate3d(0,${-max}px,0)`;
  }

  async function loadOlder() {
    if (!loaded.length) return;
    const older = await loadHistory(openId, loaded[0].id, 30);
    if (!older.length) return;
    const keepId = loaded[0].id;
    loaded = older.concat(loaded);
    renderMessages();
    const b = msgs.querySelector(`[data-mid="${keepId}"]`);
    if (b) focus(b);
  }

  function focusLastMessage() {
    const all = msgs.querySelectorAll('.bubble');
    if (all.length) focus(all[all.length - 1]);
  }

  async function sendText() {
    const text = input.value.trim();
    if (!text || !openId) return;
    input.value = '';
    input.blur();
    try {
      await td.send({
        '@type': 'sendMessage', chat_id: openId, message_thread_id: 0, reply_to: null, options: null, reply_markup: null,
        input_message_content: { '@type': 'inputMessageText', text: { '@type': 'formattedText', text, entities: [] }, link_preview_options: null, clear_draft: true },
      });
    } catch (e) {
      toast('ההודעה לא נשלחה: ' + (e.message || ''));
    }
  }
  sendBtn._onselect = sendText;
  input.addEventListener('keydown', (e) => { if (e.keyCode === 13) { e.preventDefault(); sendText(); } });

  td.on('updateNewMessage', (u) => {
    const m = u.message;
    if (m.chat_id !== openId) return;
    if (loaded.some((x) => x.id === m.id)) return;
    loaded.push(m);
    const b = bubble(m);
    msgs.appendChild(b);
    scrollToEnd();
  });
  td.on('updateMessageSendSucceeded', (u) => {
    const b = msgs.querySelector(`[data-mid="${u.old_message_id}"]`);
    if (b) b.dataset.mid = u.message.id;
    const i = loaded.findIndex((x) => x.id === u.old_message_id);
    if (i >= 0) loaded[i] = u.message;
  });

  subscribe(() => { if (app.current === 'chats') buildList(); });

  return {
    el,
    show() {
      buildList();
    },
    hide() {
      if (openId) td.fire({ '@type': 'closeChat', chat_id: openId });
      openId = 0;
    },
    focusContent() {
      const sel = list.querySelector('.sel') || list.querySelector('.fx');
      if (sel) focus(sel); else focusFirst(el);
    },
  };
}
