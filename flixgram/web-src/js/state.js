// Client-side mirror of the bits of TDLib state the UI needs.
import * as td from './td.js';

export const chats = new Map();
export const users = new Map();
export const state = { me: null, auth: null, chatsLoaded: false };
const subs = new Set();
let notifyTimer = 0;

export function subscribe(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

function changed() {
  if (notifyTimer) return;
  notifyTimer = setTimeout(() => {
    notifyTimer = 0;
    subs.forEach((f) => f());
  }, 120);
}

function mainOrder(chat) {
  const p = (chat.positions || []).find((x) => x.list && x.list['@type'] === 'chatListMain');
  return p ? p.order : '0';
}

td.on('updateNewChat', (u) => { chats.set(u.chat.id, u.chat); changed(); });
td.on('updateChatTitle', (u) => { const c = chats.get(u.chat_id); if (c) { c.title = u.title; changed(); } });
td.on('updateChatPhoto', (u) => { const c = chats.get(u.chat_id); if (c) { c.photo = u.photo; changed(); } });
td.on('updateChatLastMessage', (u) => {
  const c = chats.get(u.chat_id);
  if (!c) return;
  c.last_message = u.last_message;
  if (u.positions) mergePositions(c, u.positions);
  changed();
});
td.on('updateChatPosition', (u) => {
  const c = chats.get(u.chat_id);
  if (!c) return;
  mergePositions(c, [u.position]);
  changed();
});
td.on('updateChatReadInbox', (u) => {
  const c = chats.get(u.chat_id);
  if (c) { c.unread_count = u.unread_count; changed(); }
});
td.on('updateUser', (u) => { users.set(u.user.id, u.user); });

function mergePositions(chat, positions) {
  const list = chat.positions || (chat.positions = []);
  positions.forEach((p) => {
    const i = list.findIndex((x) => x.list['@type'] === p.list['@type'] && (x.list.chat_folder_id || 0) === (p.list.chat_folder_id || 0));
    if (i >= 0) list.splice(i, 1);
    if (p.order && p.order !== '0') list.push(p);
  });
}

function cmpOrder(a, b) {
  const oa = mainOrder(a), ob = mainOrder(b);
  if (oa.length !== ob.length) return ob.length - oa.length;
  return oa < ob ? 1 : oa > ob ? -1 : 0;
}

export function orderedChats() {
  const out = [];
  chats.forEach((c) => { if (mainOrder(c) !== '0') out.push(c); });
  out.sort(cmpOrder);
  return out;
}

export function chatKind(chat) {
  const t = chat.type && chat.type['@type'];
  if (t === 'chatTypeSupergroup') return chat.type.is_channel ? 'channel' : 'group';
  if (t === 'chatTypeBasicGroup') return 'group';
  if (t === 'chatTypePrivate' || t === 'chatTypeSecret') return 'user';
  return 'other';
}

export async function loadChats(limit) {
  try {
    await td.send({ '@type': 'loadChats', chat_list: { '@type': 'chatListMain' }, limit: limit || 200 });
  } catch (e) {
    // 404 = everything already loaded
  }
  state.chatsLoaded = true;
  changed();
}

export async function getChat(id) {
  if (chats.has(id)) return chats.get(id);
  try {
    const c = await td.send({ '@type': 'getChat', chat_id: id });
    chats.set(id, c);
    return c;
  } catch (e) {
    return null;
  }
}

export function chatTitle(id) {
  const c = chats.get(id);
  return c ? c.title : '';
}

export function senderName(sender) {
  if (!sender) return '';
  if (sender['@type'] === 'messageSenderUser') {
    const u = users.get(sender.user_id);
    return u ? (u.first_name + ' ' + (u.last_name || '')).trim() : '';
  }
  return chatTitle(sender.chat_id);
}

export function previewText(msg) {
  if (!msg || !msg.content) return '';
  const c = msg.content;
  switch (c['@type']) {
    case 'messageText': return c.text.text;
    case 'messageVideo': return '🎬 ' + ((c.caption && c.caption.text) || 'סרטון');
    case 'messagePhoto': return '🖼 ' + ((c.caption && c.caption.text) || 'תמונה');
    case 'messageDocument': return '📄 ' + (c.document.file_name || 'קובץ');
    case 'messageAudio': return '🎵 ' + (c.audio.title || c.audio.file_name || 'שמע');
    case 'messageVoiceNote': return '🎤 הודעה קולית';
    case 'messageVideoNote': return '⏺ וידאו קצר';
    case 'messageSticker': return (c.sticker.emoji || '') + ' סטיקר';
    case 'messageAnimation': return 'GIF';
    case 'messagePoll': return '📊 ' + c.poll.question.text;
    case 'messageLocation': return '📍 מיקום';
    case 'messageContact': return '👤 איש קשר';
    default: return '';
  }
}
