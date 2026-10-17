// Episode order, everywhere: whatever list a video was opened from (a chat in any order, a shelf, search,
// recommendations), "next" is always the following episode — S1E1 → E2 → … → S2E1 — and "previous" the one
// before. Episodes missing from the list are looked up in the same chat in the background.
import * as td from './td.js';
import { itemFromMessage, parseTitle, seriesKey } from './media.js';
import { heightOf } from './quality.js';

function info(it) { return it._t || (it._t = parseTitle(it)); }
export function isEpisode(it) { const t = info(it); return !!(t.series && t.episode); }
function sk(it) { return seriesKey(info(it).series); }
function rank(it) { const t = info(it); return (t.season || 1) * 100000 + t.episode; }

/** One upload per episode (several qualities of the same episode count once; the opened one wins). */
function dedupe(items, keep) {
  const by = new Map();
  for (const it of items) {
    const r = rank(it);
    const cur = by.get(r);
    if (!cur) { by.set(r, it); continue; }
    if (cur === keep) continue;
    if (it === keep || heightOf(it) > heightOf(cur) || (heightOf(it) === heightOf(cur) && (it.date || 0) > (cur.date || 0))) by.set(r, it);
  }
  return [...by.values()].sort((a, b) => rank(a) - rank(b));
}

/** The list to play through: the series in episode order when the item is an episode, else the list as given. */
export function order(item, list) {
  if (!isEpisode(item)) return list && list.length ? list : [item];
  const key = sk(item);
  const same = (list || []).filter((x) => x.kind === 'video' && isEpisode(x) && sk(x) === key);
  if (!same.some((x) => x.key === item.key)) same.push(item);
  return dedupe(same, item);
}

/** Finds the series' other episodes in the item's chat and returns the full ordered list (or null). */
export async function complete(item, current) {
  if (!isEpisode(item) || !item.chatId) return null;
  const t = info(item);
  const q = t.series.split(/\s+/).slice(0, 4).join(' ');
  const key = sk(item);
  const filters = ['searchMessagesFilterVideo', 'searchMessagesFilterDocument'];
  let found = [];
  try {
    const res = await Promise.all(filters.map((f) => td.send({
      '@type': 'searchChatMessages', chat_id: item.chatId, query: q, sender_id: null, from_message_id: 0, offset: 0, limit: 100,
      filter: { '@type': f }, message_thread_id: 0, saved_messages_topic_id: 0,
    }).catch(() => ({ messages: [] }))));
    res.forEach((r) => (r.messages || []).forEach((m) => {
      const it = itemFromMessage(m);
      if (it && it.kind === 'video' && isEpisode(it) && sk(it) === key) found.push(it);
    }));
  } catch (e) { return null; }
  if (!found.length) return null;
  const keys = new Set((current || []).map((x) => x.key));
  const merged = (current || []).concat(found.filter((x) => !keys.has(x.key)));
  return dedupe(merged, (current || []).find((x) => x.key === item.key) || item);
}
