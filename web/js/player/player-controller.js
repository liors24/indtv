/* INDTV — PlayerController: the single owner of playback.
 * Owns current item, current source, phase, errors and source fallback.
 * Every async step carries a request token; anything from an older request is dropped,
 * so the screen can never show channel B while channel A's audio keeps playing. */
(function (root) {
  'use strict';
  var INDTV = root.INDTV = root.INDTV || {};
  var Bus = INDTV.Bus;

  var DASH_SRC = 'https://cdn.jsdelivr.net/npm/dashjs@4.7.4/dist/dash.all.min.js';
  var START_TIMEOUT = 20000;

  function typeOf(url) {
    var path = url.split('?')[0].split('#')[0].toLowerCase();
    if (/\.mpd$/.test(path)) return 'dash';
    if (/\.(mp4|m4v|webm|ogv|mov|mp3|aac|m4a|ogg|opus|wav)$/.test(path)) return 'progressive';
    return 'hls'; // .m3u8, .m3u8-like paths and extensionless live URLs
  }

  var dashLoading = null;
  function loadDash() {
    if (root.dashjs) return Promise.resolve(root.dashjs);
    if (dashLoading) return dashLoading;
    dashLoading = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = DASH_SRC;
      s.async = true;
      s.onload = function () { root.dashjs ? resolve(root.dashjs) : reject(new Error('dash')); };
      s.onerror = function () { dashLoading = null; reject(new Error('dash')); };
      document.head.appendChild(s);
    });
    return dashLoading;
  }

  function qualityLabel(height) {
    if (!height) return null;
    if (height >= 2000) return '4K';
    if (height >= 1000) return 'FHD';
    if (height >= 700) return 'HD';
    return 'SD';
  }

  /* ---------- best-source selection ----------
   * Probes every stream of a channel in parallel (manifest only, ~3 s budget) and orders them by:
   * answers → highest resolution → highest bitrate → fastest answer. Results are cached for 20 min.
   * Sources that fail later still fall through to the next one. */
  var Ranker = {
    cache: {},
    TTL: 20 * 60000,
    probe: function (src) {
      var started = Date.now();
      var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 3200);
      return fetch(src.url, { signal: ctrl ? ctrl.signal : undefined, credentials: 'omit', cache: 'no-store' }).then(function (r) {
        if (!r.ok) return { src: src, state: 'failed' };
        return r.text().then(function (txt) {
          clearTimeout(timer);
          var ms = Date.now() - started;
          if (txt.slice(0, 200).indexOf('#EXTM3U') < 0 && typeOf(src.url) === 'hls') return { src: src, state: 'failed' };
          var height = 0, bw = 0, m;
          var re = /RESOLUTION=\d+x(\d+)/g;
          while ((m = re.exec(txt))) height = Math.max(height, +m[1]);
          var rb = /[^-]BANDWIDTH=(\d+)/g;
          while ((m = rb.exec(txt))) bw = Math.max(bw, +m[1]);
          if (!height && src.quality) height = parseInt(src.quality, 10) || 0;
          return { src: src, state: 'ok', height: height, bw: bw, ms: ms };
        });
      }).catch(function () {
        clearTimeout(timer);
        // In a browser a CORS refusal looks like a network error; that is "unknown", not "dead".
        return { src: src, state: root.INDTVNative ? 'failed' : 'unknown', height: parseInt(src.quality, 10) || 0 };
      });
    },
    rank: function (channel, sources) {
      var hit = Ranker.cache[channel.id];
      if (hit && Date.now() - hit.at < Ranker.TTL) {
        var byId = {};
        sources.forEach(function (s) { byId[s.id] = s; });
        var ordered = hit.order.map(function (id) { return byId[id]; }).filter(Boolean);
        sources.forEach(function (s) { if (ordered.indexOf(s) < 0) ordered.push(s); });
        return Promise.resolve({ sources: ordered, bestLabel: hit.bestLabel });
      }
      var candidates = sources.filter(function (s) { return !s.insecure; }).slice(0, 8);
      var rest = sources.filter(function (s) { return candidates.indexOf(s) < 0; });
      return Promise.all(candidates.map(Ranker.probe)).then(function (results) {
        function score(r) {
          if (r.state === 'failed') return -1e9 + (r.src.priority ? -r.src.priority : 0);
          var base = r.state === 'ok' ? 1e8 : 5e7;
          return base + (r.height || 0) * 1e4 + Math.min(r.bw || 0, 2e7) / 1e4 - (r.ms || 1500) + (r.src.preferred ? 500 : 0);
        }
        results.sort(function (a, b) { return score(b) - score(a) || (a.src.priority - b.src.priority); });
        var ordered = results.map(function (r) { return r.src; }).concat(rest);
        var top = results[0];
        var bestLabel = top && top.state === 'ok' ? qualityLabel(top.height) : null;
        Ranker.cache[channel.id] = { at: Date.now(), order: ordered.map(function (s) { return s.id; }), bestLabel: bestLabel };
        return { sources: ordered, bestLabel: bestLabel };
      });
    }
  };

  var P = {
    video: null,
    token: 0,
    hls: null,
    dash: null,
    _watchdog: null,
    _ctx: null,
    _lastProgressSave: 0,
    state: new INDTV.StateFlow({
      phase: 'idle', item: null, kind: null, sourceIndex: 0, sourceCount: 0, sourceName: null,
      error: null, insecureSkipped: 0, quality: null, muted: false, paused: false, canSeek: false,
      currentTime: 0, duration: 0
    }),

    init: function (video) {
      P.video = video;
      video.setAttribute('playsinline', '');
      video.setAttribute('webkit-playsinline', '');
      video.preload = 'auto';
      // In the app every stream is fetched by the native layer with CORS headers, so the picture/sound
      // stay readable for features like live translation.
      if (root.INDTVNative) video.crossOrigin = 'anonymous';
      video.addEventListener('playing', function () { P._onPlaying(P.token); });
      video.addEventListener('pause', function () { if (P.state.get().phase === 'playing') P.state.update({ paused: true }); });
      video.addEventListener('play', function () { P.state.update({ paused: false }); });
      video.addEventListener('waiting', function () { if (P.state.get().phase === 'playing') P.state.update({ buffering: true }); });
      video.addEventListener('canplay', function () { P.state.update({ buffering: false }); });
      video.addEventListener('volumechange', function () { P.state.update({ muted: video.muted }); });
      video.addEventListener('timeupdate', P._onTime);
      video.addEventListener('error', function () {
        if (P._native && P._nativeToken === P.token) P._fail(P._nativeToken, 'media');
      });
    },

    /**
     * Open a channel or VOD item. Cancels whatever was opening or playing before.
     * @param {{kind:'channel'|'vod', id:string}} ref
     * @param {{list?:string[]}} ctx   ids for previous / next channel
     */
    open: function (ref, ctx) {
      var token = ++P.token;              // 1. cancel previous open request
      P._teardown();                       // 2. stop / release previous media
      var item = ref.kind === 'vod' ? INDTV.VodRepository.find(ref.id) : INDTV.ChannelRepository.get(ref.id); // 3. resolve
      if (!item) {
        P.state.set(Object.assign({}, P.state.get(), { phase: 'error', error: 'missing', item: null, kind: ref.kind }));
        return token;
      }
      if (ctx && ctx.list) P._ctx = { list: ctx.list.slice(), kind: ref.kind };
      else if (!P._ctx || P._ctx.list.indexOf(ref.id) < 0) P._ctx = { list: [ref.id], kind: ref.kind };

      var sources;
      if (ref.kind === 'vod') {
        sources = [{ id: 'v' + INDTV.Util.hash(item.url), url: item.url, sourceName: 'VOD', priority: 1 }];
      } else {
        INDTV.RecentRepository.record(item.id);
        // Recently failed sources go last; each source is tried at most once per open.
        sources = item.sources.filter(function (s) { return !INDTV.StreamHealth.recentlyFailed(s.id); })
          .concat(item.sources.filter(function (s) { return INDTV.StreamHealth.recentlyFailed(s.id); }));
      }
      P._sources = sources;
      P.state.set({                        // 4. selected item is now B everywhere
        phase: 'loading', item: item, kind: ref.kind, sourceIndex: 0, sourceCount: sources.length,
        sourceName: null, error: null, insecureSkipped: 0, quality: null,
        muted: P.video.muted, paused: false, canSeek: ref.kind === 'vod', currentTime: 0, duration: 0, buffering: false
      });
      Bus.emit('player-open', { kind: ref.kind, id: item.id });
      if (ref.kind === 'channel' && sources.length > 1) {
        // Several streams carry this channel: measure them and start with the best one.
        P.state.update({ checking: true });
        Ranker.rank(item, sources).then(function (ranked) {
          if (token !== P.token) return;        // user already moved on
          P._sources = ranked.sources;
          P.state.update({ checking: false, sourceCount: ranked.sources.length, quality: ranked.bestLabel || P.state.get().quality });
          P._attempt(token, 0);
        });
      } else {
        P._attempt(token, 0);                  // 5–6. prepare and autoplay B
      }
      return token;
    },

    _attempt: function (token, idx) {
      if (token !== P.token) return;
      var sources = P._sources;
      if (idx >= sources.length) {
        P._teardown();
        P.state.update({ phase: 'error', error: 'all_failed' });
        return;
      }
      var src = sources[idx];
      if (src.insecure) {
        // The browser would block it (mixed content). Skip without a network attempt.
        P.state.update({ insecureSkipped: P.state.get().insecureSkipped + 1 });
        return P._attempt(token, idx + 1);
      }
      P._teardown();
      P._srcIndex = idx;
      if (root.INDTVNative && root.INDTVNative.setStreamHeaders) {
        try { root.INDTVNative.setStreamHeaders(src.url, src.userAgent || '', src.referrer || ''); } catch (e) { /* ignore */ }
      }
      P._triedNative = false;
      P.state.update({ phase: 'loading', sourceIndex: idx, sourceName: src.sourceName, error: null, buffering: false });
      clearTimeout(P._watchdog);
      P._watchdog = setTimeout(function () { P._fail(token, 'timeout'); }, START_TIMEOUT);

      var kind = typeOf(src.url);
      if (kind === 'dash') {
        loadDash().then(function (dashjs) {
          if (token !== P.token) return;
          var player = dashjs.MediaPlayer().create();
          P.dash = player;
          player.updateSettings({ streaming: { abr: { autoSwitchBitrate: { video: true } } } });
          player.on('error', function () { if (P.dash === player) P._fail(token, 'dash'); });
          player.initialize(P.video, src.url, true);
        }, function () { P._fail(token, 'dash_unavailable'); });
        return;
      }
      if (kind === 'hls' && root.Hls && root.Hls.isSupported()) {
        P._startHls(token, src);
        return;
      }
      P._startNative(token, src);
    },

    _startHls: function (token, src) {
      var Hls = root.Hls;
      var hls = new Hls({
        enableWorker: true, lowLatencyMode: false, backBufferLength: 30, capLevelToPlayerSize: false,
        abrEwmaDefaultEstimate: 6000000, startFragPrefetch: true,
        manifestLoadingTimeOut: 12000, manifestLoadingMaxRetry: 1, levelLoadingTimeOut: 12000, fragLoadingTimeOut: 20000
      });
      P.hls = hls;
      var recovered = { media: false, network: false };
      hls.on(Hls.Events.ERROR, function (evt, data) {
        if (P.hls !== hls || token !== P.token || !data || !data.fatal) return;
        var playing = P.state.get().phase === 'playing';
        if (playing && data.type === Hls.ErrorTypes.MEDIA_ERROR && !recovered.media) {
          recovered.media = true; hls.recoverMediaError(); return;
        }
        if (playing && data.type === Hls.ErrorTypes.NETWORK_ERROR && !recovered.network) {
          recovered.network = true; hls.startLoad(); return;
        }
        // Manifest blocked (often CORS): the TV's native player may still accept it.
        if (!playing && !P._triedNative && P.video.canPlayType('application/vnd.apple.mpegurl')) {
          P._triedNative = true;
          P._destroyEngines();
          P._startNative(token, src);
          return;
        }
        P._fail(token, data.details || 'hls');
      });
      hls.on(Hls.Events.LEVEL_SWITCHED, function (e, data) {
        if (P.hls !== hls) return;
        var lvl = hls.levels && hls.levels[data.level];
        if (lvl && lvl.height) P.state.update({ quality: qualityLabel(lvl.height) });
      });
      hls.on(Hls.Events.MANIFEST_PARSED, function () {
        if (P.hls !== hls || token !== P.token) return;
        P._play(token);
      });
      hls.attachMedia(P.video);
      hls.loadSource(src.url);
    },

    _startNative: function (token, src) {
      P._native = true;
      P._nativeToken = token;
      P.video.src = src.url;
      P.video.load();
      P._play(token);
    },

    _play: function (token) {
      var pr;
      try { pr = P.video.play(); } catch (e) { pr = null; }
      if (pr && pr.catch) {
        pr.catch(function (err) {
          if (token !== P.token) return;
          if (err && err.name === 'NotAllowedError' && !P.video.muted) {
            // Autoplay policy: start muted rather than not at all; the OSD offers Unmute.
            P.video.muted = true;
            P.video.play().catch(function () { /* watchdog handles it */ });
          }
        });
      }
    },

    _onPlaying: function (token) {
      if (token !== P.token) return;
      var st = P.state.get();
      if (st.phase !== 'loading' && st.phase !== 'playing') return;
      clearTimeout(P._watchdog);
      var src = P._sources[P._srcIndex];
      if (st.kind === 'channel' && st.item && src) INDTV.StreamHealth.markWorking(st.item.id, src.id);
      var q = qualityLabel(P.video.videoHeight) || st.quality;
      var canSeek = st.kind === 'vod' || (P.video.seekable && P.video.seekable.length > 0 &&
        (P.video.seekable.end(0) - P.video.seekable.start(0)) > 30);
      P.state.update({ phase: 'playing', error: null, quality: q, paused: false, buffering: false, canSeek: canSeek });
      if (st.kind === 'vod' && !P._resumed) {
        P._resumed = true;
        var prog = INDTV.VodRepository.progressFor(st.item.id);
        if (prog && prog.position > 10 && prog.position < prog.duration - 30) {
          try { P.video.currentTime = prog.position; } catch (e) { /* ignore */ }
        }
      }
    },

    _onTime: function () {
      var st = P.state.get();
      if (st.phase !== 'playing') return;
      var now = Date.now();
      if (now - P._lastTick < 500) return;
      P._lastTick = now;
      P.state.update({ currentTime: P.video.currentTime, duration: P.video.duration });
      if (st.kind === 'vod' && now - P._lastProgressSave > 5000) {
        P._lastProgressSave = now;
        INDTV.VodRepository.saveProgress(st.item.id, P.video.currentTime, P.video.duration);
      }
    },
    _lastTick: 0,

    _fail: function (token, reason) {
      if (token !== P.token) return;
      clearTimeout(P._watchdog);
      var src = P._sources && P._sources[P._srcIndex];
      if (src && P.state.get().kind === 'channel') INDTV.StreamHealth.markFailed(src.id);
      if (root.console) console.warn('[INDTV player] source failed:', reason, src ? INDTV.Util.redactUrl(src.url) : '');
      P._attempt(token, P._srcIndex + 1);   // next source, never wraps around
    },

    _destroyEngines: function () {
      if (P.hls) { try { P.hls.destroy(); } catch (e) { /* ignore */ } P.hls = null; }
      if (P.dash) { try { P.dash.reset(); } catch (e) { /* ignore */ } P.dash = null; }
      P._native = false;
    },

    _teardown: function () {
      clearTimeout(P._watchdog);
      var st = P.state.get();
      if (st.kind === 'vod' && st.item && P.video && isFinite(P.video.duration)) {
        INDTV.VodRepository.saveProgress(st.item.id, P.video.currentTime, P.video.duration);
      }
      P._destroyEngines();
      P._resumed = false;
      if (P.video) {
        try { P.video.pause(); } catch (e) { /* ignore */ }
        P.video.removeAttribute('src');
        try { P.video.load(); } catch (e) { /* ignore */ }
      }
    },

    /** Stop and release everything (Player closed or Stop pressed). */
    stop: function () {
      P.token++;
      P._teardown();
      P.state.update({ phase: 'stopped', buffering: false });
    },

    close: function () {
      P.token++;
      P._teardown();
      P.state.set(Object.assign({}, P.state.get(), { phase: 'idle', item: null, kind: null }));
    },

    togglePlay: function () {
      var st = P.state.get();
      if (st.phase === 'stopped' || st.phase === 'error') {
        if (st.item) P.open({ kind: st.kind, id: st.item.id });
        return;
      }
      if (P.video.paused) P._play(P.token); else P.video.pause();
    },
    toggleMute: function () { P.video.muted = !P.video.muted; P.state.update({ muted: P.video.muted }); },
    seekBy: function (sec) {
      var v = P.video;
      try {
        if (P.state.get().kind === 'vod' && isFinite(v.duration)) {
          v.currentTime = Math.max(0, Math.min(v.duration - 1, v.currentTime + sec));
          return true;
        }
        if (v.seekable && v.seekable.length) {
          var start = v.seekable.start(0), end = v.seekable.end(0);
          v.currentTime = Math.max(start, Math.min(end - 2, v.currentTime + sec));
          return true;
        }
      } catch (e) { /* ignore */ }
      return false;
    },
    step: function (delta) {
      var st = P.state.get();
      if (!P._ctx || !st.item) return;
      var list = P._ctx.list;
      if (list.length < 2) return;
      var i = list.indexOf(st.item.id);
      var next = list[(i + delta + list.length) % list.length];
      P.open({ kind: P._ctx.kind, id: next });
    },
    hasNeighbours: function () { return !!(P._ctx && P._ctx.list.length > 1); }
  };

  INDTV.Player = P;
  INDTV._ranker = Ranker;
  INDTV._playerTypeOf = typeOf;
})(typeof window !== 'undefined' ? window : globalThis);
