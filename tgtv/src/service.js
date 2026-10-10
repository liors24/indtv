/* TeleTV — Telegram service layer (MTProto through gramjs, signed in to the viewer's own account).
 * Everything the UI needs goes through this object, so tests can replace it with a mock. */
import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions';
import bigInt from 'big-integer';
import { ls } from './util.js';

const PART = 512 * 1024;          // Telegram's maximum download request size

function withTimeout(p, ms, msg) {
  let to;
  return Promise.race([p, new Promise((_, rej) => { to = setTimeout(() => rej(new Error(msg || 'timeout')), ms); })]).then((v) => { clearTimeout(to); return v; }, (e) => { clearTimeout(to); throw e; });
}
function b64url(buf) { return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function num(v) { if (v === undefined || v === null) return 0; return typeof v === 'number' ? v : (v.toJSNumber ? v.toJSNumber() : Number(v)); }
export function errCode(e) { return (e && (e.errorMessage || e.message)) || String(e); }

function pickThumb(sizes) {
  if (!sizes || !sizes.length) return null;
  const real = sizes.filter((s) => s.className === 'PhotoSize' || s.className === 'PhotoSizeProgressive');
  if (!real.length) return null;
  const sorted = real.slice().sort((a, b) => (a.w || 0) - (b.w || 0));
  return sorted.find((s) => (s.w || 0) >= 240) || sorted[sorted.length - 1];
}
function lastText(m, tr) {
  if (!m) return '';
  if (m.message) return m.message.replace(/\s+/g, ' ').slice(0, 120);
  const x = m.media && m.media.className;
  if (x === 'MessageMediaPhoto') return '🖼 ' + tr('photo');
  if (m.video || m.videoNote) return '🎞 ' + tr('video');
  if (m.voice) return '🎤 ' + tr('audioMsg');
  if (m.sticker) return tr('sticker');
  if (m.document) return '📎 ' + ((m.file && m.file.name) || tr('file'));
  return m.action ? '' : '';
}

function toItem(m) {
  let type = 'file', doc = null, photo = null;
  try { photo = m.photo || null; doc = m.document || null; } catch (e) { /* ignore */ }
  const item = { id: m.id, date: m.date || 0, caption: (m.message || '').slice(0, 160), msg: m, type, size: 0, duration: 0, w: 0, h: 0, name: '', mime: '', gif: false, voice: false, title: '', streamable: false };
  if (photo) { item.type = 'photo'; const sizes = photo.sizes || []; const big = sizes[sizes.length - 1]; item.w = big && big.w || 0; item.h = big && big.h || 0; item.size = num(big && (big.size || (big.sizes && big.sizes[big.sizes.length - 1]))) || 0; return item; }
  if (doc) {
    item.mime = doc.mimeType || ''; item.size = num(doc.size);
    (doc.attributes || []).forEach((a) => {
      if (a.className === 'DocumentAttributeVideo') { item.duration = num(a.duration); item.w = a.w; item.h = a.h; item.streamable = !!a.supportsStreaming; item.type = 'video'; }
      else if (a.className === 'DocumentAttributeAudio') { item.duration = num(a.duration); item.voice = !!a.voice; item.title = [a.performer, a.title].filter(Boolean).join(' – '); item.type = 'audio'; }
      else if (a.className === 'DocumentAttributeFilename') item.name = a.fileName;
      else if (a.className === 'DocumentAttributeAnimated') item.gif = true;
    });
    if (item.type === 'file') {
      if (/^video\//.test(item.mime)) item.type = 'video';
      else if (/^audio\//.test(item.mime)) item.type = 'audio';
      else if (/^image\//.test(item.mime) && !/webp|tgs/.test(item.mime)) item.type = 'image';
    }
    return item;
  }
  return null;
}

const FILTERS = {
  media: () => new Api.InputMessagesFilterPhotoVideo(),
  videos: () => new Api.InputMessagesFilterVideo(),
  photos: () => new Api.InputMessagesFilterPhotos(),
  music: () => new Api.InputMessagesFilterMusic(),
  voice: () => new Api.InputMessagesFilterRoundVoice(),
  files: () => new Api.InputMessagesFilterDocument()
};

export const Service = {
  client: null, creds: null, tr: (k) => k,

  keys() { return ls('keys'); },
  saveKeys(apiId, apiHash) { ls('keys', { apiId: Number(apiId), apiHash: String(apiHash).trim() }); },
  hasSession() { return !!ls('session'); },

  /** Connects and reports whether the saved session is still signed in. */
  async init(tr) {
    Service.tr = tr || Service.tr;
    const k = Service.keys();
    if (!k) throw new Error('NO_KEYS');
    Service.creds = k;
    if (Service.client) { try { await Service.client.disconnect(); } catch (e) { /* ignore */ } Service.client = null; }
    const session = new StringSession(ls('session') || '');
    const c = new TelegramClient(session, k.apiId, k.apiHash, {
      connectionRetries: 6, retryDelay: 1500, requestRetries: 4, autoReconnect: true, useWSS: true, floodSleepThreshold: 30,
      deviceModel: 'TeleTV', systemVersion: 'Smart TV', appVersion: '1.0', langCode: 'en', systemLangCode: 'en'
    });
    try { c.setLogLevel('none'); } catch (e) { /* ignore */ }
    Service.client = c;
    await withTimeout(c.connect(), 30000, 'CONNECT_TIMEOUT');
    return withTimeout(c.checkAuthorization(), 20000, 'AUTH_TIMEOUT');
  },
  save() { try { ls('session', Service.client.session.save()); } catch (e) { /* ignore */ } },

  async qrLogin(cb) {
    const c = Service.client;
    const user = await c.signInUserWithQrCode(Service.creds, {
      qrCode: async ({ token }) => { if (cb.cancelled()) throw new Error('CANCELLED'); cb.onQr('tg://login?token=' + b64url(token)); },
      password: async (hint) => cb.onPassword(hint),
      onError: async (e) => { if (cb.cancelled()) return true; cb.onError(e); return false; }
    });
    Service.save();
    return user;
  },
  async phoneLogin(cb) {
    const c = Service.client;
    await c.start({
      phoneNumber: async () => cb.getPhone(),
      phoneCode: async () => cb.getCode(),
      password: async (hint) => cb.getPassword(hint),
      onError: async (e) => { if (cb.cancelled()) return true; cb.onError(e); return false; }
    });
    Service.save();
  },
  async logout() {
    try { await Service.client.invoke(new Api.auth.LogOut()); } catch (e) { /* ignore: the local session is removed anyway */ }
    try { await Service.client.disconnect(); } catch (e) { /* ignore */ }
    Service.client = null; ls('session', null);
  },
  async me() { const u = await Service.client.getMe(); return { name: [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username || '', phone: u.phone || '', username: u.username || '' }; },

  async dialogs(folder) {
    const list = await Service.client.getDialogs({ limit: 250, folder: folder || 0 });
    return list.map((d) => ({
      key: String(d.id), title: d.title || d.name || '?', unread: d.unreadCount || 0, date: d.date || 0, pinned: !!d.pinned,
      kind: d.isUser ? (d.entity && d.entity.bot ? 'bot' : 'user') : d.isGroup ? 'group' : d.isChannel ? 'channel' : 'group',
      last: lastText(d.message, Service.tr), entity: d.entity, input: d.inputEntity
    }));
  },
  async avatar(dlg) {
    try {
      const b = await Service.client.downloadProfilePhoto(dlg.entity, { isBig: false });
      return b && b.length ? new Blob([b], { type: 'image/jpeg' }) : null;
    } catch (e) { return null; }
  },
  /** One page of media from a chat. filter: media|videos|photos|music|voice|files */
  async mediaPage(dlg, filter, offsetId, query) {
    const limit = 48;
    const msgs = await Service.client.getMessages(dlg.entity, { limit, offsetId: offsetId || 0, filter: (FILTERS[filter] || FILTERS.media)(), search: query || undefined });
    const items = [];
    for (let i = 0; i < msgs.length; i++) { const it = toItem(msgs[i]); if (it) { it.chat = dlg; items.push(it); } }
    return { items, next: msgs.length >= limit ? msgs[msgs.length - 1].id : 0 };
  },
  async thumb(item) {
    try {
      const m = item.msg, sizes = m.photo ? m.photo.sizes : (m.document ? m.document.thumbs : null);
      const th = pickThumb(sizes);
      if (!th) return null;
      const b = await Service.client.downloadMedia(m, { thumb: th });
      return b && b.length ? new Blob([b], { type: 'image/jpeg' }) : null;
    } catch (e) { return null; }
  },
  async photo(item) {
    const b = await Service.client.downloadMedia(item.msg, {});
    return new Blob([b], { type: item.mime || 'image/jpeg' });
  },
  /** Bytes [offset, offset+length) of the file, as a Blob. offset must be a multiple of 512 KB. */
  async fetchRange(item, offset, length) {
    const m = item.msg, parts = [];
    const total = Math.ceil(length / PART);
    const it = Service.client.iterDownload({
      file: m.media, offset: bigInt(offset), limit: total, requestSize: PART, chunkSize: PART,
      fileSize: bigInt(item.size), msgData: [item.chat.input, m.id]
    });
    let got = 0;
    for await (const chunk of it) {
      parts.push(chunk); got += chunk.length;
      if (got >= length) break;
    }
    return new Blob(parts);
  },
  PART
};
