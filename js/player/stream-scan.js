/* INDTV — stream scan. In the background every stream of every channel (all playlists merged) is checked:
 * does it answer, how fast, which resolution. Opening a channel then needs no waiting: the streams are already
 * ordered best-first, and channels whose streams are all down are dimmed and listed last.
 * Runs in the Android app (where the TV fetches streams itself); in a browser most checks are blocked by CORS. */
(function (root) {
  'use strict';
  var INDTV = root.INDTV = root.INDTV || {};
  var FRESH = 3 * 3600000, RECHECK = 3 * 3600000, CONC = 6;

  var data = {};            // srcId -> [state 1 ok / 0 failed, height, ms, at]
  var queue = [], running = 0, total = 0, done = 0, active = false, lastRun = 0;

  function save() { INDTV.Store.set('scan', data); }
  var saveSoon = INDTV.Util.debounce(save, 4000);
  var changed = INDTV.Util.debounce(function () { INDTV.Bus.emit('scan'); }, 1500);

  var Scan = {
    load: function () {
      return INDTV.Store.get('scan').then(function (d) { if (d && typeof d === 'object') data = d; }, function () {});
    },
    enabled: function () { return !!root.INDTVNative; },
    /** Ranker-shaped result for a stream when it was checked recently, else null. */
    result: function (src) {
      var r = data[src.id];
      if (!r || Date.now() - r[3] > FRESH) return null;
      return { src: src, state: r[0] ? 'ok' : 'failed', height: r[1] || parseInt(src.quality, 10) || 0, ms: r[2] || 1500 };
    },
    store: function (src, r) {
      if (!r || r.state === 'unknown') return;
      data[src.id] = [r.state === 'ok' ? 1 : 0, r.height || 0, r.ms || 0, Date.now()];
      saveSoon(); changed();
    },
    /** 'ok' | 'dead' | 'unknown' for a channel. */
    channelState: function (ch) {
      if (!ch || !ch.sources || !ch.sources.length) return 'unknown';
      var anyOk = false, allDead = true, now = Date.now();
      ch.sources.forEach(function (s) {
        var r = data[s.id];
        if (!r || now - r[3] > FRESH * 4) { allDead = false; return; }
        if (r[0]) { anyOk = true; allDead = false; }
      });
      if (anyOk || INDTV.StreamHealth.workedRecently(ch.id) && !allDead) return 'ok';
      return allDead ? 'dead' : 'unknown';
    },
    /** Working channels first (stable otherwise). */
    sort: function (list) {
      if (!Scan.enabled()) return list;
      var dead = [], live = [];
      list.forEach(function (c) { (Scan.channelState(c) === 'dead' ? dead : live).push(c); });
      return live.concat(dead);
    },
    progress: function () { return { active: active, done: done, total: total, last: lastRun }; },
    summary: function () {
      var n = 0, ok = 0, at = 0;
      Object.keys(data).forEach(function (k) { n++; if (data[k][0]) ok++; at = Math.max(at, data[k][3]); });
      return { n: n, ok: ok, at: at };
    },

    /** Check every stream, the channels you use first. force = also re-check fresh results. */
    run: function (force) {
      if (!Scan.enabled() || active) return;
      var chans = INDTV.ChannelRepository.all();
      if (!chans.length) return;
      var first = [].concat(INDTV.FavoritesRepository.channels(), INDTV.RecentRepository.channels());
      INDTV.Categories.ranked().slice(0, 4).forEach(function (c) { first = first.concat(c.channels.slice(0, 30)); });
      var seen = {}, order = [];
      first.concat(chans).forEach(function (c) { if (!seen[c.id]) { seen[c.id] = 1; order.push(c); } });
      queue = [];
      order.forEach(function (c) {
        c.sources.forEach(function (s) {
          if (s.insecure) return;
          var r = data[s.id];
          if (!force && r && Date.now() - r[3] < RECHECK) return;
          queue.push(s);
        });
      });
      total = queue.length; done = 0;
      if (!total) { lastRun = Date.now(); return; }
      active = true;
      INDTV.Bus.emit('scan-progress');
      for (var i = 0; i < CONC; i++) Scan._next();
    },
    _next: function () {
      if (!queue.length) {
        if (running === 0 && active) { active = false; lastRun = Date.now(); save(); INDTV.Bus.emit('scan'); INDTV.Bus.emit('scan-progress'); }
        return;
      }
      // never compete with a channel that is starting to play
      var st = INDTV.Player && INDTV.Player.state.get();
      if (st && st.phase === 'loading') { setTimeout(Scan._next, 1500); return; }
      var s = queue.shift();
      running++;
      INDTV._ranker.probe(s).then(function (r) {
        running--; done++;
        Scan.store(s, r);
        if (done % 20 === 0) INDTV.Bus.emit('scan-progress');
        Scan._next();
      });
    },
    start: function () {
      if (!Scan.enabled()) return;
      setTimeout(function () { Scan.run(false); }, 8000);
      setInterval(function () { Scan.run(false); }, RECHECK);
      INDTV.Bus.on('catalog', INDTV.Util.debounce(function () { Scan.run(false); }, 15000));
    }
  };

  INDTV.StreamScan = Scan;
})(typeof window !== 'undefined' ? window : globalThis);
