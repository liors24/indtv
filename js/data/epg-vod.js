/* INDTV — EpgRepository (XMLTV) and VodRepository (movies / shows / continue watching). */
(function (root) {
  'use strict';
  var INDTV = root.INDTV = root.INDTV || {};
  var U = INDTV.Util, Store = INDTV.Store, Bus = INDTV.Bus;

  /* =========================================================
   * EpgRepository — automatic programme guide.
   * Free public XMLTV guides for India are downloaded and matched to our channels:
   *   XMLTV channel id <-> tvg-id (exact, then without @feed), then display name (exact, then loose).
   * Parsing runs in a Web Worker so the TV stays responsive while a large guide is read.
   * Only the window [now − 3 h, now + 36 h] of matched channels is kept.
   * Artwork: only an <icon> the guide itself supplies.
   * ========================================================= */
  var DEFAULT_GUIDES = [
    { id: 'epgpw-in', name: 'epg.pw India', url: 'https://epg.pw/xmltv/epg_IN.xml.gz', plain: 'https://epg.pw/xmltv/epg_IN.xml' },
    { id: 'samsung-in', name: 'Samsung TV Plus India', url: 'https://i.mjh.nz/SamsungTVPlus/in.xml.gz', plain: 'https://i.mjh.nz/SamsungTVPlus/in.xml' }
  ];
  var GUIDE_MAX_AGE = 6 * 3600000;

  /* Self-contained: this function is also the Web Worker's source. */
  function guideWorker(scope) {
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
    function clean(s, max) {
      s = String(s || '').replace(/<[^>]+>/g, '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
      return s.length > max ? s.slice(0, max) : s;
    }
    function attr(text, name) {
      var m = new RegExp('\\b' + name + '\\s*=\\s*"([^"]*)"', 'i').exec(text);
      return m ? decodeXml(m[1]) : null;
    }
    function tag(text, name, max) {
      var m = new RegExp('<' + name + '\\b[^>]*>([\\s\\S]*?)</' + name + '>', 'i').exec(text);
      return m ? clean(decodeXml(m[1]), max) : '';
    }
    function time(s) {
      if (!s) return NaN;
      var m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?\s*([+-]\d{4})?/.exec(s.trim());
      if (!m) return NaN;
      var t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
      if (m[7]) {
        var sign = m[7].charAt(0) === '-' ? -1 : 1;
        t -= sign * (parseInt(m[7].slice(1, 3), 10) * 60 + parseInt(m[7].slice(3, 5), 10)) * 60000;
      }
      return t;
    }
    function norm(s) {
      s = String(s || '').toLowerCase();
      s = s.replace(/\((\d{3,4}p|4k|hd|sd|fhd|uhd)\)/g, ' ').replace(/\[[^\]]*\]/g, ' ').replace(/&/g, 'and');
      var re;
      try { re = new RegExp('[^\\p{L}\\p{N}]+', 'gu'); } catch (e) { re = /[^0-9A-Za-zÀ-ɏͰ-ϿЀ-ӿ֐-׿؀-ۿऀ-෿฀-๿぀-ヿ一-鿿가-힯]+/g; }
      return s.replace(re, '');
    }
    function loose(s) {
      var n = norm(s).replace(/(hd|sd|fhd|uhd|4k)$/, '').replace(/(tv|channel|india)$/, '');
      return n.length >= 3 ? n : '';
    }
    function add(map, key, id) {
      if (!key) return;
      var l = map[key] || (map[key] = []);
      if (l.indexOf(id) < 0) l.push(id);
    }

    function parse(xml, channels, now) {
      var byId = {}, byName = {}, byLoose = {};
      channels.forEach(function (c) {
        if (c.tvgId) {
          add(byId, c.tvgId.toLowerCase(), c.id);
          add(byId, c.tvgId.split('@')[0].toLowerCase(), c.id);
        }
        c.names.forEach(function (n) { add(byName, norm(n), c.id); add(byLoose, loose(n), c.id); });
      });
      // 1. which guide channel feeds which of our channels
      var target = {};
      var reCh = /<channel\b([^>]*)>([\s\S]*?)<\/channel>/gi, m;
      while ((m = reCh.exec(xml))) {
        var xid = attr(m[1], 'id');
        if (!xid) continue;
        var hit = byId[xid.toLowerCase()] || byId[xid.split('@')[0].toLowerCase()] || null;
        if (!hit) {
          var reDn = /<display-name\b[^>]*>([\s\S]*?)<\/display-name>/gi, d, names = [];
          while ((d = reDn.exec(m[2]))) names.push(decodeXml(d[1]));
          for (var i = 0; i < names.length && !hit; i++) hit = byName[norm(names[i])] || null;
          for (var j = 0; j < names.length && !hit; j++) hit = byLoose[loose(names[j])] || null;
        }
        if (hit) target[xid] = hit;
      }
      // 2. programmes of matched channels inside the window
      var from = now - 3 * 3600000, to = now + 36 * 3600000;
      var out = {}, count = 0;
      var reP = /<programme\b([^>]*)>([\s\S]*?)<\/programme>/gi;
      while ((m = reP.exec(xml)) && count < 120000) {
        var cid = attr(m[1], 'channel');
        var ids = cid ? target[cid] : null;
        if (!ids) continue;
        var start = time(attr(m[1], 'start')), stop = time(attr(m[1], 'stop'));
        if (!isFinite(start) || !isFinite(stop) || stop <= from || start >= to || stop <= start) continue;
        var iconM = /<icon\b[^>]*src\s*=\s*"(https?:\/\/[^"]+)"/i.exec(m[2]);
        var prog = {
          title: tag(m[2], 'title', 140), sub: tag(m[2], 'sub-title', 140), desc: tag(m[2], 'desc', 420),
          start: start, stop: stop, icon: iconM ? decodeXml(iconM[1]) : null
        };
        if (!prog.title) continue;
        for (var k = 0; k < ids.length; k++) (out[ids[k]] = out[ids[k]] || []).push(prog);
        count++;
      }
      Object.keys(out).forEach(function (id) { out[id].sort(function (a, b) { return a.start - b.start; }); });
      return { byChannel: out, count: count, matched: Object.keys(out).length };
    }

    if (scope && scope.postMessage && typeof scope.importScripts === 'function') {
      scope.onmessage = function (ev) {
        try { scope.postMessage({ ok: true, result: parse(ev.data.xml, ev.data.channels, ev.data.now) }); }
        catch (e) { scope.postMessage({ ok: false, error: String(e && e.message || e) }); }
      };
    }
    return { parse: parse, norm: norm };
  }

  var GuideParser = guideWorker(null);   // same code on the main thread (fallback + title matching)
  var workerUrl = null;
  function parseInWorker(xml, channels) {
    var now = Date.now();
    return new Promise(function (resolve, reject) {
      var w = null;
      try {
        if (!workerUrl) workerUrl = URL.createObjectURL(new Blob(['(' + guideWorker.toString() + ')(self);'], { type: 'text/javascript' }));
        w = new Worker(workerUrl);
      } catch (e) { w = null; }
      if (!w) {
        setTimeout(function () {
          try { resolve(GuideParser.parse(xml, channels, now)); } catch (e2) { reject(e2); }
        }, 30);
        return;
      }
      w.onmessage = function (ev) { w.terminate(); ev.data.ok ? resolve(ev.data.result) : reject(new Error(ev.data.error)); };
      w.onerror = function (err) { w.terminate(); try { resolve(GuideParser.parse(xml, channels, now)); } catch (e3) { reject(err); } };
      w.postMessage({ xml: xml, channels: channels, now: now });
    });
  }

  function fetchGuide(g) {
    var gz = /\.gz(\?|$)/i.test(g.url);
    var looksXml = function (t) { return /<tv[\s>]/i.test(t.slice(0, 6000)); };
    var first = gz && typeof DecompressionStream === 'undefined' && g.plain ? g.plain : g.url;
    return U.fetchText(first, { timeoutMs: 90000, maxBytes: 120 * 1024 * 1024, gzip: /\.gz(\?|$)/i.test(first) })
      .then(function (t) { if (!looksXml(t)) throw Object.assign(new Error('not xmltv'), { code: 'not_xmltv' }); return t; })
      .catch(function (e) {
        // some servers already un-gzip the file, or the TV lacks gzip support: try the plain .xml
        if (!g.plain || first === g.plain) throw e;
        return U.fetchText(g.plain, { timeoutMs: 120000, maxBytes: 160 * 1024 * 1024 }).then(function (t) {
          if (!looksXml(t)) throw Object.assign(new Error('not xmltv'), { code: 'not_xmltv' });
          return t;
        });
      });
  }

  var EpgRepository = {
    DEFAULT_GUIDES: DEFAULT_GUIDES,
    state: new INDTV.StateFlow({ auto: true, url: null, status: 'none', count: 0, matched: 0, fetchedAt: 0, error: null }),
    _data: null,          // { byChannel: { channelId: [programme] }, signature }
    _busy: null,

    load: function () {
      return Promise.all([Store.get('epg:settings'), Store.get('epg:guide')]).then(function (r) {
        var cfg = r[0] || {};
        var data = r[1] || null;
        EpgRepository._data = data;
        EpgRepository.state.set({
          auto: cfg.auto !== false, url: cfg.url || null,
          status: data ? 'ok' : 'idle', count: data ? data.count : 0, matched: data ? data.matched : 0,
          fetchedAt: data ? data.fetchedAt : 0, error: null
        });
      });
    },
    guides: function () {
      var st = EpgRepository.state.get();
      var list = st.auto ? DEFAULT_GUIDES.slice() : [];
      if (st.url) list.unshift({ id: 'user', name: 'Custom', url: st.url, plain: st.url.replace(/\.gz(\?.*)?$/i, '$1') });
      return list;
    },
    _saveSettings: function () {
      var st = EpgRepository.state.get();
      return Store.set('epg:settings', { auto: st.auto, url: st.url });
    },
    setAuto: function (on) {
      EpgRepository.state.update({ auto: !!on });
      return EpgRepository._saveSettings().then(function () { return EpgRepository.refresh({ force: true }); });
    },
    setUrl: function (url) {
      var safe = url ? U.safeHttpUrl(url) : null;
      if (url && !safe) return Promise.reject(Object.assign(new Error('invalid'), { code: 'invalid_url' }));
      EpgRepository.state.update({ url: safe });
      return EpgRepository._saveSettings().then(function () { return EpgRepository.refresh({ force: true }); });
    },
    _signature: function () {
      var ch = INDTV.ChannelRepository.all();
      return ch.length + ':' + (ch.length ? ch[0].id + ch[ch.length - 1].id : '');
    },
    /** Called on start and whenever the channel list changes; downloads only when needed. */
    ensureFresh: function () {
      if (!INDTV.ChannelRepository.all().length) return Promise.resolve();
      var d = EpgRepository._data;
      var stale = !d || Date.now() - (d.fetchedAt || 0) > GUIDE_MAX_AGE || d.signature !== EpgRepository._signature();
      return stale ? EpgRepository.refresh() : Promise.resolve();
    },
    refresh: function (opts) {
      if (EpgRepository._busy) return EpgRepository._busy;
      var guides = EpgRepository.guides();
      var channels = INDTV.ChannelRepository.all().map(function (c) {
        return { id: c.id, tvgId: c.tvgId, names: [c.name, c.tvgName].filter(Boolean) };
      });
      if (!guides.length) {
        EpgRepository._data = null;
        EpgRepository.state.update({ status: 'none', count: 0, matched: 0 });
        Bus.emit('epg');
        return Store.del('epg:guide');
      }
      if (!channels.length) return Promise.resolve();
      EpgRepository.state.update({ status: 'loading', error: null });
      var merged = {}, count = 0, errors = [];
      var job = guides.reduce(function (p, g) {
        return p.then(function () {
          return fetchGuide(g).then(function (xml) { return parseInWorker(xml, channels); }).then(function (res) {
            Object.keys(res.byChannel).forEach(function (id) {
              if (!merged[id]) { merged[id] = res.byChannel[id]; count += res.byChannel[id].length; }
            });
          }).catch(function (e) { errors.push(e && e.code ? e.code : 'network'); });
        });
      }, Promise.resolve()).then(function () {
        var matched = Object.keys(merged).length;
        if (!matched && errors.length) {
          EpgRepository.state.update({ status: EpgRepository._data ? 'ok' : 'error', error: errors[0] });
          return;
        }
        var data = { byChannel: merged, count: count, matched: matched, fetchedAt: Date.now(), signature: EpgRepository._signature() };
        EpgRepository._data = data;
        EpgRepository.state.update({ status: 'ok', count: count, matched: matched, fetchedAt: data.fetchedAt, error: errors[0] || null });
        Bus.emit('epg');
        return Store.set('epg:guide', data);
      });
      EpgRepository._busy = job;
      job.then(function () { EpgRepository._busy = null; }, function () { EpgRepository._busy = null; });
      return job;
    },
    listFor: function (channel) {
      var d = EpgRepository._data;
      return d && channel ? (d.byChannel[channel.id] || null) : null;
    },
    /** { now, next, progress } or null. */
    nowNext: function (channel) {
      var list = EpgRepository.listFor(channel);
      if (!list || !list.length) return null;
      var t = Date.now();
      for (var i = 0; i < list.length; i++) {
        var p = list[i];
        if (p.start <= t && p.stop > t) return { now: p, next: list[i + 1] || null, progress: (t - p.start) / (p.stop - p.start) };
        if (p.start > t) return { now: null, next: p, progress: 0 };
      }
      return null;
    },
    titleKey: function (title) { return GuideParser.norm(title); },
    /** Next airing (current or upcoming) of a programme title on a channel. */
    nextAiring: function (channel, titleKey) {
      var list = EpgRepository.listFor(channel);
      if (!list) return null;
      var t = Date.now();
      for (var i = 0; i < list.length; i++) {
        if (list[i].stop > t && GuideParser.norm(list[i].title) === titleKey) return list[i];
      }
      return null;
    }
  };
  EpgRepository._parseXmltv = function (xml, channels) { return GuideParser.parse(xml, channels, Date.now()); };

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

  Bus.on('catalog', function () {
    VodRepository.rebuild();
    // match the guide to the (new) channel list without blocking the UI
    setTimeout(function () { EpgRepository.ensureFresh(); }, 1500);
  });
  setInterval(function () { EpgRepository.ensureFresh(); }, 30 * 60 * 1000);
  Bus.on('vod-changed', function () { VodRepository.rebuild(); });

  INDTV.EpgRepository = EpgRepository;
  INDTV.VodRepository = VodRepository;
})(typeof window !== 'undefined' ? window : globalThis);
