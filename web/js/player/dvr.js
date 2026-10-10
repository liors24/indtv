/* INDTV — DVR: recording and rewinding live TV.
 *
 * How it works (no re-encoding, nothing leaves the device):
 *   - While a channel plays, a "session" downloads the same HLS segments the player uses and keeps the
 *     most recent N minutes on disk (IndexedDB) — the time-shift buffer.
 *   - Rewinding plays that buffer through hls.js (a virtual playlist served by DvrLoader); "back to live" returns to the
 *     real stream. The session keeps capturing the whole time, so nothing is lost while you watch behind.
 *   - Recording marks segments to keep permanently (own keys), starting at the programme start when the buffer has it.
 *     A recording keeps running if you change channel.
 *   - Recordings are listed in the Recordings screen and play from disk like any video.
 * Encrypted streams (AES-128 / DRM) are never captured. */
(function (root) {
  'use strict';
  var INDTV = root.INDTV = root.INDTV || {};
  var Bus = INDTV.Bus, Store = INDTV.Store;

  var MAX_REC_MS = 6 * 3600 * 1000;       // safety stop for open-ended recordings
  var MAX_FAILS = 8;
  var QUOTA_STOP = 0.93;                  // stop recording when the device storage is this full

  /* ---------- IndexedDB ---------- */
  var DBP = null;
  function db() {
    if (DBP) return DBP;
    DBP = new Promise(function (resolve, reject) {
      var req;
      try { req = root.indexedDB.open('indtv-dvr', 1); } catch (e) { reject(e); return; }
      req.onupgradeneeded = function () {
        var d = req.result;
        d.createObjectStore('segs', { keyPath: 'k' });
        d.createObjectStore('recs', { keyPath: 'id' });
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    DBP.catch(function () { DBP = null; });
    return DBP;
  }
  function tx(store, mode, fn) {
    return db().then(function (d) {
      return new Promise(function (resolve, reject) {
        var t = d.transaction(store, mode), s = t.objectStore(store), req = fn(s);
        t.oncomplete = function () { resolve(req && 'result' in req ? req.result : undefined); };
        t.onerror = t.onabort = function () { reject(t.error || new Error('idb')); };
      });
    });
  }
  function putSeg(k, blob) { return tx('segs', 'readwrite', function (s) { return s.put({ k: k, blob: blob }); }); }
  function getSeg(k) { return tx('segs', 'readonly', function (s) { return s.get(k); }); }
  function delSegs(keys) {
    if (!keys.length) return Promise.resolve();
    return db().then(function (d) {
      return new Promise(function (resolve) {
        var t = d.transaction('segs', 'readwrite'), s = t.objectStore('segs');
        keys.forEach(function (k) { s.delete(k); });
        t.oncomplete = t.onerror = t.onabort = function () { resolve(); };
      });
    }).catch(function () { /* ignore */ });
  }
  function putRec(r) { return tx('recs', 'readwrite', function (s) { return s.put(r); }); }
  function delRec(id) { return tx('recs', 'readwrite', function (s) { return s.delete(id); }); }
  function allRecs() { return tx('recs', 'readonly', function (s) { return s.getAll(); }).then(function (r) { return r || []; }); }
  function allSegKeys() { return tx('segs', 'readonly', function (s) { return s.getAllKeys(); }).then(function (r) { return r || []; }); }

  /* ---------- HTTP + playlist parsing ---------- */
  function getText(url) {
    return fetch(url, { cache: 'no-store', credentials: 'omit' }).then(function (r) {
      if (!r.ok) { var e = new Error('HTTP ' + r.status); e.status = r.status; throw e; }
      return r.text();
    });
  }
  function getBuf(url) {
    return fetch(url, { credentials: 'omit' }).then(function (r) {
      if (!r.ok) { var e = new Error('HTTP ' + r.status); e.status = r.status; throw e; }
      return r.arrayBuffer();
    });
  }
  function abs(u, base) { try { return new URL(u, base).href; } catch (e) { return u; } }
  function attrs(str) {
    var out = {}, re = /([A-Z0-9-]+)=("([^"]*)"|[^,]*)/g, m;
    while ((m = re.exec(str))) out[m[1]] = m[3] !== undefined ? m[3] : m[2];
    return out;
  }
  function parsePlaylist(text, base) {
    var pl = { master: false, variants: [], segs: [], target: 6, mediaSeq: 0, ended: false, encrypted: false, map: null };
    var dur = null, disc = false, pdt = null, variant = null;
    text.split(/\r?\n/).forEach(function (raw) {
      var l = raw.trim();
      if (!l) return;
      if (l.charAt(0) === '#') {
        var a;
        if (l.indexOf('#EXT-X-STREAM-INF:') === 0) {
          a = attrs(l.slice(18));
          var h = a.RESOLUTION ? parseInt(String(a.RESOLUTION).split('x')[1], 10) : 0;
          variant = { bw: parseInt(a.BANDWIDTH, 10) || 0, h: h || 0 };
          pl.master = true;
        } else if (l.indexOf('#EXT-X-TARGETDURATION:') === 0) pl.target = parseFloat(l.slice(22)) || 6;
        else if (l.indexOf('#EXT-X-MEDIA-SEQUENCE:') === 0) pl.mediaSeq = parseInt(l.slice(22), 10) || 0;
        else if (l.indexOf('#EXT-X-KEY:') === 0) { a = attrs(l.slice(11)); if (a.METHOD && a.METHOD !== 'NONE') pl.encrypted = true; }
        else if (l.indexOf('#EXT-X-MAP:') === 0) { a = attrs(l.slice(11)); if (a.URI) pl.map = abs(a.URI, base); }
        else if (l.indexOf('#EXTINF:') === 0) dur = parseFloat(l.slice(8)) || 0;
        else if (l === '#EXT-X-DISCONTINUITY') disc = true;
        else if (l.indexOf('#EXT-X-PROGRAM-DATE-TIME:') === 0) pdt = Date.parse(l.slice(25)) || null;
        else if (l.indexOf('#EXT-X-ENDLIST') === 0) pl.ended = true;
        return;
      }
      if (variant) { variant.url = abs(l, base); pl.variants.push(variant); variant = null; return; }
      if (dur !== null) {
        pl.segs.push({ url: abs(l, base), dur: dur, sn: pl.mediaSeq + pl.segs.length, disc: disc, pdt: pdt });
        dur = null; disc = false; pdt = null;
      }
    });
    return pl;
  }

  function settings() {
    var c = null;
    try { c = Store.getSync('dvr'); } catch (e) { c = null; }
    c = c && typeof c === 'object' ? c : {};
    return {
      ringMin: typeof c.ringMin === 'number' ? c.ringMin : 30,
      autoStop: c.autoStop !== false,
      fromStart: c.fromStart !== false,
      padMin: typeof c.padMin === 'number' ? c.padMin : 2
    };
  }

  /* ---------- timers that keep running in the background ----------
   * Browsers throttle setTimeout in hidden pages (to once a minute after a few minutes), which would leave gaps in a
   * recording made while the app is in the background. A Web Worker's clock is not throttled, so it drives our timers. */
  var Tick = {
    jobs: [], worker: null, id: 0,
    start: function () {
      if (Tick.worker || Tick.failed) return;
      try {
        var src = 'setInterval(function(){postMessage(0)},400)';
        var url = (root.URL || root.webkitURL).createObjectURL(new Blob([src], { type: 'application/javascript' }));
        Tick.worker = new Worker(url);
        Tick.worker.onmessage = Tick.run;
      } catch (e) { Tick.failed = true; Tick.worker = null; }
    },
    run: function () {
      var now = Date.now(), due = [];
      Tick.jobs = Tick.jobs.filter(function (j) { if (j.at <= now) { due.push(j); return false; } return true; });
      due.forEach(function (j) { try { j.fn(); } catch (e) { if (root.console) console.warn('[INDTV dvr] timer error', e); } });
      if (!Tick.jobs.length && Tick.worker) { Tick.worker.terminate(); Tick.worker = null; }
    },
    /** like setTimeout; returns a handle for Tick.cancel */
    after: function (fn, ms) {
      Tick.start();
      if (!Tick.worker) return { t: setTimeout(fn, ms) };
      var j = { id: ++Tick.id, at: Date.now() + ms, fn: fn };
      Tick.jobs.push(j);
      return j;
    },
    cancel: function (h) {
      if (!h) return;
      if (h.t) { clearTimeout(h.t); return; }
      Tick.jobs = Tick.jobs.filter(function (j) { return j !== h; });
    }
  };

  /* ---------- capture session (one per watched channel) ---------- */
  var uid = 0;
  function newId(p) { return p + Date.now().toString(36) + (++uid).toString(36); }

  function Session(ch, url, hint, ringSec) {
    this.sid = newId('s');
    this.chId = ch.id; this.chName = ch.name;
    this.url = url; this.hint = hint || {};
    this.ringSec = ringSec;
    this.segs = [];          // [{i,k,dur,disc,wall,sn,bytes,rec}]
    this.n = 0;              // next global index
    this.lastSn = -1;
    this.mediaUrl = null; this.initKey = null; this.initUrl = null;
    this.stopped = false; this.error = null; this.fails = 0; this.timer = null;
    this.rec = null;         // active recording
    this.detached = false;
  }
  Session.prototype.start = function () { this._loop(); };
  Session.prototype._loop = function () {
    var self = this;
    if (self.stopped) return;
    self._step().then(function (gotNew) {
      self.fails = 0;
      self.timer = Tick.after(function () { self._loop(); }, gotNew ? 600 : 1200);
    }, function (e) {
      if (self.stopped) return;
      if (e && e.fatal) { self._fatal(e.fatal); return; }
      self.fails++;
      if (self.fails >= MAX_FAILS) { self._fatal('network'); return; }
      self.timer = Tick.after(function () { self._loop(); }, Math.min(5000, 800 * self.fails));
    });
  };
  Session.prototype._fatal = function (why) {
    this.error = why;
    if (this.rec) DVR._finishRec(this, why);
    this.stop();
    Bus.emit('dvr');
  };
  Session.prototype._resolve = function () {
    var self = this;
    return getText(self.url).then(function (text) {
      var pl = parsePlaylist(text, self.url);
      if (!pl.master) { self.mediaUrl = self.url; return; }
      var v = pl.variants, pick = null, i;
      if (self.hint.uri) for (i = 0; i < v.length; i++) if (v[i].url === self.hint.uri) pick = v[i];
      if (!pick && self.hint.height) {
        var best = 1e9;
        v.forEach(function (x) { var d = Math.abs((x.h || 0) - self.hint.height); if (d < best) { best = d; pick = x; } });
      }
      if (!pick) { var sorted = v.slice().sort(function (a, b) { return a.bw - b.bw; }); pick = sorted[Math.floor(sorted.length / 2)]; }
      if (!pick) throw Object.assign(new Error('no variant'), { fatal: 'unsupported' });
      self.mediaUrl = pick.url;
    });
  };
  Session.prototype._step = function () {
    var self = this;
    return (self.mediaUrl ? Promise.resolve() : self._resolve()).then(function () {
      return getText(self.mediaUrl);
    }).then(function (text) {
      var pl = parsePlaylist(text, self.mediaUrl);
      if (pl.master) throw Object.assign(new Error('nested'), { fatal: 'unsupported' });
      if (pl.encrypted) throw Object.assign(new Error('encrypted'), { fatal: 'encrypted' });
      var last = pl.mediaSeq + pl.segs.length - 1, gap = false;
      if (self.lastSn >= 0 && last < self.lastSn) { self.lastSn = -1; gap = true; }          // numbering restarted
      if (self.lastSn >= 0 && pl.mediaSeq > self.lastSn + 1) gap = true;                     // we fell behind: segments missed
      var fresh = pl.segs.filter(function (s) { return s.sn > self.lastSn; });
      if (self.lastSn < 0 && fresh.length > 3) fresh = fresh.slice(-3);
      if (gap && fresh.length) fresh[0].disc = true;
      var initP = Promise.resolve();
      if (pl.map && !self.initKey) {
        self.initUrl = pl.map;
        initP = getBuf(pl.map).then(function (buf) { var k = self.sid + ':init'; return putSeg(k, new Blob([buf])).then(function () { self.initKey = k; }); });
      }
      return initP.then(function () {
        var chain = Promise.resolve();
        fresh.forEach(function (s) { chain = chain.then(function () { return self._add(s); }); });
        return chain;
      }).then(function () { if (pl.ended) { self.stop(true); } return fresh.length > 0; });
    });
  };
  Session.prototype._add = function (s) {
    var self = this;
    if (self.stopped) return Promise.resolve();
    return getBuf(s.url).then(function (buf) {
      if (self.stopped) return;
      var rec = self.rec;
      var i = self.n++;
      var k = rec ? 'r' + rec.id + ':' + rec.count++ : self.sid + ':' + i;
      var last = self.segs.length ? self.segs[self.segs.length - 1] : null;
      var wall = s.pdt || (last && !s.disc ? last.wall + last.dur * 1000 : Date.now() - s.dur * 1000);
      var meta = { i: i, k: k, dur: s.dur, disc: !!s.disc, wall: wall, sn: s.sn, bytes: buf.byteLength, rec: rec ? rec.id : null };
      self.lastSn = s.sn;
      return putSeg(k, new Blob([buf])).then(function () {
        self.segs.push(meta);
        if (rec) {
          rec.segs.push(meta); rec.bytes += meta.bytes;
          if (rec.segs.length % 10 === 0) DVR._persist(rec);
        }
        self._trim();
        if (rec) DVR._guard(self);
        Bus.emit('dvr');
      });
    });
  };
  Session.prototype._trim = function () {
    var total = 0, drop = [];
    this.segs.forEach(function (m) { total += m.dur; });
    while (this.segs.length > 2 && total > this.ringSec) {
      var m = this.segs.shift();
      total -= m.dur;
      if (!m.rec) drop.push(m.k);     // recorded segments belong to their recording
    }
    delSegs(drop);
  };
  Session.prototype.duration = function () { var d = 0; this.segs.forEach(function (m) { d += m.dur; }); return d; };
  Session.prototype.stop = function (keepRec) {
    if (this.stopped) return;
    this.stopped = true;
    Tick.cancel(this.timer);
    var drop = [];
    this.segs.forEach(function (m) { if (!m.rec) drop.push(m.k); });
    if (this.initKey && !this.rec) drop.push(this.initKey);
    delSegs(drop);
    if (!keepRec && this.rec) DVR._finishRec(this, 'stopped');
  };

  /* ---------- virtual playlists for hls.js ---------- */
  var plays = {};
  function playlistText(segs, initKey, ended) {
    var maxd = 1, i;
    for (i = 0; i < segs.length; i++) if (segs[i].dur > maxd) maxd = segs[i].dur;
    var out = ['#EXTM3U', '#EXT-X-VERSION:' + (initKey ? 6 : 3), '#EXT-X-TARGETDURATION:' + Math.ceil(maxd),
      '#EXT-X-MEDIA-SEQUENCE:' + (segs.length ? segs[0].i : 0)];
    if (ended) out.push('#EXT-X-PLAYLIST-TYPE:VOD');
    if (initKey) out.push('#EXT-X-MAP:URI="indtv-dvr://seg/' + encodeURIComponent(initKey) + '"');
    segs.forEach(function (m) {
      if (m.disc) out.push('#EXT-X-DISCONTINUITY');
      out.push('#EXTINF:' + m.dur.toFixed(3) + ',', 'indtv-dvr://seg/' + encodeURIComponent(m.k));
    });
    if (ended) out.push('#EXT-X-ENDLIST');
    return out.join('\n') + '\n';
  }
  function stats() {
    return { aborted: false, loaded: 0, retry: 0, total: 0, chunkCount: 0, bwEstimate: 0,
      loading: { start: 0, first: 0, end: 0 }, parsing: { start: 0, end: 0 }, buffering: { start: 0, first: 0, end: 0 } };
  }
  /** hls.js loader that serves the virtual playlist and the stored segments. */
  function DvrLoader() { this.stats = stats(); this.context = null; this._dead = false; }
  DvrLoader.prototype.destroy = function () { this._dead = true; };
  DvrLoader.prototype.abort = function () { this._dead = true; this.stats.aborted = true; };
  DvrLoader.prototype.load = function (context, config, callbacks) {
    var self = this, st = self.stats, url = context.url;
    self.context = context;
    st.loading.start = performance.now();
    function done(data, size) {
      if (self._dead) return;
      st.loading.first = st.loading.end = performance.now();
      st.loaded = st.total = size;
      st.bwEstimate = 80e6;
      callbacks.onSuccess({ url: url, data: data }, st, context, null);
    }
    function fail(code, text) { if (!self._dead) callbacks.onError({ code: code, text: text }, context, null, st); }
    if (url.indexOf('indtv-dvr://pl/') === 0) {
      var h = plays[url.slice(15)];
      if (!h) { setTimeout(function () { fail(404, 'gone'); }, 0); return; }
      var text = h.text();
      setTimeout(function () { done(text, text.length); }, 0);
      return;
    }
    var key = decodeURIComponent(url.replace('indtv-dvr://seg/', ''));
    getSeg(key).then(function (rec) {
      if (!rec || !rec.blob) { fail(404, 'segment gone'); return; }
      var blob = rec.blob;
      if (blob.arrayBuffer) return blob.arrayBuffer().then(function (b) { done(b, b.byteLength); });
      var fr = new FileReader();
      fr.onload = function () { done(fr.result, fr.result.byteLength); };
      fr.onerror = function () { fail(500, 'read'); };
      fr.readAsArrayBuffer(blob);
    }, function () { fail(500, 'storage'); });
  };

  /* ---------- public API ---------- */
  var DVR = {
    state: new INDTV.StateFlow([]),      // recordings (newest first)
    _cur: null, _detached: [], Loader: DvrLoader,

    settings: settings,
    saveSettings: function (patch) {
      var c = settings();
      Object.keys(patch).forEach(function (k) { c[k] = patch[k]; });
      Store.setSync('dvr', c);
      if (DVR._cur && typeof patch.ringMin === 'number' && !DVR._cur.rec) DVR._cur.ringSec = Math.max(60, c.ringMin * 60);
      Bus.emit('dvr');
      return c;
    },
    supported: function () { return !!(root.indexedDB && root.fetch && root.Blob && root.Hls && root.Hls.isSupported()); },

    load: function () {
      if (!root.indexedDB) return Promise.resolve();
      return allRecs().then(function (rows) {
        rows.forEach(function (r) { if (r.status === 'recording') r.status = 'done'; });
        DVR._rows = rows;
        DVR._publish();
        // Buffer segments of earlier runs are useless now: keep only what recordings own.
        return allSegKeys().then(function (keys) {
          var drop = keys.filter(function (k) { return String(k).charAt(0) !== 'r'; });
          return delSegs(drop);
        });
      }).catch(function () { DVR._rows = []; });
    },
    _rows: [],
    _publish: function () {
      var live = {};
      DVR._active().forEach(function (s) { if (s.rec) live[s.rec.id] = s.rec; });
      var rows = DVR._rows.filter(function (r) { return !live[r.id]; }).concat(Object.keys(live).map(function (k) { return DVR._rowOf(live[k]); }));
      rows.sort(function (a, b) { return b.createdAt - a.createdAt; });
      DVR.state.set(rows);
      DVR._syncNative();
    },
    /** Tell the Android app a recording is running, so it keeps the process alive when the user leaves. */
    _nativeOn: false,
    _syncNative: function () {
      var on = DVR.isRecording(), rec = DVR.activeRec();
      if (on === DVR._nativeOn) return;
      DVR._nativeOn = on;
      try { if (root.INDTVNative && root.INDTVNative.setRecording) root.INDTVNative.setRecording(on, on && rec ? (rec.title || rec.chName || '') : ''); } catch (e) { /* ignore */ }
    },
    _active: function () { return (DVR._cur ? [DVR._cur] : []).concat(DVR._detached); },
    recordings: function () { return DVR.state.get(); },
    getRec: function (id) { var r = DVR.state.get().filter(function (x) { return x.id === id; })[0]; return r || null; },
    _rowOf: function (rec) {
      var d = 0; rec.segs.forEach(function (m) { d += m.dur; });
      return { id: rec.id, chId: rec.chId, chName: rec.chName, title: rec.title, startWall: rec.startWall, endWall: rec.endWall || Date.now(),
        status: rec.status, bytes: rec.bytes, dur: d, createdAt: rec.createdAt, lastPos: rec.lastPos || 0, init: rec.init, segs: rec.segs, error: rec.error || null };
    },

    /* --- watching a channel --- */
    current: function () { return DVR._cur; },
    /** Called when a channel's HLS stream is playing: start (or keep) the time-shift buffer. */
    watch: function (ch, url, hint) {
      if (!DVR.supported()) return null;
      var cfg = settings();
      if (DVR._cur && DVR._cur.chId === ch.id && DVR._cur.url === url && !DVR._cur.stopped) return DVR._cur;
      DVR.leave();
      if (cfg.ringMin <= 0) { DVR._pendingWatch = { ch: ch, url: url, hint: hint }; return null; }
      DVR._pendingWatch = { ch: ch, url: url, hint: hint };
      var s = new Session(ch, url, hint, Math.max(60, cfg.ringMin * 60));
      DVR._cur = s;
      s.start();
      return s;
    },
    leave: function () {
      var s = DVR._cur;
      DVR._cur = null;
      DVR._pendingWatch = null;
      if (!s) return;
      if (s.rec) { s.detached = true; s.ringSec = 20; DVR._detached.push(s); }   // a recording keeps going
      else s.stop();
      Bus.emit('dvr');
    },

    /* --- recording --- */
    isRecording: function (chId) {
      return DVR._active().some(function (s) { return s.rec && (!chId || s.chId === chId); });
    },
    activeRec: function () { var s = DVR._active().filter(function (x) { return x.rec; })[0]; return s ? s.rec : null; },

    /**
     * Start recording the channel being watched.
     * @param {{title:string, endAt:number|null, fromWall:number|null}} opts
     */
    startRecording: function (opts) {
      var s = DVR._cur;
      if (!s && DVR._pendingWatch) {          // timeshift off: start a minimal session now
        var w = DVR._pendingWatch;
        s = DVR._cur = new Session(w.ch, w.url, w.hint, 60);
        s.start();
      }
      if (!s || s.rec) return null;
      var rec = { id: newId('', 0), chId: s.chId, chName: s.chName, title: opts.title || s.chName, startWall: Date.now(), endWall: null,
        status: 'recording', segs: [], count: 0, bytes: 0, init: null, createdAt: Date.now(), lastPos: 0, endAt: opts.endAt || null };
      rec.id = newId('', 0);
      var from = opts.fromWall;
      var copied = {};
      var step = function () {
        // copy buffered segments from the programme start, then switch capture to the recording
        var pending = from ? s.segs.filter(function (m) { return !m.rec && !copied[m.i] && m.wall + m.dur * 1000 > from; }) : [];
        if (!pending.length) {
          if (s.stopped) return Promise.resolve();
          s.rec = rec;
          if (s.initKey && !rec.init) {
            var ik = 'r' + rec.id + ':init';
            return getSeg(s.initKey).then(function (r) { return r && r.blob ? putSeg(ik, r.blob).then(function () { rec.init = ik; }) : null; }).then(function () {
              DVR._persist(rec); DVR._publish(); Bus.emit('dvr');
            });
          }
          DVR._persist(rec); DVR._publish(); Bus.emit('dvr');
          return Promise.resolve();
        }
        var m = pending[0];
        copied[m.i] = true;
        return getSeg(m.k).then(function (r) {
          if (!r || !r.blob) return;
          var k = 'r' + rec.id + ':' + rec.count++;
          return putSeg(k, r.blob).then(function () {
            rec.segs.push({ i: m.i, k: k, dur: m.dur, disc: m.disc, wall: m.wall, sn: m.sn, bytes: m.bytes, rec: rec.id });
            rec.bytes += m.bytes;
            if (rec.segs.length === 1) rec.startWall = m.wall;
          });
        }).then(step);
      };
      // reserve immediately so the UI shows "recording" right away
      s._recPending = rec;
      var ok = step();
      rec._ready = ok;
      if (rec.endAt) {
        rec._timer = Tick.after(function () { DVR.stopRecording('end'); }, Math.max(1000, rec.endAt - Date.now()));
      }
      rec._cap = Tick.after(function () { DVR.stopRecording('limit'); }, MAX_REC_MS);
      DVR._pendingRec = rec;
      return rec;
    },
    stopRecording: function (why) {
      var s = DVR._active().filter(function (x) { return x.rec || x._recPending; })[0];
      if (!s) return false;
      var rec = s.rec || s._recPending;
      if (!s.rec) { s.rec = rec; }       // still copying the buffered part: finish with what exists
      DVR._finishRec(s, why || 'stopped');
      return true;
    },
    _finishRec: function (s, why) {
      var rec = s.rec;
      if (!rec) return;
      Tick.cancel(rec._timer); Tick.cancel(rec._cap);
      s.rec = null; s._recPending = null;
      // keep the segments that belong to this recording; later ring segments are plain buffer again
      rec.status = rec.segs.length ? 'done' : 'error';
      rec.endWall = Date.now();
      rec.error = rec.segs.length ? (why === 'storage' || why === 'network' || why === 'encrypted' ? why : null) : (why || 'empty');
      DVR._persist(rec, true);
      if (s.detached) { s.stop(); DVR._detached = DVR._detached.filter(function (x) { return x !== s; }); }
      DVR._rows = DVR._rows.filter(function (r) { return r.id !== rec.id; });
      DVR._rows.push(DVR._rowOf(rec));
      DVR._publish();
      Bus.emit('dvr-rec-done', { id: rec.id, why: why, status: rec.status });
      Bus.emit('dvr');
    },
    _persist: function (rec, final) {
      var row = DVR._rowOf(rec);
      var plain = { id: row.id, chId: row.chId, chName: row.chName, title: row.title, startWall: row.startWall, endWall: row.endWall,
        status: row.status, bytes: row.bytes, createdAt: row.createdAt, lastPos: row.lastPos, init: row.init, error: row.error,
        segs: rec.segs.map(function (m) { return { i: m.i, k: m.k, dur: m.dur, disc: m.disc, wall: m.wall, sn: m.sn, bytes: m.bytes, rec: m.rec }; }) };
      return putRec(plain).catch(function () { /* ignore */ });
    },
    /** Stop a recording when the device storage is nearly full. */
    _guard: function (s) {
      if (!s.rec || !root.navigator || !navigator.storage || !navigator.storage.estimate) return;
      var now = Date.now();
      if (now - (s._lastGuard || 0) < 15000) return;
      s._lastGuard = now;
      navigator.storage.estimate().then(function (e) {
        if (e && e.quota && e.usage / e.quota > QUOTA_STOP && s.rec) DVR._finishRec(s, 'storage');
      }, function () { /* ignore */ });
    },
    remove: function (id) {
      var row = DVR.getRec(id);
      if (!row) return Promise.resolve();
      var live = DVR._active().filter(function (s) { return s.rec && s.rec.id === id; })[0];
      if (live) DVR._finishRec(live, 'stopped');
      var keys = (row.segs || []).map(function (m) { return m.k; });
      if (row.init) keys.push(row.init);
      DVR._rows = DVR._rows.filter(function (r) { return r.id !== id; });
      DVR._publish();
      return delSegs(keys).then(function () { return delRec(id); }).catch(function () { /* ignore */ });
    },
    saveProgress: function (id, pos) {
      var r = DVR._rows.filter(function (x) { return x.id === id; })[0];
      if (!r) return;
      r.lastPos = pos;
      var plain = Object.assign({}, r);
      putRec(plain).catch(function () { /* ignore */ });
    },
    usage: function () {
      var bytes = 0;
      DVR.state.get().forEach(function (r) { bytes += r.bytes || 0; });
      return (navigator.storage && navigator.storage.estimate ? navigator.storage.estimate() : Promise.resolve(null)).then(function (e) {
        return { recBytes: bytes, quota: e && e.quota || 0, usage: e && e.usage || 0 };
      }, function () { return { recBytes: bytes, quota: 0, usage: 0 }; });
    },

    /* --- playback sources --- */
    handleForSession: function (s) {
      var id = newId('h');
      plays[id] = { text: function () { return playlistText(s.segs.slice(), s.initKey, false); } };
      return { id: id, url: 'indtv-dvr://pl/' + id };
    },
    handleForRec: function (row) {
      var id = newId('h');
      var live = DVR._active().filter(function (s) { return s.rec && s.rec.id === row.id; })[0];
      plays[id] = { text: function () {
        var segs = live ? live.rec.segs.slice() : row.segs.slice();
        return playlistText(segs, row.init || (live && live.rec.init), !live);
      } };
      return { id: id, url: 'indtv-dvr://pl/' + id };
    },
    release: function (h) { if (h) delete plays[h.id]; },
    liveRec: function (id) { var s = DVR._active().filter(function (x) { return x.rec && x.rec.id === id; })[0]; return s ? s.rec : null; },

    /** Pure helpers (also used by tests). */
    _parsePlaylist: parsePlaylist, _playlistText: playlistText
  };

  INDTV.DVR = DVR;
})(typeof window !== 'undefined' ? window : globalThis);
