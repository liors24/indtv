/* INDTV — catch-up ("watch again"). The TV records by itself, with no button press:
 *   - whatever you watch (switchable), and
 *   - channels you pick for background catch-up (they keep recording while INDTV runs, also with the screen off).
 * Recordings are cut into chunks per programme (from the guide) or per clock hour, named after the programme
 * and filed by day and hour. Everything stays on this TV; chunks older than the chosen number of days, or
 * the oldest ones when storage runs low, are deleted automatically. Built on the DVR capture sessions. */
(function (root) {
  'use strict';
  var INDTV = root.INDTV = root.INDTV || {};
  var Bus = INDTV.Bus, Store = INDTV.Store;
  var HOUR = 3600000, DAY = 24 * HOUR;
  var MAX_BG = 4;                 // channels recorded in the background at once
  var MIN_KEEP_SEC = 60;          // shorter chunks are dropped
  var STORAGE_HIGH = 0.82, STORAGE_OK = 0.72;

  function cfg() {
    var c = null;
    try { c = Store.getSync('catchup'); } catch (e) { c = null; }
    c = c && typeof c === 'object' ? c : {};
    return {
      watched: c.watched !== false,
      channels: Array.isArray(c.channels) ? c.channels.filter(function (x) { return typeof x === 'string'; }).slice(0, MAX_BG) : [],
      days: [1, 3, 7, 14].indexOf(c.days) >= 0 ? c.days : 7,
      urls: c.urls && typeof c.urls === 'object' ? c.urls : {}
    };
  }
  function saveCfg(c) { try { Store.setSync('catchup', c); } catch (e) { /* ignore */ } }

  var uid = 0;
  function newId() { return 'c' + Date.now().toString(36) + (++uid).toString(36); }
  function st() { return INDTV.DVR._store; }

  /** The guide programme airing at `wall`, or the clock hour around it. */
  function slotAt(ch, wall) {
    var list = INDTV.EpgRepository && INDTV.EpgRepository.listFor(ch);
    if (list) {
      for (var i = 0; i < list.length; i++) {
        var p = list[i];
        if (p.start <= wall && p.stop > wall && p.stop - p.start <= 6 * HOUR) return { start: p.start, end: p.stop, title: p.title };
      }
    }
    var d = new Date(wall); d.setMinutes(0, 0, 0);
    return { start: d.getTime(), end: d.getTime() + HOUR, title: null };
  }

  function plainRow(c) {
    return {
      id: c.id, kind: 'catchup', chId: c.chId, chName: c.chName, title: c.title, progTitle: c.progTitle || null,
      slotStart: c.slotStart, slotEnd: c.slotEnd, startWall: c.startWall, endWall: c.endWall || Date.now(),
      status: c.status, bytes: c.bytes, createdAt: c.createdAt, lastPos: c.lastPos || 0, init: c.init || null, owner: null,
      segs: c.segs.map(function (m) { return { i: m.i, k: m.k, dur: m.dur, disc: m.disc, wall: m.wall, sn: m.sn, bytes: m.bytes, rec: m.rec }; })
    };
  }
  function durOf(c) { var d = 0; (c.segs || []).forEach(function (m) { d += m.dur; }); return d; }

  /** Writes one channel's captured segments into consecutive chunks. */
  function Writer(ch) { this.ch = ch; this.cur = null; }
  Writer.prototype.chunkAt = function (wall, session) {
    var c = this.cur;
    if (c && wall >= c.slotStart && wall < c.slotEnd) return c;
    if (c) CatchUp._finish(c);
    var slot = slotAt(this.ch, wall);
    c = this.cur = {
      id: newId(), kind: 'catchup', chId: this.ch.id, chName: this.ch.name, progTitle: slot.title, title: slot.title || this.ch.name,
      slotStart: slot.start, slotEnd: slot.end, startWall: wall, endWall: null, status: 'recording',
      segs: [], count: 0, bytes: 0, init: null, createdAt: Date.now(), lastPos: 0
    };
    CatchUp._live[c.id] = c;
    if (session && session.initKey) {      // fMP4 streams: every chunk carries its own init segment
      var ik = 'r' + c.id + ':init';
      st().getSeg(session.initKey).then(function (r) { if (r && r.blob) return st().putSeg(ik, r.blob).then(function () { c.init = ik; }); });
    }
    return c;
  };
  Writer.prototype.add = function (chunk, meta) {
    chunk.segs.push(meta);
    chunk.bytes += meta.bytes;
    chunk.endWall = meta.wall + meta.dur * 1000;
    if (chunk.segs.length === 1 || chunk.segs.length % 15 === 0) { st().putRec(plainRow(chunk)).catch(function () {}); CatchUp._changed(); }
  };
  Writer.prototype.close = function () { if (this.cur) CatchUp._finish(this.cur); this.cur = null; };

  /** Small adapter so a Session can call cu.chunkAt / cu.add / cu.close. */
  function sessionWriter(ch) {
    var w = new Writer(ch);
    return {
      chunkAt: function (wall, s) { return w.chunkAt(wall, s); },
      add: function (chunk, meta) { if (!chunk._done) w.add(chunk, meta); return Promise.resolve(); },
      close: function () { w.close(); },
      chId: ch.id
    };
  }

  var CatchUp = {
    state: new INDTV.StateFlow([]),     // finished + live chunks, newest first
    _rows: [], _live: {}, _bg: {}, _started: false,

    config: cfg,
    minKeepSec: MIN_KEEP_SEC,
    recordsWatched: function () { return cfg().watched; },
    channels: function () { return cfg().channels; },
    days: function () { return cfg().days; },
    setWatched: function (on) { var c = cfg(); c.watched = !!on; saveCfg(c); Bus.emit('catchup-cfg'); },
    setDays: function (d) { var c = cfg(); c.days = d; saveCfg(c); CatchUp.prune(); Bus.emit('catchup-cfg'); },
    isBackground: function (chId) { return cfg().channels.indexOf(chId) >= 0; },
    /** Turn background catch-up on/off for a channel. Returns false when the limit is reached. */
    toggleChannel: function (chId) {
      var c = cfg(), i = c.channels.indexOf(chId);
      if (i >= 0) c.channels.splice(i, 1);
      else { if (c.channels.length >= MAX_BG) return false; c.channels.push(chId); }
      saveCfg(c);
      CatchUp.syncBackground();
      Bus.emit('catchup-cfg');
      return true;
    },
    maxChannels: MAX_BG,
    rememberUrl: function (chId, url) {
      var c = cfg();
      if (c.urls[chId] === url) return;
      c.urls[chId] = url;
      var keys = Object.keys(c.urls);
      if (keys.length > 200) delete c.urls[keys[0]];
      saveCfg(c);
    },

    writer: function (ch) { return sessionWriter(ch); },

    /* ---------- background capture ---------- */
    backgroundCount: function () { return Object.keys(CatchUp._bg).length; },
    /** The player takes over a channel that is already being captured. */
    takeBackground: function (chId) {
      var s = CatchUp._bg[chId];
      if (!s || s.stopped) { delete CatchUp._bg[chId]; return null; }
      delete CatchUp._bg[chId];
      return s;
    },
    /** A session the player leaves keeps capturing if its channel is on the background list. */
    adopt: function (s) {
      if (!s || s.stopped || !CatchUp.isBackground(s.chId) || CatchUp._bg[s.chId]) return false;
      if (!s.cu) s.cu = sessionWriter(INDTV.ChannelRepository.get(s.chId) || { id: s.chId, name: s.chName });
      s.ringSec = 20; s.detached = true;
      CatchUp._bg[s.chId] = s;
      INDTV.DVR._syncNative();
      return true;
    },
    syncBackground: function () {
      if (!INDTV.DVR || !INDTV.DVR.supported()) return;
      var want = cfg().channels, cur = INDTV.DVR.current();
      Object.keys(CatchUp._bg).forEach(function (id) {
        if (want.indexOf(id) < 0 || CatchUp._bg[id].stopped) { CatchUp._bg[id].stop(); delete CatchUp._bg[id]; }
      });
      want.forEach(function (id) {
        if (CatchUp._bg[id] || (cur && cur.chId === id && !cur.stopped)) return;
        var ch = INDTV.ChannelRepository.get(id);
        if (!ch) return;
        var url = cfg().urls[id] || ((ch.sources || []).filter(function (x) { return /\.m3u8(\?|$)/i.test(x.url) || x.type === 'hls'; })[0] || ch.sources[0] || {}).url;
        if (!url) return;
        var s = new INDTV.DVR._Session(ch, url, {}, 20);
        s.cu = sessionWriter(ch);
        s.detached = true;
        CatchUp._bg[id] = s;
        s.start();
      });
      INDTV.DVR._syncNative();
      Bus.emit('catchup');
    },

    /* ---------- chunks ---------- */
    _finish: function (c) {
      if (c._done) return;
      c._done = true;
      delete CatchUp._live[c.id];
      c.status = 'done';
      if (durOf(c) < CatchUp.minKeepSec) {
        var keys = c.segs.map(function (m) { return m.k; }); if (c.init) keys.push(c.init);
        st().delSegs(keys); st().delRec(c.id).catch(function () {});
      } else {
        var row = plainRow(c);
        st().putRec(row).catch(function () {});
        CatchUp._rows.push(row);
      }
      CatchUp._changed();
    },
    _loaded: function (rows) {
      CatchUp._rows = rows;
      CatchUp._changed();
    },
    _start: function () {
      CatchUp.prune();
      if (!CatchUp._started) {
        CatchUp._started = true;
        setInterval(CatchUp.prune, 30 * 60 * 1000);
        // background channels need the catalog: start once it is there
        var go = function () { if (INDTV.ChannelRepository.all().length) CatchUp.syncBackground(); };
        go();
        Bus.on('catalog', INDTV.Util.debounce(go, 2000));
        setInterval(function () {        // restart a background capture that died (network drop)
          Object.keys(CatchUp._bg).forEach(function (id) { if (CatchUp._bg[id].stopped) delete CatchUp._bg[id]; });
          if (CatchUp.backgroundCount() < cfg().channels.length) CatchUp.syncBackground();
        }, 60000);
      }
    },
    _changed: INDTV.Util ? INDTV.Util.debounce(function () { CatchUp._publish(); }, 400) : function () { CatchUp._publish(); },
    _publish: function () {
      var live = Object.keys(CatchUp._live).map(function (k) { return CatchUp._live[k]; }).filter(function (c) { return c.segs.length; });
      var rows = CatchUp._rows.concat(live).map(function (c) {
        return { id: c.id, chId: c.chId, chName: c.chName, title: c.title, progTitle: c.progTitle, slotStart: c.slotStart, slotEnd: c.slotEnd,
          startWall: c.startWall, endWall: c.endWall || Date.now(), dur: durOf(c), bytes: c.bytes, live: !!CatchUp._live[c.id], lastPos: c.lastPos || 0 };
      });
      rows.sort(function (a, b) { return b.startWall - a.startWall; });
      CatchUp.state.set(rows);
      Bus.emit('catchup');
    },
    get: function (id) {
      if (CatchUp._live[id]) return CatchUp._live[id];
      return CatchUp._rows.filter(function (r) { return r.id === id; })[0] || null;
    },
    saveProgress: function (id, pos) {
      var r = CatchUp._rows.filter(function (x) { return x.id === id; })[0];
      if (!r) return;
      r.lastPos = pos;
      st().putRec(r).catch(function () {});
    },
    remove: function (id) {
      var r = CatchUp._rows.filter(function (x) { return x.id === id; })[0];
      if (!r) return Promise.resolve();
      CatchUp._rows = CatchUp._rows.filter(function (x) { return x !== r; });
      var keys = (r.segs || []).map(function (m) { return m.k; }); if (r.init) keys.push(r.init);
      CatchUp._changed();
      return st().delSegs(keys).then(function () { return st().delRec(r.id); }).catch(function () {});
    },
    /** Old chunks go first: by age, then while storage is nearly full. */
    prune: function () {
      var limit = Date.now() - cfg().days * DAY;
      var old = CatchUp._rows.filter(function (r) { return (r.endWall || r.startWall) < limit; });
      var chain = Promise.all(old.map(function (r) { return CatchUp.remove(r.id); }));
      return chain.then(function () {
        if (!root.navigator || !navigator.storage || !navigator.storage.estimate) return;
        return navigator.storage.estimate().then(function (e) {
          if (!e || !e.quota || e.usage / e.quota < STORAGE_HIGH) return;
          var need = e.usage - e.quota * STORAGE_OK, freed = 0;
          var byAge = CatchUp._rows.slice().sort(function (a, b) { return a.startWall - b.startWall; });
          var drop = [];
          for (var i = 0; i < byAge.length && freed < need; i++) { drop.push(byAge[i].id); freed += byAge[i].bytes || 0; }
          return Promise.all(drop.map(CatchUp.remove));
        });
      }).catch(function () { /* ignore */ });
    },
    usageBytes: function () { var b = 0; CatchUp.state.get().forEach(function (r) { b += r.bytes || 0; }); return b; }
  };

  INDTV.CatchUp = CatchUp;
})(typeof window !== 'undefined' ? window : globalThis);
