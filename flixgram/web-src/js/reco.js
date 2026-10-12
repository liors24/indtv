// Personal recommendations. Learns from what you actually watch (seconds watched, not clicks):
// which chats, which series, which words in titles, and whether you prefer movies, episodes or clips.
// Scores every candidate video, mixes in a seeded daily shuffle (so the picks change every day but
// stay stable within a day), and keeps the list diverse. Everything stays on the TV.
import { store } from './util.js';
import { parseTitle, seriesKey } from './media.js';

const KEY = 'taste';
const STOP = new Set(['עם', 'של', 'את', 'על', 'לא', 'זה', 'גם', 'כל', 'אל', 'מה', 'עונה', 'פרק', 'הועלה', 'בלעדית', 'בטלגרם',
  'the', 'and', 'of', 'to', 'in', 'a', 'web', 'dl', 'hd', 'fhd', 'uhd', 'hdr', 'mp4', 'mkv', 'x264', 'x265', 'h264', 'h265', 'hevc',
  'aac', 'bluray', 'webrip', 'season', 'episode', 'tv', 'עברית', 'תרגום', 'מתורגם', 'כתוביות', 'hebsub', 'subs']);

export function dayKey(d) {
  d = d || new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

function load() {
  const t = store.get(KEY, null) || {};
  t.chats = t.chats || {};
  t.series = t.series || {};
  t.words = t.words || {};
  t.kinds = t.kinds || { movie: 0, episode: 0, clip: 0 };
  t.done = t.done || [];
  t.total = t.total || 0;
  // gentle forgetting: tastes from months ago matter less than last week's
  const today = dayKey();
  if (t.day && t.day !== today) {
    const days = Math.min(60, Math.max(1, daysBetween(t.day, today)));
    const f = Math.pow(0.97, days);
    for (const k in t.chats) t.chats[k] *= f;
    for (const k in t.words) { t.words[k] *= f; if (t.words[k] < 5) delete t.words[k]; }
    for (const k in t.series) t.series[k].secs *= f;
    for (const k in t.kinds) t.kinds[k] *= f;
  }
  t.day = today;
  return t;
}

function daysBetween(a, b) {
  const da = new Date(Math.floor(a / 10000), Math.floor(a / 100) % 100 - 1, a % 100);
  const db = new Date(Math.floor(b / 10000), Math.floor(b / 100) % 100 - 1, b % 100);
  return Math.round((db - da) / 86400000);
}

export function words(text) {
  return (text || '').toLowerCase().replace(/[^a-z0-9֐-׿\s]/g, ' ').split(/\s+/)
    .filter((w) => w.length >= 2 && !/^\d+p?$/.test(w) && !STOP.has(w));
}

function kindOf(item) {
  const t = item._t || (item._t = parseTitle(item));
  if (t.episode) return 'episode';
  if (item.duration >= 3600 || (!item.duration && item.size > 700 * 1048576)) return 'movie';
  return 'clip';
}

/** Record watched seconds for an item (called by the player). */
export function record(item, seconds, finished) {
  if (!item || item.kind !== 'video' || !(seconds > 0) && !finished) return;
  const t = load();
  const s = Math.min(seconds || 0, 4 * 3600);
  t.total += s;
  t.chats[item.chatId] = (t.chats[item.chatId] || 0) + s;
  const pt = item._t || (item._t = parseTitle(item));
  if (pt.series && pt.episode) {
    const k = seriesKey(pt.series);
    const e = t.series[k] || (t.series[k] = { name: pt.series, chatId: item.chatId, secs: 0, season: 0, ep: 0, last: 0 });
    e.secs += s;
    e.last = Date.now();
    const season = pt.season || 1;
    if (season > e.season || (season === e.season && pt.episode >= e.ep)) {
      // only advance "where you are" when the episode was really watched
      if (finished || s > 600) { e.season = season; e.ep = pt.episode; }
    }
  }
  const ws = words(pt.series || pt.title || item.caption);
  ws.slice(0, 8).forEach((w) => { t.words[w] = (t.words[w] || 0) + s; });
  t.kinds[kindOf(item)] += s;
  if (finished && t.done.indexOf(item.key) < 0) {
    t.done.push(item.key);
    if (t.done.length > 800) t.done = t.done.slice(-800);
  }
  // cap the vocabulary
  const wk = Object.keys(t.words);
  if (wk.length > 400) wk.sort((a, b) => t.words[a] - t.words[b]).slice(0, wk.length - 400).forEach((k) => delete t.words[k]);
  store.set(KEY, t);
}

export function profile() {
  return load();
}

export function hasHistory() {
  return load().total > 120;
}

// deterministic PRNG per (day, item) so the daily mix is stable within a day
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rand01(seed) {
  let x = seed + 0x6d2b79f5;
  x = Math.imul(x ^ (x >>> 15), x | 1);
  x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
  return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
}

function maxOf(obj) {
  let m = 0;
  for (const k in obj) m = Math.max(m, typeof obj[k] === 'number' ? obj[k] : obj[k].secs);
  return m || 1;
}

/**
 * Rank candidate videos for today.
 * @param items     candidate video items (deduplicated by key)
 * @param exclude   Set of keys to leave out (e.g. in "continue watching")
 */
export function recommend(items, exclude, limit) {
  const t = load();
  const day = dayKey();
  const learned = t.total > 120;
  const cMax = maxOf(t.chats), sMax = maxOf(t.series), wMax = maxOf(t.words);
  const kTot = t.kinds.movie + t.kinds.episode + t.kinds.clip || 1;
  const now = Date.now() / 1000;
  const done = new Set(t.done);
  const scored = [];
  for (const it of items) {
    if (it.kind !== 'video' || done.has(it.key) || (exclude && exclude.has(it.key))) continue;
    const pt = it._t || (it._t = parseTitle(it));
    let s = 0;
    const why = [];
    if (learned) {
      const ca = (t.chats[it.chatId] || 0) / cMax;
      s += 3 * Math.sqrt(ca);
      const sk = pt.series ? seriesKey(pt.series) : '';
      const se = sk && t.series[sk];
      if (se) {
        s += 4 * Math.sqrt(se.secs / sMax);
        // already seen this episode (or an earlier one) of a series you follow: push it down
        const season = pt.season || 1;
        if (season < se.season || (season === se.season && pt.episode <= se.ep)) s -= 5;
        else why.push(se.name);
      }
      let wsum = 0;
      words(pt.series || pt.title || it.caption).forEach((w) => { if (t.words[w]) wsum += t.words[w] / wMax; });
      s += 2 * Math.min(1, wsum);
      s += 1.2 * ((t.kinds[kindOf(it)] || 0) / kTot);
      if (!why.length && ca > 0.25) why.push('chat:' + it.chatId);
    }
    const ageDays = Math.max(0, (now - (it.date || now)) / 86400);
    s += 1.5 * Math.exp(-ageDays / 21);
    s += (learned ? 1.4 : 4) * rand01(hash(day + ':' + it.key)); // the daily shuffle
    scored.push({ it, s, why: why[0] || '' });
  }
  scored.sort((a, b) => b.s - a.s);
  // diversity: at most 2 per series and 4 per chat
  const perSeries = {}, perChat = {}, out = [];
  for (const x of scored) {
    const pt = x.it._t;
    const sk = pt.series ? seriesKey(pt.series) + (pt.season || 1) : '';
    if (sk && (perSeries[sk] || 0) >= 2) continue;
    if ((perChat[x.it.chatId] || 0) >= 4) continue;
    if (sk) perSeries[sk] = (perSeries[sk] || 0) + 1;
    perChat[x.it.chatId] = (perChat[x.it.chatId] || 0) + 1;
    x.it._why = x.why;
    out.push(x.it);
    if (out.length >= (limit || 16)) break;
  }
  return out;
}

/** The next episode of every series you're following, newest-watched first. */
export function nextEpisodes(items) {
  const t = load();
  const list = Object.keys(t.series).map((k) => Object.assign({ key: k }, t.series[k])).filter((s) => s.ep > 0)
    .sort((a, b) => b.last - a.last);
  const done = new Set(t.done);
  const out = [];
  list.forEach((s) => {
    let best = null;
    items.forEach((it) => {
      const pt = it._t || (it._t = parseTitle(it));
      if (!pt.series || seriesKey(pt.series) !== s.key || done.has(it.key)) return;
      const season = pt.season || 1;
      const after = season > s.season || (season === s.season && pt.episode > s.ep);
      if (!after) return;
      if (!best || season < (best._t.season || 1) || (season === (best._t.season || 1) && pt.episode < best._t.episode)) best = it;
    });
    if (best) out.push(best);
  });
  return out;
}

/** Chats you watch most, for fetching a richer candidate pool. */
export function topChats(n) {
  const t = load();
  return Object.keys(t.chats).sort((a, b) => t.chats[b] - t.chats[a]).slice(0, n).map(Number);
}

export function favouriteSeriesName() {
  const t = load();
  const k = Object.keys(t.series).sort((a, b) => t.series[b].secs - t.series[a].secs)[0];
  return k ? t.series[k].name : '';
}
