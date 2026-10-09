/* INDTV — Sources, Playlist, Channel, Favorites, Recent and Stream-health repositories.
 * UI code never fetches or parses; it observes ChannelRepository.state and calls repository methods. */
(function (root) {
  'use strict';
  var INDTV = root.INDTV = root.INDTV || {};
  var U = INDTV.Util, Store = INDTV.Store, Bus = INDTV.Bus, Parser = INDTV.M3UParser;

  var BUILTIN_URL = 'https://iptv-org.github.io/iptv/countries/in.m3u';
  var BUILTIN = {
    id: 'builtin-in', name: 'India Built-in', type: 'builtin', kind: 'live',
    url: BUILTIN_URL, enabled: true
  };
  var AUTO_REFRESH_MIN_AGE = 10 * 60 * 1000;   // cold start refresh unless refreshed in the last 10 min
  var BACKGROUND_INTERVAL = 6 * 60 * 60 * 1000; // while the page stays open

  INDTV.Config = { BUILTIN_URL: BUILTIN_URL, BUILTIN_NAME: BUILTIN.name };

  /* =========================================================
   * SourcesRepository — which playlists are configured
   * ========================================================= */
  var SourcesRepository = {
    state: new INDTV.StateFlow([]),
    load: function () {
      return Store.get('sources').then(function (saved) {
        var list = Array.isArray(saved) ? saved.filter(function (s) { return s && s.id; }) : [];
        var builtin = list.filter(function (s) { return s.id === BUILTIN.id; })[0];
        // Built-in URL is canonical and cannot be edited.
        var merged = Object.assign({}, BUILTIN, builtin ? {
          enabled: builtin.enabled !== false, status: builtin.status, lastRefresh: builtin.lastRefresh,
          lastAttempt: builtin.lastAttempt, error: builtin.error, count: builtin.count, stats: builtin.stats
        } : {});
        merged.url = BUILTIN_URL;
        merged.name = BUILTIN.name;
        var users = list.filter(function (s) { return s.id !== BUILTIN.id; });
        SourcesRepository.state.set([merged].concat(users));
        return SourcesRepository.state.get();
      });
    },
    all: function () { return SourcesRepository.state.get(); },
    byId: function (id) { return SourcesRepository.all().filter(function (s) { return s.id === id; })[0] || null; },
    persist: function () {
      // Raw playlist text is stored separately; keep this record small.
      var slim = SourcesRepository.all().map(function (s) {
        var c = Object.assign({}, s);
        delete c.raw;
        return c;
      });
      return Store.set('sources', slim);
    },
    patch: function (id, patch) {
      SourcesRepository.state.set(SourcesRepository.all().map(function (s) {
        return s.id === id ? Object.assign({}, s, patch) : s;
      }));
      return SourcesRepository.persist();
    },
    add: function (src) {
      var id = 'user-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      var rec = {
        id: id, name: U.cleanText(src.name, 60) || 'My playlist', type: src.type, kind: src.kind === 'vod' ? 'vod' : 'live',
        url: src.url || null, enabled: true, status: 'idle'
      };
      SourcesRepository.state.set(SourcesRepository.all().concat([rec]));
      return SourcesRepository.persist().then(function () { return rec; });
    },
    remove: function (id) {
      if (id === BUILTIN.id) return Promise.resolve();
      SourcesRepository.state.set(SourcesRepository.all().filter(function (s) { return s.id !== id; }));
      return Promise.all([SourcesRepository.persist(), Store.del('entries:' + id), Store.del('raw:' + id)]);
    }
  };

  /* =========================================================
   * StreamHealthRepository — recent failures / successes per stream
   * ========================================================= */
  var FAIL_TTL = 10 * 60 * 1000;
  var StreamHealth = {
    _fail: {}, _ok: {},
    load: function () {
      return Store.get('health').then(function (h) {
        if (h && typeof h === 'object') { StreamHealth._fail = h.fail || {}; StreamHealth._ok = h.ok || {}; }
      });
    },
    _save: U.debounce(function () { Store.set('health', { fail: StreamHealth._fail, ok: StreamHealth._ok }); }, 1500),
    markFailed: function (sourceId) { StreamHealth._fail[sourceId] = Date.now(); StreamHealth._save(); },
    markWorking: function (channelId, sourceId) {
      StreamHealth._ok[channelId] = Date.now();
      delete StreamHealth._fail[sourceId];
      StreamHealth._save();
    },
    recentlyFailed: function (sourceId) {
      var t = StreamHealth._fail[sourceId];
      return !!t && Date.now() - t < FAIL_TTL;
    },
    workedRecently: function (channelId) {
      var t = StreamHealth._ok[channelId];
      return !!t && Date.now() - t < 7 * 86400000;
    }
  };

  /* =========================================================
   * ChannelRepository — deduplicated logical channel catalog
   * ========================================================= */
  var QUALITY_RANK = { '2160p': 6, uhd: 6, '1080p': 5, fhd: 5, '720p': 4, hd: 4, '576p': 3, '540p': 3, '480p': 2, sd: 2, '360p': 1, '240p': 0 };
  function qRank(q) { return q ? (QUALITY_RANK[String(q).toLowerCase()] || 0) : -1; }

  /**
   * Build Channel objects from entries of all enabled live sources.
   * Channel(id, tvgId, name, logoUrl, groupName, groups, sources: StreamSource[])
   * StreamSource(id, url, sourceName, priority, quality, geoBlocked, notAlways, userAgent, referrer)
   */
  function buildCatalog(entryLists) {
    var byKey = {};
    var order = [];
    // In the Android TV app the native layer fetches streams, so http sources are not blocked there.
    var pageSecure = typeof location !== 'undefined' && location.protocol === 'https:' && !(typeof window !== 'undefined' && window.INDTVNative);

    entryLists.forEach(function (list) {
      list.forEach(function (e) {
        var key = Parser.identityOf(e);
        var ch = byKey[key];
        if (!ch) {
          ch = byKey[key] = {
            id: key,
            tvgId: e.tvgId || null,
            tvgName: e.tvgName || null,
            name: e.name,
            logoUrl: e.logoUrl || null,           // canonical: parsed tvg-logo, unchanged
            groupName: e.groups[0] || null,
            groups: e.groups.slice(),
            language: e.language,
            quality: e.quality,
            notAlways: e.notAlways,
            geoBlocked: e.geoBlocked,
            sources: [],
            _urls: {}
          };
          order.push(key);
        } else {
          if (!ch.logoUrl && e.logoUrl) ch.logoUrl = e.logoUrl;
          e.groups.forEach(function (g) { if (ch.groups.indexOf(g) < 0) ch.groups.push(g); });
          if (!ch.groupName && e.groups[0]) ch.groupName = e.groups[0];
          if (qRank(e.quality) > qRank(ch.quality)) ch.quality = e.quality;
          ch.notAlways = ch.notAlways && e.notAlways;
          ch.geoBlocked = ch.geoBlocked && e.geoBlocked;
        }
        if (ch._urls[e.url]) return;
        ch._urls[e.url] = true;
        var insecure = pageSecure && /^http:/i.test(e.url);
        ch.sources.push({
          id: 's' + U.hash(e.url),
          url: e.url,
          sourceName: (e.sourceName || 'Playlist') + (e.quality ? ' · ' + e.quality : '') + (e.tvgId && e.tvgId.indexOf('@') > 0 ? ' · ' + e.tvgId.split('@')[1] : ''),
          playlistId: e.sourceId,
          quality: e.quality,
          geoBlocked: e.geoBlocked,
          notAlways: e.notAlways,
          insecure: insecure,
          userAgent: e.userAgent,
          referrer: e.referrer,
          _order: ch.sources.length
        });
      });
    });

    var channels = order.map(function (key) {
      var ch = byKey[key];
      delete ch._urls;
      // Priority: secure-for-this-page, not geo-blocked, 24/7, higher quality, then playlist order.
      ch.sources.sort(function (a, b) {
        return (a.insecure - b.insecure) || (a.geoBlocked - b.geoBlocked) || (a.notAlways - b.notAlways) ||
          (qRank(b.quality) - qRank(a.quality)) || (a._order - b._order);
      });
      ch.sources.forEach(function (s, i) { s.priority = i + 1; delete s._order; });
      return ch;
    });

    var groupCounts = {};
    channels.forEach(function (c) {
      c.groups.forEach(function (g) { groupCounts[g] = (groupCounts[g] || 0) + 1; });
    });
    var groups = Object.keys(groupCounts).sort(function (a, b) { return groupCounts[b] - groupCounts[a] || a.localeCompare(b); })
      .map(function (g) { return { name: g, count: groupCounts[g] }; });

    return { channels: channels, groups: groups };
  }

  var ChannelRepository = {
    state: new INDTV.StateFlow({ status: 'loading', channels: [], groups: [], byId: {}, updatedAt: 0, error: null, refreshing: false }),
    _entriesBySource: {},
    rebuild: function () {
      var sources = SourcesRepository.all().filter(function (s) { return s.enabled && s.kind === 'live'; });
      var lists = sources.map(function (s) { return ChannelRepository._entriesBySource[s.id] || []; });
      var built = buildCatalog(lists);
      var byId = {};
      built.channels.forEach(function (c) { byId[c.id] = c; });
      var cur = ChannelRepository.state.get();
      var status = built.channels.length ? 'ready' : (cur.refreshing ? 'loading' : (cur.error ? (cur.error === 'offline' ? 'offline' : 'error') : 'empty'));
      ChannelRepository.state.update({
        status: status, channels: built.channels, groups: built.groups, byId: byId, updatedAt: Date.now()
      });
      Bus.emit('catalog', ChannelRepository.state.get());
    },
    get: function (id) { return ChannelRepository.state.get().byId[id] || null; },
    all: function () { return ChannelRepository.state.get().channels; },
    inGroup: function (groupName) {
      return ChannelRepository.all().filter(function (c) { return c.groups.indexOf(groupName) >= 0; });
    },
    matchingGroups: function (re) {
      return ChannelRepository.all().filter(function (c) {
        return c.groups.some(function (g) { return re.test(g); });
      });
    },
    search: function (query) {
      var q = U.cleanText(query, 80).toLowerCase();
      if (!q) return [];
      var nq = U.normalizeName(q);
      var scored = [];
      ChannelRepository.all().forEach(function (c) {
        var name = c.name.toLowerCase();
        var score = 0;
        if (name.indexOf(q) === 0) score = 100;
        else if (name.indexOf(q) > 0) score = 70;
        else if (nq && U.normalizeName(c.name).indexOf(nq) >= 0) score = 60;
        else if (c.tvgName && c.tvgName.toLowerCase().indexOf(q) >= 0) score = 50;
        else if (c.groups.some(function (g) { return g.toLowerCase().indexOf(q) >= 0; })) score = 30;
        if (score) scored.push({ c: c, s: score + (c.logoUrl ? 2 : 0) });
      });
      scored.sort(function (a, b) { return b.s - a.s || a.c.name.localeCompare(b.c.name); });
      return scored.map(function (x) { return x.c; });
    }
  };

  /* =========================================================
   * PlaylistRepository — fetch → validate → parse → cache → publish
   * ========================================================= */
  var inFlight = null;

  function loadEntriesForSource(src) {
    return Store.get('entries:' + src.id).then(function (entries) {
      ChannelRepository._entriesBySource[src.id] = Array.isArray(entries) ? entries : [];
    });
  }

  function textForSource(src) {
    if (src.type === 'raw' || src.type === 'file') {
      return Store.get('raw:' + src.id).then(function (raw) {
        if (typeof raw !== 'string') { var e = new Error('missing'); e.code = 'missing'; throw e; }
        return raw;
      });
    }
    return U.fetchText(src.url, { timeoutMs: 25000 });
  }

  function refreshSource(src) {
    var startedAt = Date.now();
    SourcesRepository.patch(src.id, { status: 'loading', lastAttempt: startedAt });
    return textForSource(src).then(function (text) {
      var kind = Parser.classify(text);
      if (kind === 'hls') { var e1 = new Error('hls'); e1.code = 'hls'; throw e1; }
      if (kind !== 'channels') { var e2 = new Error('not_m3u'); e2.code = 'not_m3u'; throw e2; }
      var result = Parser.parse(text, { id: src.id, name: src.name });
      if (!result.entries.length) { var e3 = new Error('empty'); e3.code = 'empty'; throw e3; }
      ChannelRepository._entriesBySource[src.id] = result.entries;
      return Store.set('entries:' + src.id, result.entries).then(function () {
        var patch = {
          status: 'ok', error: null, lastRefresh: Date.now(), count: result.entries.length,
          stats: result.stats, epgUrl: result.header.epgUrl || null
        };
        return SourcesRepository.patch(src.id, patch).then(function () { return result; });
      });
    }).catch(function (err) {
      var code = err && err.code ? err.code : 'network';
      // Keep previously cached entries: Home never empties because a refresh failed.
      return SourcesRepository.patch(src.id, { status: 'error', error: code }).then(function () { throw err; });
    });
  }

  var PlaylistRepository = {
    BUILTIN_URL: BUILTIN_URL,
    /** Cold start: read cache synchronously-ish and publish before any network. */
    init: function () {
      return Promise.all([SourcesRepository.load(), StreamHealth.load()]).then(function () {
        return Promise.all(SourcesRepository.all().map(loadEntriesForSource));
      }).then(function () {
        ChannelRepository.rebuild();
        var hasCache = ChannelRepository.all().length > 0;
        if (!hasCache) ChannelRepository.state.update({ status: 'loading' });
        return hasCache;
      });
    },
    shouldAutoRefresh: function () {
      var b = SourcesRepository.byId(BUILTIN.id);
      if (!b || !b.lastRefresh) return true;
      return Date.now() - b.lastRefresh > AUTO_REFRESH_MIN_AGE || !ChannelRepository.all().length;
    },
    /** Refresh enabled sources (or one). Concurrent calls share one in-flight job. */
    refresh: function (opts) {
      opts = opts || {};
      if (inFlight && !opts.sourceId) return inFlight;
      var targets = SourcesRepository.all().filter(function (s) {
        return opts.sourceId ? s.id === opts.sourceId : s.enabled;
      });
      ChannelRepository.state.update({ refreshing: true, error: null, status: ChannelRepository.all().length ? 'refreshing' : 'loading' });
      Bus.emit('catalog-status', ChannelRepository.state.get());
      var job = Promise.all(targets.map(function (s) {
        return refreshSource(s).then(function (r) { return { ok: true, id: s.id, result: r }; }, function (e) {
          return { ok: false, id: s.id, code: e && e.code ? e.code : 'network' };
        });
      })).then(function (results) {
        var failed = results.filter(function (r) { return !r.ok; });
        var error = null;
        if (failed.length === results.length && results.length) {
          error = failed.some(function (f) { return f.code === 'offline'; }) ? 'offline' : failed[0].code;
        }
        ChannelRepository.state.update({ refreshing: false, error: error });
        ChannelRepository.rebuild();
        Bus.emit('sources-refreshed', results);
        return results;
      });
      if (!opts.sourceId) {
        inFlight = job;
        job.then(function () { inFlight = null; }, function () { inFlight = null; });
      }
      return job;
    },
    isRefreshing: function () { return !!inFlight; },
    startBackgroundPolicy: function () {
      setInterval(function () {
        if (document.visibilityState === 'visible') PlaylistRepository.refresh();
      }, BACKGROUND_INTERVAL);
      root.addEventListener('online', function () {
        if (ChannelRepository.state.get().error) PlaylistRepository.refresh();
      });
    },
    /** Add a user source of type url | raw | file. Validates before saving. */
    addSource: function (input) {
      if (input.type === 'url') {
        var url = U.safeHttpUrl(input.url);
        if (!url) return Promise.reject(Object.assign(new Error('invalid'), { code: 'invalid_url' }));
        if (/\.m3u8(\?|$)/i.test(url)) {
          // Could still be a channel list, so check the content rather than reject on the extension alone.
          return U.fetchText(url, { timeoutMs: 15000 }).then(function (text) {
            var k = Parser.classify(text);
            if (k === 'hls') throw Object.assign(new Error('hls'), { code: 'hls' });
            if (k !== 'channels') throw Object.assign(new Error('not'), { code: 'not_m3u' });
            return PlaylistRepository._commitSource({ type: 'url', url: url, name: input.name, kind: input.kind });
          });
        }
        return PlaylistRepository._commitSource({ type: 'url', url: url, name: input.name, kind: input.kind });
      }
      var text = String(input.raw || '');
      if (text.length > 20 * 1024 * 1024) return Promise.reject(Object.assign(new Error('big'), { code: 'too_large' }));
      var kind = Parser.classify(text);
      if (kind === 'hls') return Promise.reject(Object.assign(new Error('hls'), { code: 'hls' }));
      if (kind !== 'channels') return Promise.reject(Object.assign(new Error('not'), { code: 'not_m3u' }));
      return SourcesRepository.add({ type: input.type, name: input.name, kind: input.kind }).then(function (rec) {
        return Store.set('raw:' + rec.id, text).then(function () {
          return PlaylistRepository.refresh({ sourceId: rec.id }).then(function () { return rec; });
        });
      });
    },
    _commitSource: function (src) {
      return SourcesRepository.add(src).then(function (rec) {
        return PlaylistRepository.refresh({ sourceId: rec.id }).then(function () { return rec; }, function () { return rec; });
      });
    },
    setEnabled: function (id, enabled) {
      return SourcesRepository.patch(id, { enabled: !!enabled }).then(function () {
        return loadEntriesForSource(SourcesRepository.byId(id));
      }).then(function () {
        ChannelRepository.rebuild();
        Bus.emit('vod-changed');
      });
    },
    removeSource: function (id) {
      return SourcesRepository.remove(id).then(function () {
        delete ChannelRepository._entriesBySource[id];
        ChannelRepository.rebuild();
        Bus.emit('vod-changed');
      });
    },
    entriesFor: function (sourceId) { return ChannelRepository._entriesBySource[sourceId] || []; }
  };

  /* =========================================================
   * FavoritesRepository — ordered stable channel ids
   * ========================================================= */
  var FavoritesRepository = {
    state: new INDTV.StateFlow([]),
    load: function () {
      return Store.get('favorites').then(function (ids) {
        FavoritesRepository.state.set(Array.isArray(ids) ? ids.filter(function (x) { return typeof x === 'string'; }) : []);
      });
    },
    has: function (id) { return FavoritesRepository.state.get().indexOf(id) >= 0; },
    toggle: function (id) {
      var ids = FavoritesRepository.state.get().slice();
      var i = ids.indexOf(id);
      if (i >= 0) ids.splice(i, 1); else ids.unshift(id);
      FavoritesRepository.state.set(ids);
      Store.set('favorites', ids);
      Bus.emit('favorites', ids);
      return i < 0;
    },
    /** Favorites that exist in the current catalog. Missing ones are kept, not erased, in case they return. */
    channels: function () {
      return FavoritesRepository.state.get().map(ChannelRepository.get).filter(Boolean);
    }
  };

  /* =========================================================
   * RecentRepository — one row per channel, most recent first
   * ========================================================= */
  var RecentRepository = {
    state: new INDTV.StateFlow([]),
    load: function () {
      return Store.get('recent').then(function (rows) {
        RecentRepository.state.set(Array.isArray(rows) ? rows.filter(function (r) { return r && r.id; }) : []);
      });
    },
    record: function (id) {
      var rows = RecentRepository.state.get().slice();
      var prev = null;
      rows = rows.filter(function (r) { if (r.id === id) { prev = r; return false; } return true; });
      rows.unshift({ id: id, ts: Date.now(), count: (prev ? prev.count || 1 : 0) + 1 });
      rows = rows.slice(0, 40);
      RecentRepository.state.set(rows);
      Store.set('recent', rows);
      Bus.emit('recent', rows);
    },
    countFor: function (id) {
      var r = RecentRepository.state.get().filter(function (x) { return x.id === id; })[0];
      return r ? r.count || 1 : 0;
    },
    channels: function () {
      return RecentRepository.state.get().map(function (r) { return ChannelRepository.get(r.id); }).filter(Boolean);
    }
  };

  /* =========================================================
   * Popular — stable, diverse; favors real usage once it exists. No "AI" claims.
   * ========================================================= */
  function popularChannels(limit) {
    limit = limit || 16;
    var all = ChannelRepository.all();
    if (!all.length) return [];
    var scored = all.map(function (c) {
      var s = 0;
      if (FavoritesRepository.has(c.id)) s += 60;
      s += Math.min(RecentRepository.countFor(c.id), 10) * 6;
      if (StreamHealth.workedRecently(c.id)) s += 12;
      if (c.logoUrl) s += 20;
      if (!c.notAlways) s += 6;
      if (!c.geoBlocked) s += 6;
      s += Math.max(0, qRank(c.quality)) * 2;
      if (c.sources.some(function (x) { return !x.insecure; })) s += 8;
      // stable tie-breaker so the default list does not reshuffle between launches
      var tie = parseInt(U.hash(c.id), 36) % 1000 / 1000;
      return { c: c, s: s + tie };
    });
    scored.sort(function (a, b) { return b.s - a.s; });
    // Category variety: round-robin over primary groups.
    var buckets = {}, groupOrder = [];
    scored.forEach(function (x) {
      var g = x.c.groupName || 'Other';
      if (!buckets[g]) { buckets[g] = []; groupOrder.push(g); }
      buckets[g].push(x.c);
    });
    var out = [];
    var picked = {};
    // Usage-driven picks first (favorites / watched), then diverse fill.
    scored.forEach(function (x) {
      if (out.length < limit && (FavoritesRepository.has(x.c.id) || RecentRepository.countFor(x.c.id) > 1)) {
        out.push(x.c); picked[x.c.id] = true;
      }
    });
    var round = 0;
    while (out.length < limit && round < 50) {
      var added = false;
      for (var i = 0; i < groupOrder.length && out.length < limit; i++) {
        var b = buckets[groupOrder[i]];
        while (b.length && picked[b[0].id]) b.shift();
        if (b.length && (round < 3 || b[0].logoUrl)) {
          var c = b.shift();
          out.push(c); picked[c.id] = true; added = true;
        }
      }
      if (!added) break;
      round++;
    }
    return out;
  }

  INDTV.SourcesRepository = SourcesRepository;
  INDTV.StreamHealth = StreamHealth;
  INDTV.ChannelRepository = ChannelRepository;
  INDTV.PlaylistRepository = PlaylistRepository;
  INDTV.FavoritesRepository = FavoritesRepository;
  INDTV.RecentRepository = RecentRepository;
  INDTV.popularChannels = popularChannels;
  INDTV._buildCatalog = buildCatalog;
})(typeof window !== 'undefined' ? window : globalThis);
