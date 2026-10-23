// Video quality. Telegram stores one file per message, so a channel offers "resolutions" by posting
// the same episode/movie several times (1080p, 720p, 480p...). We find those sibling uploads and let
// the viewer switch between them, and optionally pin a quality per chat so it's picked automatically.
import * as td from './td.js';
import { store } from './util.js';
import { itemFromMessage, parseTitle, seriesKey, episodeKey } from './media.js';

const Q_RE = /\b(4320|2160|1440|1080|720|576|540|480|360|240|144)\s*p\b/i;

export function heightOf(item) {
  if (item.height) return Math.min(item.height, item.width ? Math.max(item.width, item.height) : item.height);
  const text = (item.name || '') + ' ' + (item.caption || '');
  const m = text.match(Q_RE);
  if (m) return parseInt(m[1], 10);
  if (/\b(4k|uhd)\b/i.test(text)) return 2160;
  if (/\bfhd\b/i.test(text)) return 1080;
  return 0;
}

export function qualityLabel(h) {
  if (!h) return 'מקור';
  if (h >= 2000) return '4K';
  return h + 'p';
}

function cleanTitle(s) {
  return (s || '').toLowerCase()
    .replace(/\.[a-z0-9]{2,4}$/, '')
    .replace(Q_RE, ' ').replace(/\b(4k|uhd|fhd|hd|sd|web[-. ]?dl|webrip|bluray|hdtv|x26[45]|h\.?26[45]|hevc|aac|ac3|hdr|10bit)\b/g, ' ')
    .replace(/[^a-z0-9֐-׿]+/g, '');
}

/** Identity of the content regardless of the upload's quality. */
export function contentKey(item) {
  const t = item._t || (item._t = parseTitle(item));
  if (episodeKey(item)) return 'ep:' + episodeKey(item) + ':' + (t.season || 1) + ':' + t.episode;
  const first = ((item.caption || '').split('\n')[0] || item.name || '');
  return 't:' + cleanTitle(first || item.name);
}

function searchTerm(item) {
  const t = item._t || (item._t = parseTitle(item));
  if (t.series) return t.series;
  const first = ((item.caption || '').split('\n')[0] || item.name || '').replace(Q_RE, ' ');
  return first.replace(/[^\w֐-׿\s]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 4).join(' ');
}

function withTimeout(p, ms) {
  return Promise.race([p, new Promise((r) => setTimeout(() => r(null), ms))]);
}

/** All uploads of the same content in the same chat, best quality first. */
export async function findVersions(item, timeoutMs) {
  const key = contentKey(item);
  const q = searchTerm(item);
  const run = Promise.all(['searchMessagesFilterVideo', 'searchMessagesFilterDocument'].map((f) => td.send({
    '@type': 'searchChatMessages', chat_id: item.chatId, query: q, sender_id: null, from_message_id: 0, offset: 0, limit: 100,
    filter: { '@type': f }, message_thread_id: 0, saved_messages_topic_id: 0,
  }).catch(() => ({ messages: [] }))));
  const res = await withTimeout(run, timeoutMs || 6000);
  const out = [item];
  const seen = new Set([item.fileId]);
  if (res) {
    res[0].messages.concat(res[1].messages).forEach((m) => {
      const it = itemFromMessage(m);
      if (!it || it.kind !== 'video' || seen.has(it.fileId)) return;
      if (contentKey(it) !== key) return;
      seen.add(it.fileId);
      out.push(it);
    });
  }
  out.forEach((v) => { v._h = heightOf(v); });
  out.sort((a, b) => (b._h - a._h) || ((b.size || 0) - (a.size || 0)));
  return out;
}

// ------------------------------------------------------------------ per-chat pinned quality

export function pinned(chatId) {
  return store.get('quality', {})[chatId] || 0;
}

export function pin(chatId, h) {
  const all = store.get('quality', {});
  if (h) all[chatId] = h; else delete all[chatId];
  store.set('quality', all);
}

export function pinnedCount() {
  return Object.keys(store.get('quality', {})).length;
}

export function clearPins() {
  store.del('quality');
}

/** Pick the version closest to the wanted height: exact, else the best one below it, else the lowest above. */
export function choose(versions, want) {
  if (!want || versions.length < 2) return versions[0];
  const known = versions.filter((v) => v._h);
  if (!known.length) return versions[0];
  const exact = known.find((v) => v._h === want);
  if (exact) return exact;
  const below = known.filter((v) => v._h < want);
  if (below.length) return below[0];
  return known[known.length - 1];
}
