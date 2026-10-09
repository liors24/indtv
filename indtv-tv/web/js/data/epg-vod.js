/* INDTV — EpgRepository (XMLTV) and VodRepository (movies / shows / continue watching). */
(function (root) {
  'use strict';
  var INDTV = root.INDTV = root.INDTV || {};
  var U = INDTV.Util, Store = INDTV.Store, Bus = INDTV.Bus;

  /* =========================================================
   * EpgRepository
   * Matching: XMLTV channel id <-> M3U tvg-id (exact, then without @feed), fallback normalized name.
   * Artwork: only <icon> supplied by the XMLTV document itself.
   * ========================================================= */
  var ENTITY = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  function decodeXml(s) {
    if (!s) return '';
    s = s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
    return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, function (m, e) {
      if (e.charAt(0) === '#') {
        var code = e.charAt(1).toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : '';
      }
      return ENTITY[e.toLowerCase()] !== undefined ? ENTITY[e.toLowerCase()] : m;
    });
  }
  function attr(text, name) {
    var m = new RegExp('\\b' + name + '\\s*=\\s*"([^"]*)"', 'i').exec(text);
    return m ? decodeXml(m[1]) : null;
  }
  function tag(text, name) {
    var m = new RegExp('<' + name + '\\b[^>]*>([\\s\\S]*?)</' + name + '>', 'i').exec(text);
    return m ? U.cleanText(decodeXml(m[1]).replace(/<[^>]+>/g, ''), name === 'desc' ? 600 : 160) : null;
  }
  /** "20261009183000 +0530" → epoch ms */
  function parseXmltvTime(s) {
    if (!s) return NaN;
    var m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?\s*([+-]\d{4})?/.exec(s.trim());
    if (!m) return NaN;
    var t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
    if (m[7]) {
      var sign = m[7].charAt(0) === '-' ? -1 : 1;
      var off = sign * (parseInt(m[7].slice(1, 3), 10) * 60 + parseInt(m[7].slice(3, 5), 10));
      t -= off * 60000;
    }
    return t;
  }

  function parseXmltv(xml) {
    var channels = {};   // xmlId -> [display names]
    var reCh = /<channel\b([^>]*)>([\s\S]*?)<\/channel>/gi, m;
    while ((m = reCh.exec(xml))) {
      var id = attr(m[1], 'id');
      if (!id) continue;
      var names = [];
      var reDn = /<display-name\b[^>]*>([\s\S]*?)<\/display-name>/gi, d;
      while ((d = reDn.exec(m[2]))) names.push(U.cleanText(decodeXml(d[1]), 120));
      channels[id] = names;
    }
    var now = Date.now();
    var from = now - 12 * 3600000, to = now + 48 * 3600000;
    var programmes = {};
    var count = 0;
    var reP = /<programme\b([^>]*)>([\s\S]*?)<\/programme>/gi;
    while ((m = reP.exec(xml)) && count < 80000) {
      var start = parseXmltvTime(attr(m[1], 'start'));
      var stop = parseXmltvTime(attr(m[1], 'stop'));
      if (!isFinite(start) || !isFinite(stop) || stop < from || start > to) continue;
      var chId = attr(m[1], 'channel');
      if (!chId) continue;
      var iconM = /<icon\b[^>]*src\s*=\s*"([^"]+)"/i.exec(m[2]);
      (programmes[chId] = programmes[chId] || []).push({
        title: tag(m[2], 'title') || '',
        desc: tag(m[2], 'desc') || '',
        start: start, stop: stop,
        icon: iconM ? U.safeHttpUrl(decodeXml(iconM[1])) : null
      });
      count++;
    }
    Object.keys(programmes).forEach(function (k) { programmes[k].sort(function (a, b) { return a.start - b.start; }); });
    return { channels: channels, programmes: programmes, count: count };
  }

  var EpgRepository = {
    state: new INDTV.StateFlow({ url: null, status: 'none', count: 0, fetchedAt: 0, error: null }),
    _data: null,
    _index: null,
    load: function () {
      return Promise.all([Store.get('epg:meta'), Store.get('epg:data')]).then(function (r) {
        var meta = r[0] || {};
        EpgRepository._data = r[1] || null;
        EpgRepository._index = null;
        EpgRepository.state.set({
          url: meta.url || null, status: meta.url ? (EpgRepository._data ? 'ok' : 'idle') : 'none',
          count: meta.count || 0, fetchedAt: meta.fetchedAt || 0, error: meta.error || null
        });
      });
    },
    setUrl: function (url) {
      var safe = url ? U.safeHttpUrl(url) : null;
      if (url && !safe) return Promise.reject(Object.assign(new Error('invalid'), { code: 'invalid_url' }));
      EpgRepository.state.update({ url: safe, status: safe ? 'idle' : 'none', error: null });
      if (!safe) {
        EpgRepository._data = null;
        return Promise.all([Store.set('epg:meta', {}), Store.del('epg:data')]).then(function () { Bus.emit('epg'); });
      }
      return EpgRepository.refresh();
    },
    refresh: function () {
      var url = EpgRepository.state.get().url;
      if (!url) return Promise.resolve();
      EpgRepository.state.update({ status: 'loading' });
      return U.fetchText(url, { timeoutMs: 60000, maxBytes: 80 * 1024 * 1024, gzip: /\.gz(\?|$)/i.test(url) })
        .then(function (xml) {
          if (!/<tv[\s>]/i.test(xml.slice(0, 5000))) throw Object.assign(new Error('not xmltv'), { code: 'not_xmltv' });
          var parsed = parseXmltv(xml);
          EpgRepository._data = parsed;
          EpgRepository._index = null;
          var meta = { url: url, count: parsed.count, fetchedAt: Date.now(), error: null };
          EpgRepository.state.set(Object.assign({ status: 'ok' }, meta));
          Bus.emit('epg');
          return Promise.all([Store.set('epg:data', parsed), Store.set('epg:meta', meta)]);
        })
        .catch(function (e) {
          EpgRepository.state.update({ status: 'error', error: e.code || 'network' });
          Store.set('epg:meta', { url: url, error: e.code || 'network', count: EpgRepository.state.get().count, fetchedAt: EpgRepository.state.get().fetchedAt });
        });
    },
    _buildIndex: function () {
      var idx = { byId: {}, byName: {} };
      var d = EpgRepository._data;
      if (!d) return idx;
      Object.keys(d.channels).forEach(function (xmlId) {
        idx.byId[xmlId.toLowerCase()] = xmlId;
        var base = xmlId.split('@')[0].toLowerCase();
        if (!idx.byId[base]) idx.byId[base] = xmlId;
        d.channels[xmlId].forEach(function (n) {
          var k = U.normalizeName(n);
          if (k && !idx.byName[k]) idx.byName[k] = xmlId;
        });
      });
      return idx;
    },
    _xmlIdFor: function (channel) {
      if (!EpgRepository._data) return null;
      if (!EpgRepository._index) EpgRepository._index = EpgRepository._buildIndex();
      var idx = EpgRepository._index;
      if (channel.tvgId) {
        var full = idx.byId[channel.tvgId.toLowerCase()];
        if (full) return full;
        var base = idx.byId[channel.tvgId.split('@')[0].toLowerCase()];
        if (base) return base;
      }
      return idx.byName[U.normalizeName(channel.tvgName || channel.name)] || null;
    },
    /** { now, next, progress } or null. */
    nowNext: function (channel) {
      if (!channel) return null;
      var xmlId = EpgRepository._xmlIdFor(channel);
      if (!xmlId) return null;
      var list = EpgRepository._data.programmes[xmlId];
      if (!list || !list.length) return null;
      var t = Date.now();
      for (var i = 0; i < list.length; i++) {
        var p = list[i];
        if (p.start <= t && p.stop > t) {
          return { now: p, next: list[i + 1] || null, progress: (t - p.start) / (p.stop - p.start) };
        }
        if (p.start > t) return { now: null, next: p, progress: 0 };
      }
      return null;
    }
  };
  EpgRepository._parseXmltv = parseXmltv;

  /* =========================================================
   * VodRepository — built only from user-provided VOD playlists.
   * Movie(id, title, poster, group, url) · Show(id, title, poster, seasons[Season(n, episodes[Episode])])
   * ========================================================= */
  var EP_RE = /^(.*?)[\s._-]*S(\d{1,2})[\s._-]*E(\d{1,3})\b(.*)$/i;

  var VodRepository = {
    state: new INDTV.StateFlow({ movies: [], shows: [], hasSource: false }),
    _progress: {},
    load: function () {
      return Store.get('vod:progress').then(function (p) {
        VodRepository._progress = p && typeof p === 'object' ? p : {};
        VodRepository.rebuild();
      });
    },
    rebuild: function () {
      var sources = INDTV.SourcesRepository.all().filter(function (s) { return s.enabled && s.kind === 'vod'; });
      var movies = [], showsMap = {}, shows = [];
      sources.forEach(function (s) {
        INDTV.PlaylistRepository.entriesFor(s.id).forEach(function (e) {
          var id = 'vod:' + U.hash(e.url);
          var m = EP_RE.exec(e.name);
          var art = e.logoUrl || null;
          if (m) {
            var showTitle = U.cleanText(m[1], 120) || e.groups[0] || e.name;
            var key = U.normalizeName(showTitle);
            var show = showsMap[key];
            if (!show) {
              show = showsMap[key] = { id: 'show:' + key, title: showTitle, poster: art, group: e.groups[0] || null, seasons: {} };
              shows.push(show);
            }
            var sn = parseInt(m[2], 10), en = parseInt(m[3], 10);
            (show.seasons[sn] = show.seasons[sn] || []).push({
              id: id, kind: 'episode', title: e.name, season: sn, episode: en, poster: art || show.poster,
              url: e.url, showId: show.id
            });
          } else {
            movies.push({ id: id, kind: 'movie', title: e.name, poster: art, group: e.groups[0] || null, url: e.url });
          }
        });
      });
      shows.forEach(function (sh) {
        sh.seasonList = Object.keys(sh.seasons).map(Number).sort(function (a, b) { return a - b; }).map(function (n) {
          return { number: n, episodes: sh.seasons[n].sort(function (a, b) { return a.episode - b.episode; }) };
        });
        delete sh.seasons;
      });
      VodRepository.state.set({ movies: movies, shows: shows, hasSource: sources.length > 0 });
      Bus.emit('vod', VodRepository.state.get());
    },
    find: function (id) {
      var st = VodRepository.state.get();
      var m = st.movies.filter(function (x) { return x.id === id; })[0];
      if (m) return m;
      for (var i = 0; i < st.shows.length; i++) {
        for (var j = 0; j < st.shows[i].seasonList.length; j++) {
          var ep = st.shows[i].seasonList[j].episodes.filter(function (x) { return x.id === id; })[0];
          if (ep) return ep;
        }
      }
      return null;
    },
    saveProgress: function (id, position, duration) {
      if (!isFinite(position) || !isFinite(duration) || duration <= 0) return;
      if (position / duration > 0.95) delete VodRepository._progress[id];
      else VodRepository._progress[id] = { id: id, position: position, duration: duration, lastPlayed: Date.now() };
      VodRepository._persist();
    },
    _persist: U.debounce(function () { Store.set('vod:progress', VodRepository._progress); Bus.emit('vod-progress'); }, 1000),
    progressFor: function (id) { return VodRepository._progress[id] || null; },
    continueWatching: function () {
      return Object.keys(VodRepository._progress).map(function (k) { return VodRepository._progress[k]; })
        .sort(function (a, b) { return b.lastPlayed - a.lastPlayed; })
        .map(function (p) { var item = VodRepository.find(p.id); return item ? { item: item, progress: p } : null; })
        .filter(Boolean);
    },
    search: function (q) {
      q = U.cleanText(q, 80).toLowerCase();
      if (!q) return [];
      var st = VodRepository.state.get();
      return st.movies.filter(function (m) { return m.title.toLowerCase().indexOf(q) >= 0; }).slice(0, 40);
    }
  };

  /** Artwork priority: 1 EPG programme art · 2 VOD art · 3 tvg-logo · 4 INDTV fallback (null). */
  INDTV.artworkFor = function (item, epg) {
    if (epg && epg.now && epg.now.icon) return { url: epg.now.icon, kind: 'programme' };
    if (item && item.poster) return { url: item.poster, kind: 'vod' };
    if (item && item.logoUrl) return { url: item.logoUrl, kind: 'logo' };
    return { url: null, kind: 'fallback' };
  };

  Bus.on('catalog', function () { EpgRepository._index = null; VodRepository.rebuild(); });
  Bus.on('vod-changed', function () { VodRepository.rebuild(); });

  INDTV.EpgRepository = EpgRepository;
  INDTV.VodRepository = VodRepository;
})(typeof window !== 'undefined' ? window : globalThis);
