/* INDTV — categories. Every channel is filed exactly under the categories its playlist gives it
 * (group-title), so Entertainment holds only entertainment channels, Movies only movie channels, and so on.
 * Names are translated (English / Hebrew); unknown playlist groups keep their own name as a category.
 * Usage: each profile's viewing and browsing raises a category's score, and Home orders its rows by it. */
(function (root) {
  'use strict';
  var INDTV = root.INDTV = root.INDTV || {};

  // id, English, Hebrew, accent colour, synonyms (lower-case) found in playlists
  var DEFS = [
    ['entertainment', 'Entertainment', 'בידור', '#ff7a59', ['entertainment', 'general entertainment', 'gec']],
    ['movies', 'Movies', 'סרטים', '#e5484d', ['movies', 'movie', 'cinema', 'film', 'films']],
    ['series', 'Series', 'סדרות', '#c2410c', ['series', 'serials', 'tv shows', 'shows', 'drama']],
    ['news', 'News', 'חדשות', '#3b82f6', ['news']],
    ['sports', 'Sports', 'ספורט', '#22c55e', ['sports', 'sport', 'cricket', 'football']],
    ['music', 'Music', 'מוזיקה', '#d946ef', ['music', 'songs']],
    ['kids', 'Kids', 'ילדים', '#facc15', ['kids', 'children', 'cartoon', 'cartoons']],
    ['animation', 'Animation', 'אנימציה', '#f59e0b', ['animation', 'anime']],
    ['comedy', 'Comedy', 'קומדיה', '#fb923c', ['comedy']],
    ['family', 'Family', 'משפחה', '#f472b6', ['family']],
    ['religious', 'Religious', 'דת ורוחניות', '#eab308', ['religious', 'religion', 'devotional', 'spiritual']],
    ['documentary', 'Documentary', 'תיעודי', '#14b8a6', ['documentary', 'documentaries', 'infotainment']],
    ['education', 'Education', 'חינוך', '#0ea5e9', ['education', 'educational']],
    ['science', 'Science', 'מדע', '#06b6d4', ['science']],
    ['business', 'Business', 'עסקים וכלכלה', '#64748b', ['business', 'finance']],
    ['lifestyle', 'Lifestyle', 'לייף סטייל', '#ec4899', ['lifestyle']],
    ['cooking', 'Cooking', 'בישול', '#f97316', ['cooking', 'food']],
    ['travel', 'Travel', 'טיולים', '#10b981', ['travel']],
    ['outdoor', 'Outdoor', 'טבע וחוץ', '#84cc16', ['outdoor', 'nature']],
    ['culture', 'Culture', 'תרבות', '#a855f7', ['culture', 'arts']],
    ['classic', 'Classic', 'קלאסי', '#a3a3a3', ['classic', 'classics', 'retro']],
    ['auto', 'Auto', 'רכב', '#ef4444', ['auto', 'cars', 'motors']],
    ['shop', 'Shopping', 'קניות', '#f43f5e', ['shop', 'shopping', 'teleshopping']],
    ['legislative', 'Parliament', 'פרלמנט', '#6366f1', ['legislative', 'parliament', 'government']],
    ['weather', 'Weather', 'מזג אוויר', '#38bdf8', ['weather']],
    ['relax', 'Relax', 'רגיעה', '#2dd4bf', ['relax', 'ambient']],
    ['regional', 'Regional', 'אזורי', '#8b5cf6', ['regional', 'local']],
    ['general', 'General', 'כללי', '#94a3b8', ['general']],
    ['other', 'Other', 'אחר', '#78716c', ['undefined', 'other', 'others', 'misc', 'uncategorized']]
  ];
  // Indian language groups (Free-TV and similar playlists file channels by language)
  var LANGS = {
    hindi: 'הינדי', tamil: 'טמילית', telugu: 'טלוגו', malayalam: 'מלאיאלאם', kannada: 'קנאדה', bengali: 'בנגלית', bangla: 'בנגלית',
    marathi: 'מראטהית', gujarati: 'גוג׳ראטית', punjabi: 'פנג׳אבית', odia: 'אודיה', oriya: 'אודיה', assamese: 'אסאמית', urdu: 'אורדו',
    english: 'אנגלית', bhojpuri: 'בוג׳פורי', sanskrit: 'סנסקריט', nepali: 'נפאלית', konkani: 'קונקני', sindhi: 'סינדהית'
  };
  var HIDDEN = /^(xxx|adult)$/i;

  var byId = {}, bySyn = {};
  DEFS.forEach(function (d, i) {
    byId[d[0]] = { id: d[0], en: d[1], he: d[2], color: d[3], order: i };
    d[4].forEach(function (s) { bySyn[s] = d[0]; });
  });

  function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9֐-׿ऀ-෿]+/g, '-').replace(/^-|-$/g, ''); }
  function hue(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return 'hsl(' + (h % 360) + ' 70% 60%)'; }

  /** Category id for one playlist group name ('' = hidden). */
  function idOf(group) {
    var g = String(group || '').trim();
    if (!g || HIDDEN.test(g)) return '';
    var low = g.toLowerCase();
    if (bySyn[low]) return bySyn[low];
    var word = low.replace(/\s+(channels?|tv)$/, '');
    if (bySyn[word]) return bySyn[word];
    if (LANGS[word]) return 'lang:' + word;
    var id = 'g:' + slug(g);
    if (!byId[id]) byId[id] = { id: id, en: g, he: g, color: hue(low), order: 1000, custom: true };
    return id;
  }
  function info(id) {
    if (byId[id]) return byId[id];
    if (id.indexOf('lang:') === 0) {
      var w = id.slice(5);
      byId[id] = { id: id, en: w.charAt(0).toUpperCase() + w.slice(1), he: LANGS[w] || w, color: hue(w), order: 500, lang: true };
      return byId[id];
    }
    return { id: id, en: id, he: id, color: '#888', order: 2000 };
  }

  /* ---------- usage (per profile, stored in the profile's scope) ---------- */
  var usage = null, saveT = null;
  function loadUsage() {
    if (usage) return usage;
    usage = {};
    INDTV.Store.get('usage').then(function (u) {
      if (u && typeof u === 'object') Object.keys(u).forEach(function (k) { usage[k] = (usage[k] || 0) + (+u[k] || 0); });
      INDTV.Bus.emit('usage');
    });
    return usage;
  }
  function saveUsage() {
    clearTimeout(saveT);
    saveT = setTimeout(function () { INDTV.Store.set('usage', usage); }, 1500);
  }

  var Categories = {
    /** Reads this profile's usage before Home is built (so the first render is already in the right order). */
    load: function () {
      usage = {};
      return INDTV.Store.get('usage').then(function (u) {
        if (u && typeof u === 'object') Object.keys(u).forEach(function (k) { usage[k] = (usage[k] || 0) + (+u[k] || 0); });
      }, function () { /* ignore */ });
    },
    idOf: idOf,
    info: info,
    name: function (id) { var c = info(id); return INDTV.I18n.lang() === 'he' ? c.he : c.en; },
    color: function (id) { return info(id).color; },

    /** Category ids of a channel, in playlist order, without duplicates. */
    of: function (ch) {
      if (!ch) return [];
      if (ch._cats) return ch._cats;
      var out = [];
      (ch.groups || []).forEach(function (g) { var id = idOf(g); if (id && out.indexOf(id) < 0) out.push(id); });
      if (!out.length) out.push('other');
      ch._cats = out;
      return out;
    },

    /** [{id, count, channels}] for the whole catalog, sorted by the usual order then size. */
    all: function () {
      var chans = INDTV.ChannelRepository.all();
      if (Categories._cache && Categories._cacheFor === chans) return Categories._cache;
      var map = {};
      chans.forEach(function (c) {
        Categories.of(c).forEach(function (id) { (map[id] = map[id] || []).push(c); });
      });
      var list = Object.keys(map).map(function (id) { return { id: id, count: map[id].length, channels: map[id] }; });
      list.sort(function (a, b) { return info(a.id).order - info(b.id).order || b.count - a.count || a.id.localeCompare(b.id); });
      Categories._cache = list; Categories._cacheFor = chans;
      return list;
    },
    channels: function (id) {
      var c = Categories.all().filter(function (x) { return x.id === id; })[0];
      return c ? c.channels : [];
    },

    /** Raise a category's score. Watching counts most; browsing and scrolling count a little. */
    bump: function (ids, amount) {
      loadUsage();
      (Array.isArray(ids) ? ids : [ids]).forEach(function (id) { if (id) usage[id] = Math.round(((usage[id] || 0) + amount) * 100) / 100; });
      saveUsage();
    },
    watched: function (ch, seconds) {
      if (!ch || !(seconds > 0)) return;
      Categories.bump(Categories.of(ch), seconds / 60);
    },
    score: function (id) { return loadUsage()[id] || 0; },

    /** Categories ordered for Home: the ones this profile uses most first. */
    ranked: function () {
      loadUsage();
      return Categories.all().slice().sort(function (a, b) {
        return (usage[b.id] || 0) - (usage[a.id] || 0) || info(a.id).order - info(b.id).order || b.count - a.count;
      });
    },
    _resetUsage: function () { usage = null; }
  };

  // Watching time feeds the scores (checked every 30 s while a channel plays).
  setInterval(function () {
    var P = INDTV.Player;
    if (!P || !P.state) return;
    var st = P.state.get();
    if (st.kind === 'channel' && st.phase === 'playing' && !st.paused && st.item) Categories.watched(st.item, 30);
  }, 30000);

  INDTV.Categories = Categories;
})(typeof window !== 'undefined' ? window : globalThis);
