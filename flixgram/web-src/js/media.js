// Turns TDLib messages into playable media items and organises them into a library:
// series → seasons (sorted by episode), movies, clips, photos, music, files.

const VIDEO_EXT = /\.(mp4|mkv|avi|mov|m4v|webm|ts|m2ts|wmv|flv|3gp|mpg|mpeg)$/i;
const AUDIO_EXT = /\.(mp3|m4a|aac|flac|ogg|opus|wav)$/i;

function mimeFor(name, mime) {
  if (mime && mime !== 'application/octet-stream') return mime;
  const n = (name || '').toLowerCase();
  if (n.endsWith('.mkv')) return 'video/x-matroska';
  if (n.endsWith('.webm')) return 'video/webm';
  if (n.endsWith('.avi')) return 'video/x-msvideo';
  if (n.endsWith('.ts')) return 'video/mp2t';
  if (n.endsWith('.mp3')) return 'audio/mpeg';
  return 'video/mp4';
}

function captionText(content) {
  return (content.caption && content.caption.text) || '';
}

function bestPhotoSize(sizes, maxW) {
  if (!sizes || !sizes.length) return null;
  let best = sizes[0];
  for (const s of sizes) {
    if (s.width <= (maxW || 1920) && s.width >= best.width) best = s;
  }
  return best;
}

function thumbOf(media) {
  return media && media.thumbnail && media.thumbnail.file ? media.thumbnail.file.id : 0;
}

function miniOf(media) {
  const m = media && (media.minithumbnail || media.album_cover_minithumbnail);
  return m && m.data ? 'data:image/jpeg;base64,' + m.data : '';
}

// Returns null for messages without media we can show.
export function itemFromMessage(msg) {
  const c = msg.content;
  if (!c) return null;
  const base = { key: msg.chat_id + ':' + msg.id, chatId: msg.chat_id, msgId: msg.id, date: msg.date, caption: '' };
  switch (c['@type']) {
    case 'messageVideo': {
      const v = c.video;
      return Object.assign(base, {
        kind: 'video', fileId: v.video.id, size: v.video.size || v.video.expected_size, mime: mimeFor(v.file_name, v.mime_type),
        name: v.file_name || '', duration: v.duration, width: v.width, height: v.height,
        thumb: thumbOf(v), mini: miniOf(v), caption: captionText(c), stream: v.supports_streaming,
      });
    }
    case 'messageAnimation': {
      const v = c.animation;
      if (v.duration < 15) return null;
      return Object.assign(base, {
        kind: 'video', fileId: v.animation.id, size: v.animation.size, mime: mimeFor(v.file_name, v.mime_type),
        name: v.file_name || '', duration: v.duration, width: v.width, height: v.height,
        thumb: thumbOf(v), mini: miniOf(v), caption: captionText(c),
      });
    }
    case 'messageDocument': {
      const d = c.document;
      const name = d.file_name || '';
      const mime = d.mime_type || '';
      const isVideo = mime.indexOf('video/') === 0 || VIDEO_EXT.test(name);
      const isAudio = !isVideo && (mime.indexOf('audio/') === 0 || AUDIO_EXT.test(name));
      return Object.assign(base, {
        kind: isVideo ? 'video' : isAudio ? 'audio' : 'file', fileId: d.document.id,
        size: d.document.size || d.document.expected_size, mime: mimeFor(name, mime), name,
        duration: 0, thumb: thumbOf(d), mini: miniOf(d), caption: captionText(c),
      });
    }
    case 'messageAudio': {
      const a = c.audio;
      return Object.assign(base, {
        kind: 'audio', fileId: a.audio.id, size: a.audio.size, mime: mimeFor(a.file_name, a.mime_type),
        name: a.title || a.file_name || '', performer: a.performer || '', duration: a.duration,
        thumb: a.album_cover_thumbnail && a.album_cover_thumbnail.file ? a.album_cover_thumbnail.file.id : 0,
        mini: miniOf(a), caption: captionText(c),
      });
    }
    case 'messagePhoto': {
      const p = c.photo;
      const big = bestPhotoSize(p.sizes, 1920);
      const small = bestPhotoSize(p.sizes, 480);
      if (!big) return null;
      return Object.assign(base, {
        kind: 'photo', fileId: big.photo.id, thumb: small ? small.photo.id : big.photo.id,
        width: big.width, height: big.height, mini: miniOf(p), caption: captionText(c),
      });
    }
    default:
      return null;
  }
}

// ------------------------------------------------------------------ titles & series

const EMOJI = /[☀-➿]|[\uD83C-\uDBFF][\uDC00-\uDFFF]|️|‍/g;

function cleanLine(s) {
  return s.replace(EMOJI, '').trim().replace(/^#([^\s#]+)/, (m, w) => w.replace(/_/g, ' ')).replace(/#[^\s#]+/g, '').replace(/@[\w\d_]+/g, '').replace(/https?:\/\/\S+/g, '')
    .replace(/[_|]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

function nameFromFile(name) {
  return name.replace(/\.[a-z0-9]{2,4}$/i, '').replace(/[._]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

const PATTERNS = [
  // S03E08 / s3e8 / S03 E08
  { re: /\bS(\d{1,2})\s*[.\-_ ]?\s*E(\d{1,3})\b/i, s: 1, e: 2 },
  // 3x08
  { re: /\b(\d{1,2})x(\d{2,3})\b/i, s: 1, e: 2 },
  // עונה 3 פרק 8 (with optional words between)
  { re: /עונה\s*(\d{1,2})[^\d\n]{0,12}?פרק\s*(\d{1,3})/, s: 1, e: 2 },
  // פרק 8 עונה 3
  { re: /פרק\s*(\d{1,3})[^\d\n]{0,12}?עונה\s*(\d{1,2})/, s: 2, e: 1 },
  // Season 3 Episode 8
  { re: /season\s*(\d{1,2})[^\d\n]{0,12}?ep(?:isode)?\s*(\d{1,3})/i, s: 1, e: 2 },
  // episode only
  { re: /(?:פרק|episode|ep\.?)\s*(\d{1,3})\b/i, s: 0, e: 1 },
];

export function parseTitle(item) {
  const lines = (item.caption || '').split('\n').map(cleanLine).filter((l) => l.length > 1);
  const fileTitle = item.name ? nameFromFile(item.name) : '';
  const sources = lines.slice(0, 3).concat(fileTitle ? [fileTitle] : []);
  for (const src of sources) {
    for (const p of PATTERNS) {
      const m = src.match(p.re);
      if (!m) continue;
      const season = p.s ? parseInt(m[p.s], 10) : 0;
      const episode = parseInt(m[p.e], 10);
      let series = src.slice(0, m.index).replace(/[-–—:|,(\[]+\s*$/, '').trim();
      if (series.length < 2) {
        // title may come after the marker, e.g. "פרק 3 - שם הסדרה"
        const after = src.slice(m.index + m[0].length).replace(/^[\s\-–—:|,)\]]+/, '').trim();
        series = after.split(/[-–—|]/)[0].trim();
      }
      if (series.length < 2 && lines[0] && lines[0] !== src) series = lines[0].replace(p.re, '').trim();
      series = series.replace(/\s*[-–—:]\s*$/, '').replace(/\b(19|20)\d{2}\b/, '').trim();
      return { series, season, episode, title: series || src, line: lines[0] || fileTitle };
    }
  }
  const title = lines[0] || fileTitle || '';
  return { series: '', season: 0, episode: 0, title, line: title };
}

export function seriesKey(s) {
  return s.toLowerCase().replace(/[^a-z0-9֐-׿]+/g, '');
}

export function displayTitle(item) {
  const t = item._t || (item._t = parseTitle(item));
  if (t.episode) {
    const ep = t.season ? `עונה ${t.season}, פרק ${t.episode}` : `פרק ${t.episode}`;
    return { main: t.series || ep, sub: t.series ? ep : '' };
  }
  if (item.kind === 'audio' && item.performer) return { main: t.title || item.name, sub: item.performer };
  return { main: t.title || (item.kind === 'photo' ? 'תמונה' : 'ללא שם'), sub: '' };
}

// Group a list of video items into shelves.
export function organise(items) {
  const videos = items.filter((i) => i.kind === 'video');
  const groups = new Map();
  const loose = [];
  for (const it of videos) {
    const t = it._t || (it._t = parseTitle(it));
    if (t.episode && t.series) {
      const k = seriesKey(t.series) + '|' + (t.season || 1);
      if (!groups.has(k)) groups.set(k, { series: t.series, season: t.season || 1, items: [], latest: 0 });
      const g = groups.get(k);
      // de-duplicate repeated uploads of the same episode (keep the newest)
      const dup = g.items.findIndex((x) => x._t.episode === t.episode);
      if (dup >= 0) { if (g.items[dup].date < it.date) g.items[dup] = it; } else g.items.push(it);
      g.latest = Math.max(g.latest, it.date);
    } else {
      loose.push(it);
    }
  }
  const shelves = [];
  const seriesShelves = [];
  for (const g of groups.values()) {
    if (g.items.length < 2) { loose.push.apply(loose, g.items); continue; }
    g.items.sort((a, b) => a._t.episode - b._t.episode);
    seriesShelves.push({
      id: 'series:' + seriesKey(g.series) + ':' + g.season,
      kind: 'series', title: g.series, season: g.season, items: g.items, latest: g.latest,
    });
  }
  seriesShelves.sort((a, b) => b.latest - a.latest);
  // count seasons per series for labels
  const seasonsPer = {};
  seriesShelves.forEach((s) => { const k = seriesKey(s.title); seasonsPer[k] = (seasonsPer[k] || 0) + 1; });
  seriesShelves.forEach((s) => { s.multiSeason = seasonsPer[seriesKey(s.title)] > 1 || s.season > 1; });
  shelves.push.apply(shelves, seriesShelves);

  loose.sort((a, b) => b.date - a.date);
  const movies = loose.filter((i) => i.duration >= 60 * 60 || (!i.duration && i.size > 700 * 1048576));
  const clips = loose.filter((i) => movies.indexOf(i) < 0);
  if (movies.length) shelves.push({ id: 'movies', kind: 'movies', title: 'סרטים', items: movies });
  if (clips.length) shelves.push({ id: 'clips', kind: 'clips', title: seriesShelves.length || movies.length ? 'עוד סרטונים' : 'סרטונים', items: clips });
  return shelves;
}

export function shelfLabel(shelf) {
  if (shelf.kind === 'series') return { title: shelf.title, meta: shelf.multiSeason ? `עונה ${shelf.season}` : `${shelf.items.length} פרקים` };
  return { title: shelf.title, meta: `${shelf.items.length}` };
}

// Find the next episode after `item` within a list (used by autoplay).
export function nextInList(list, item) {
  const i = list.findIndex((x) => x.key === item.key);
  return i >= 0 && i + 1 < list.length ? list[i + 1] : null;
}
