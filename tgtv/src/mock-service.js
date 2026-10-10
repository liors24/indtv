/* TeleTV — mock service for UI tests (no network). */
import { ls } from './util.js';
const M = window.__MOCK || {};
function canvasBlob(label, w, h, hue) {
  return new Promise((res) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
    g.fillStyle = 'hsl(' + hue + ',55%,35%)'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.font = 'bold ' + Math.floor(h / 5) + 'px sans-serif'; g.fillText(label, 20, h / 2);
    c.toBlob((b) => res(b), 'image/jpeg', 0.8);
  });
}
const CHATS = [];
for (let i = 0; i < 18; i++) CHATS.push({ key: 'c' + i, title: ['Family', 'Friends', 'News', 'Movies', 'Bot', 'Work', 'Trips', 'Music', 'Memes'][i % 9] + ' ' + i, unread: i % 4 === 0 ? i + 1 : 0, date: 1700000000 + i * 3600, kind: ['group', 'user', 'channel', 'channel', 'bot', 'group'][i % 6], last: 'last message ' + i, entity: {}, input: {} });
let session = !!ls('session');
export const Service = {
  tr: (k) => k, PART: 524288,
  keys() { return ls('keys'); }, saveKeys(a, h) { ls('keys', { apiId: Number(a), apiHash: h }); },
  hasSession: () => session,
  async init() { await new Promise((r) => setTimeout(r, 100)); return session; },
  async qrLogin(cb) {
    cb.onQr('tg://login?token=MOCKTOKEN'); await new Promise((r) => setTimeout(r, 600));
    if (M.password) { const p = await cb.onPassword('hint!'); if (p !== 'secret') { cb.onError({ errorMessage: 'PASSWORD_HASH_INVALID' }); throw new Error('bad'); } }
    window.__qrDone = true; await new Promise((r) => setTimeout(r, 20000)); session = true; ls('session', 'x');
  },
  async phoneLogin(cb) { await cb.getPhone(); await cb.getCode(); session = true; ls('session', 'x'); window.__phoneDone = true; },
  async logout() { session = false; ls('session', null); },
  async me() { return { name: 'Test User', phone: '972500000000', username: 'tester' }; },
  async dialogs() { return CHATS; },
  async avatar(d) { return canvasBlob(d.title[0], 64, 64, d.key.length * 40); },
  async mediaPage(dlg, filter, offsetId) {
    const all = [];
    for (let i = 0; i < 100; i++) {
      const kind = filter === 'photos' ? 'photo' : filter === 'music' ? 'audio' : filter === 'files' ? 'file' : (i % 3 === 0 ? 'photo' : 'video');
      all.push({ id: 1000 - i, type: kind, size: kind === 'video' ? (M.videoSize || 3e6) : 200000, duration: 60 + i, name: 'f' + i + '.mp4', title: kind === 'audio' ? 'Artist – Song ' + i : '', mime: 'video/mp4', caption: '', chat: dlg, msg: {} });
    }
    const start = offsetId ? all.findIndex((x) => x.id === offsetId) + 1 : 0;
    const items = all.slice(start, start + 48);
    return { items, next: start + 48 < all.length ? items[items.length - 1].id : 0 };
  },
  async thumb(it) { return canvasBlob('#' + it.id, 320, 180, it.id % 360); },
  async photo(it) { return canvasBlob('PHOTO ' + it.id, 1280, 720, it.id % 360); },
  async fetchRange(item, offset, length) {
    const r = await fetch((M.videoUrl || '/video.mp4'), { headers: { Range: 'bytes=' + offset + '-' + (offset + length - 1) } });
    const b = await r.blob(); await new Promise((x) => setTimeout(x, M.delay || 30)); return b;
  }
};
export const errCode = (e) => String((e && (e.errorMessage || e.message)) || e);
