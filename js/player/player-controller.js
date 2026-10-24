/* INDTV — PlayerController: the single owner of playback.
 * Owns current item, current source, phase, errors and source fallback.
 * Every async step carries a request token; anything from an older request is dropped,
 * so the screen can never show channel B while channel A's audio keeps playing. */
(function (root) {
  'use strict';
  var INDTV = root.INDTV = root.INDTV || {};
  var Bus = INDTV.Bus;

  var DASH_SRC = 'https://cdn.jsdelivr.net/npm/dashjs@4.7.4/dist/dash.all.min.js';
  var START_TIMEOUT = 13000;
  var EXO_TIMEOUT = 15000;
  /** The TV's own video engine (Android app only): plays what the web player cannot. */
  var Exo = { available: function () { try { return !!(root.INDTVNative && root.INDTVNative.hasExo && root.INDTVNative.hasExo()); } catch (e) { return false; } } };

  function typeOf(url) {
    var path = url.split('?')[0].split('#')[0].toLowerCase();
    if (/\.mpd$/.test(path)) return 'dash';
    if (/\.ts$/.test(path) || /[?&](extension|output)=ts\b/i.test(url)) return 'ts';
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
        if (typeOf(src.url) !== 'hls') {
          // a continuous stream (MPEG-TS, MP4): answering is enough, do not download it
          clearTimeout(timer);
          if (ctrl) ctrl.abort();
          return { src: src, state: 'ok', height: parseInt(src.quality, 10) || 0, ms: Date.now() - started };
        }
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
      function score(r) {
        if (r.state === 'failed') return -1e9 + (r.src.priority ? -r.src.priority : 0);
        var base = r.state === 'ok' ? 1e8 : 5e7;
        return base + (r.height || 0) * 1e4 + Math.min(r.bw || 0, 2e7) / 1e4 - (r.ms || 1500) + (r.src.preferred ? 500 : 0) + (INDTV.StreamHealth.worked(r.src.id) ? 3e7 : 0);
      }
      function finish(results, rest) {
        results.sort(function (a, b) { return score(b) - score(a) || (a.src.priority - b.src.priority); });
        results.forEach(function (r) { r.src._probe = r.state; });
        var ordered = results.map(function (r) { return r.src; }).concat(rest);
        var top = results[0];
        var bestLabel = top && top.state === 'ok' ? qualityLabel(top.height) : null;
        Ranker.cache[channel.id] = { at: Date.now(), order: ordered.map(function (s) { return s.id; }), bestLabel: bestLabel };
        return { sources: ordered, bestLabel: bestLabel };
      }
      // 1. the background scan already knows every stream: order instantly, no waiting
      var Scan = INDTV.StreamScan;
      var known = Scan ? sources.map(function (s) { return Scan.result(s); }) : [];
      if (known.length && known.every(Boolean)) return Promise.resolve(finish(known, []));
      // 2. otherwise probe in parallel, but never wait more than ~1.6 s: late answers count as unknown
      var candidates = sources.filter(function (s) { return !s.insecure; }).slice(0, 10);
      var rest = sources.filter(function (s) { return candidates.indexOf(s) < 0; });
      return new Promise(function (resolve) {
        var results = candidates.map(function (s) { return { src: s, state: 'unknown', height: parseInt(s.quality, 10) || 0 }; });
        var left = candidates.length, done = false;
        function end() { if (done) return; done = true; resolve(finish(results.slice(), rest)); }
        var limit = setTimeout(end, 1600);
        candidates.forEach(function (s, i) {
          Ranker.probe(s).then(function (r) {
            results[i] = r;
            if (Scan) Scan.store(s, r);
            if (--left === 0) { clearTimeout(limit); end(); }
          });
        });
        if (!left) end();
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
      currentTime: 0, duration: 0,
      // DVR (time-shift + recording)
      shift: false, behind: 0, buf: 0, dvrOn: false, dvrErr: null, recording: false, recSec: 0, progOk: false, recId: null
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
      P._leaveShift();
      if (INDTV.DVR) INDTV.DVR.leave();   // the time-shift buffer belongs to the channel being watched
      var recRow = ref.kind === 'rec' && INDTV.DVR ? INDTV.DVR.getRec(ref.id) : null;
      var item = ref.kind === 'rec' ? (recRow ? { id: recRow.id, title: recRow.title, chName: recRow.chName, name: recRow.title } : null)
        : ref.kind === 'vod' ? INDTV.VodRepository.find(ref.id) : INDTV.ChannelRepository.get(ref.id); // 3. resolve
      if (!item) {
        P.state.set(Object.assign({}, P.state.get(), { phase: 'error', error: 'missing', item: null, kind: ref.kind }));
        return token;
      }
      if (ctx && ctx.list) P._ctx = { list: ctx.list.slice(), kind: ref.kind };
      else if (!P._ctx || P._ctx.list.indexOf(ref.id) < 0) P._ctx = { list: [ref.id], kind: ref.kind };

      var sources;
      if (ref.kind === 'rec') {
        sources = [{ id: 'rec' + item.id, url: 'indtv-dvr://rec/' + item.id, sourceName: 'REC', priority: 1, dvrRec: recRow }];
      } else if (ref.kind === 'vod') {
        sources = [{ id: 'v' + INDTV.Util.hash(item.url), url: item.url, sourceName: 'VOD', priority: 1 }];
      } else {
        INDTV.RecentRepository.record(item.id);
        // Recently failed sources go last; each source is tried at most once per open.
        sources = item.sources.filter(function (s) { return !INDTV.StreamHealth.recentlyFailed(s.id); })
          .concat(item.sources.filter(function (s) { return INDTV.StreamHealth.recentlyFailed(s.id); }));
      }
      P._sources = sources;
      P._tried = {};
      P._exoRetried = false;
      P.state.set({                        // 4. selected item is now B everywhere
        phase: 'loading', item: item, kind: ref.kind, sourceIndex: 0, sourceCount: sources.length,
        sourceName: null, error: null, insecureSkipped: 0, quality: null,
        muted: P.video.muted, paused: false, canSeek: ref.kind === 'vod' || ref.kind === 'rec', currentTime: 0, duration: 0, buffering: false,
        shift: false, behind: 0, buf: 0, dvrOn: false, dvrErr: null, recording: false, recSec: 0, progOk: false, recId: null
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

      if (src.dvrRec) {
        if (!(root.Hls && root.Hls.isSupported())) { P._fail(token, 'rec_unsupported'); return; }
        var row = INDTV.DVR.getRec(src.dvrRec.id) || src.dvrRec;
        var h = INDTV.DVR.handleForRec(row);
        P._handle = h;
        var resume = row.lastPos > 10 && row.dur && row.lastPos < row.dur - 20 && row.status !== 'recording' ? row.lastPos : 0;
        P._startHls(token, src, { handle: h, start: resume, rec: true });
        return;
      }
      var kind = typeOf(src.url);
      var tried = P._tried[idx] = P._tried[idx] || {};
      if (Exo.available() && !tried.exo && (kind === 'ts' || kind === 'progressive' || INDTV.StreamHealth.engine(src.id) === 'exo')) {
        P._startExo(token, src);
        return;
      }
      tried.web = true;
      P._attemptWeb(token, src);
    },

    /** The page's own player: hls.js for HLS, dash.js for DASH, the browser for the rest. */
    _attemptWeb: function (token, src) {
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

    /** The TV's own engine (ExoPlayer, Android app): draws behind the transparent page. */
    _startExo: function (token, src) {
      var idx = P._srcIndex;
      P._tried[idx] = P._tried[idx] || {};
      P._tried[idx].exo = true;
      P._destroyEngines();
      try { P.video.pause(); P.video.removeAttribute('src'); P.video.load(); } catch (e) { /* ignore */ }
      P._exo = true; P._exoToken = token; P._exoH = 0; P._exoTracks = [];
      document.documentElement.classList.add('exo-on');
      clearTimeout(P._watchdog);
      P._watchdog = setTimeout(function () { P._fail(token, 'exo_timeout'); }, EXO_TIMEOUT);
      var pic = INDTV.Picture ? INDTV.Picture.current() : { aspect: 'fit', q: 0 };
      try {
        root.INDTVNative.exoPlay(src.url, src.userAgent || '', src.referrer || '', pic.q || 0);
        root.INDTVNative.exoAspect(pic.aspect || 'fit');
        if (P.state.get().muted) root.INDTVNative.exoMute(true);
      } catch (e) { P._exo = false; P._fail(token, 'exo_bridge'); }
    },
    /** Events from the TV engine: playing, buffering, paused, size, tracks, error, ended. */
    _exoEvent: function (type, a, b) {
      var token = P._exoToken;
      if (!P._exo || token !== P.token) return;
      if (type === 'playing') { P._onPlaying(token); return; }
      if (type === 'buffering') { if (P.state.get().phase === 'playing') P.state.update({ buffering: a === '1' }); return; }
      if (type === 'paused') { if (P.state.get().phase === 'playing') P.state.update({ paused: a === '1' }); return; }
      if (type === 'size') { P._exoH = parseInt(b, 10) || 0; if (P.state.get().phase === 'playing') P.state.update({ quality: qualityLabel(P._exoH) }); return; }
      if (type === 'tracks') { P._exoTracks = a ? a.split(',').map(Number).filter(Boolean) : []; Bus.emit('player-tracks'); return; }
      if (type === 'error') {
        if (root.console) console.warn('[INDTV player] TV engine error:', a);
        if (b === '1' && !P._exoRetried) { P._exoRetried = true; P._startExo(token, P._sources[P._srcIndex]); return; }   // dropped while playing: reconnect once
        P._fail(token, 'exo:' + a);
        return;
      }
      if (type === 'ended' && P.state.get().kind === 'channel') P._fail(token, 'ended');
    },

    _startHls: function (token, src, opts) {
      var Hls = root.Hls;
      opts = opts || {};
      var extra = {};
      if (opts.handle) {
        // Played from the device (time-shift buffer or a recording) through the DVR loader.
        extra = { loader: INDTV.DVR.Loader, liveMaxLatencyDurationCount: Infinity, liveSyncDurationCount: 3, startPosition: opts.start || 0,
          backBufferLength: Infinity, fragLoadingMaxRetry: 1, manifestLoadingMaxRetry: 1, levelLoadingMaxRetry: 1, startFragPrefetch: false };
      }
      var hls = new Hls(Object.assign({
        // Smooth, clean sound first: a deeper buffer behind the live edge, gentle quality switching,
        // and A/V alignment fixes for streams whose audio and video segments differ slightly.
        enableWorker: true, lowLatencyMode: false,
        liveSyncDurationCount: 4, liveMaxLatencyDurationCount: 12, maxLiveSyncPlaybackRate: 1,
        maxBufferLength: 40, maxMaxBufferLength: 90, backBufferLength: 30, maxBufferHole: 0.7,
        stretchShortVideoTrack: true, maxAudioFramesDrift: 4, forceKeyFrameOnDiscontinuity: true,
        nudgeMaxRetry: 6, highBufferWatchdogPeriod: 3,
        capLevelToPlayerSize: true, abrEwmaDefaultEstimate: 2500000, abrBandWidthUpFactor: 0.6,
        startFragPrefetch: true, testBandwidth: true,
        manifestLoadingTimeOut: 12000, manifestLoadingMaxRetry: 1, levelLoadingTimeOut: 12000, fragLoadingTimeOut: 20000,
        fragLoadingMaxRetry: 4, levelLoadingMaxRetry: 3
      }, extra));
      P.hls = hls;
      hls.on(Hls.Events.FRAG_CHANGED, function (e, d) {
        if (P.hls === hls && d && d.frag) P._playFrag = { sn: d.frag.sn, start: d.frag.start, dur: d.frag.duration };
      });
      var recovered = { media: false, network: false };
      hls.on(Hls.Events.ERROR, function (evt, data) {
        if (P.hls !== hls || token !== P.token || !data || !data.fatal) return;
        if (opts.handle) {
          if (opts.rec) { P._fail(token, 'rec_play'); return; }
          // the buffered copy could not be played: go back to the real stream
          if (root.console) console.warn('[INDTV player] time-shift failed:', data.details);
          P._shiftFailed = true;
          P.goLive();
          return;
        }
        var playing = P.state.get().phase === 'playing';
        if (playing && data.type === Hls.ErrorTypes.MEDIA_ERROR && !recovered.media) {
          recovered.media = true; hls.recoverMediaError(); return;
        }
        if (playing && data.type === Hls.ErrorTypes.NETWORK_ERROR && !recovered.network) {
          recovered.network = true; hls.startLoad(); return;
        }
        // Manifest blocked (often CORS): the TV's native player may still accept it.
        if (!playing && !P._triedNative && !Exo.available() && P.video.canPlayType('application/vnd.apple.mpegurl')) {
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
      hls.loadSource(opts.handle ? opts.handle.url : src.url);
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
      if (st.kind === 'channel' && st.item && src) {
        INDTV.StreamHealth.markWorking(st.item.id, src.id);
        INDTV.StreamHealth.setEngine(src.id, P._exo ? 'exo' : 'web');
      }
      P._exoRetried = false;
      var q = qualityLabel(P._exo ? P._exoH : P.video.videoHeight) || st.quality;
      var canSeek = st.kind === 'vod' || (P.video.seekable && P.video.seekable.length > 0 &&
        (P.video.seekable.end(0) - P.video.seekable.start(0)) > 30);
      if (st.kind === 'rec' || P._shift) canSeek = true;
      if (P._exo) canSeek = false;
      P.state.update({ phase: 'playing', error: null, quality: q, paused: false, buffering: false, canSeek: canSeek });
      if (INDTV.Picture) INDTV.Picture.onStart();
      if (st.kind === 'channel' && (P.hls || P._exo) && !P._shift && INDTV.DVR && src && !P._native) {
        var lv = P.hls && P.hls.levels && P.hls.levels[P.hls.currentLevel];
        INDTV.DVR.watch(st.item, src.url, lv ? { uri: (lv.url && lv.url[0]) || lv.uri || null, height: lv.height || 0 } : {});
        P._syncDvr();
      }
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
      if (st.kind === 'channel') P._syncDvr();
      if (st.kind === 'rec' && now - P._lastProgressSave > 5000) {
        P._lastProgressSave = now;
        INDTV.DVR.saveProgress(st.item.id, P.video.currentTime);
      }
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
      var tried = (P._tried && P._tried[P._srcIndex]) || {};
      if (src && !src.dvrRec && !P._shift && src._probe !== 'failed' && P.state.get().kind !== 'rec') {
        // The same stream may still play in the other engine (the TV's own player handles more formats).
        if (!tried.exo && Exo.available()) { if (root.console) console.warn('[INDTV player] web engine failed (' + reason + '), trying the TV engine'); P._startExo(token, src); return; }
        if (!tried.web && P._exo) { P._destroyEngines(); tried.web = true; P._tried[P._srcIndex] = tried; P._attemptWeb(token, src); return; }
      }
      if (src && P.state.get().kind === 'channel') INDTV.StreamHealth.markFailed(src.id);
      if (root.console) console.warn('[INDTV player] source failed:', reason, src ? INDTV.Util.redactUrl(src.url) : '');
      P._attempt(token, P._srcIndex + 1);   // next source, never wraps around
    },

    _destroyEngines: function () {
      if (P.hls) { try { P.hls.destroy(); } catch (e) { /* ignore */ } P.hls = null; }
      if (P.dash) { try { P.dash.reset(); } catch (e) { /* ignore */ } P.dash = null; }
      P._native = false;
      P._playFrag = null;
      if (P._exo) {
        P._exo = false;
        try { root.INDTVNative.exoStop(); } catch (e) { /* ignore */ }
        document.documentElement.classList.remove('exo-on');
      }
    },

    _teardown: function () {
      clearTimeout(P._watchdog);
      var st = P.state.get();
      if (st.kind === 'vod' && st.item && P.video && isFinite(P.video.duration)) {
        INDTV.VodRepository.saveProgress(st.item.id, P.video.currentTime, P.video.duration);
      }
      if (st.kind === 'rec' && st.item && P.video && isFinite(P.video.currentTime) && INDTV.DVR) INDTV.DVR.saveProgress(st.item.id, P.video.currentTime);
      P._destroyEngines();
      if (P._handle && INDTV.DVR) { INDTV.DVR.release(P._handle); P._handle = null; }
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
      P._leaveShift();
      if (INDTV.DVR) INDTV.DVR.leave();
      P.state.update({ phase: 'stopped', buffering: false, dvrOn: false });
    },

    close: function () {
      P.token++;
      P._teardown();
      P._leaveShift();
      if (INDTV.DVR) INDTV.DVR.leave();
      P.state.set(Object.assign({}, P.state.get(), { phase: 'idle', item: null, kind: null, shift: false, dvrOn: false, recording: false }));
    },

    togglePlay: function () {
      var st = P.state.get();
      if (st.phase === 'stopped' || st.phase === 'error') {
        if (st.item) P.open({ kind: st.kind, id: st.item.id });
        return;
      }
      if (P._exo) {
        var paused = !st.paused;
        try { root.INDTVNative.exoPause(paused); } catch (e) { /* ignore */ }
        P.state.update({ paused: paused });
        return;
      }
      if (P.video.paused) P._play(P.token); else P.video.pause();
    },
    toggleMute: function () {
      P.video.muted = !P.state.get().muted;
      if (P._exo) { try { root.INDTVNative.exoMute(P.video.muted); } catch (e) { /* ignore */ } }
      P.state.update({ muted: P.video.muted });
    },
    usingTvEngine: function () { return !!P._exo; },
    seekBy: function (sec) {
      var v = P.video, kind = P.state.get().kind;
      try {
        if ((kind === 'vod' || kind === 'rec') && isFinite(v.duration) && !(kind === 'rec' && P.state.get().recording && P._isLiveRec())) {
          v.currentTime = Math.max(0, Math.min(v.duration - 1, v.currentTime + sec));
          return true;
        }
        if (kind === 'channel' && !P._shift && sec < 0 && P.shiftBack(-sec)) return true;
        if (kind === 'channel' && P._shift && v.seekable && v.seekable.length) {
          var e2 = v.seekable.end(v.seekable.length - 1);
          if (sec > 0 && v.currentTime + sec >= e2 - 8) { P.goLive(); return true; }
          v.currentTime = Math.max(v.seekable.start(0), v.currentTime + sec);
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

    /* ---------- DVR: rewind live TV, jump to programme start, back to live, record ---------- */
    _isLiveRec: function () { return !!(P._handle && P.state.get().kind === 'rec' && INDTV.DVR.liveRec(P.state.get().item.id)); },

    _segIndex: function (s) {
      var f = P._playFrag, idx = -1, i;
      if (f) for (i = 0; i < s.segs.length; i++) if ((P._shift ? s.segs[i].i : s.segs[i].sn) === f.sn) idx = i;
      return idx;
    },
    _syncDvr: function () {
      var D = INDTV.DVR, st = P.state.get();
      if (!D || st.kind !== 'channel' || !st.item) return;
      var s = D.current(), on = !!(s && !s.stopped), buf = s ? s.duration() : 0;
      var rec = D.activeRec(), recording = !!(rec && rec.chId === st.item.id);
      var recSec = 0;
      if (recording) rec.segs.forEach(function (m) { recSec += m.dur; });
      var behind = 0;
      if (P._shift && s && P._playFrag) {
        var idx = P._segIndex(s), tail = 0, i;
        if (idx >= 0) {
          for (i = idx + 1; i < s.segs.length; i++) tail += s.segs[i].dur;
          behind = tail + Math.max(0, P._playFrag.start + P._playFrag.dur - P.video.currentTime);
        } else behind = st.behind;
      }
      var progOk = false, epg = INDTV.EpgRepository.nowNext(st.item);
      if (s && s.segs.length && epg && epg.now) progOk = s.segs[0].wall <= epg.now.start + 1500;
      var next = { bufStart: s && s.segs.length ? s.segs[0].wall : 0, dvrOn: on, dvrErr: s ? s.error : null, buf: Math.round(buf), behind: Math.round(behind), recording: recording,
        recSec: Math.round(recSec), progOk: progOk, recId: recording ? rec.id : null };
      var changed = false;
      Object.keys(next).forEach(function (k) { if (st[k] !== next[k]) changed = true; });
      if (changed) P.state.update(next);
    },
    _leaveShift: function () {
      P._shift = false;
      if (P._handle && INDTV.DVR && P.state.get().kind !== 'rec') { INDTV.DVR.release(P._handle); P._handle = null; }
      if (P.state.get().shift) P.state.update({ shift: false, behind: 0 });
    },
    _enterShift: function (startSec) {
      var D = INDTV.DVR, s = D && D.current();
      if (!s || s.stopped || !s.segs.length) return false;
      var token = P.token, src = P._sources && P._sources[P._srcIndex];
      if (!src) return false;
      clearTimeout(P._watchdog);
      if (P._handle) D.release(P._handle);
      P._destroyEngines();
      P._shift = true;
      P._handle = D.handleForSession(s);
      P.state.update({ shift: true, buffering: true, canSeek: true });
      P._startHls(token, src, { handle: P._handle, start: Math.max(0, startSec) });
      return true;
    },
    /** Live → watch `sec` seconds behind the live edge (needs the time-shift buffer). */
    shiftBack: function (sec) {
      var D = INDTV.DVR, st = P.state.get(), s = D && D.current();
      if (st.kind !== 'channel' || !s || s.stopped || s.duration() < 6) return false;
      var idx = P._segIndex(s), i, before = 0;
      if (idx < 0) idx = s.segs.length - 1;
      for (i = 0; i < idx; i++) before += s.segs[i].dur;
      var f = P._playFrag, within = f ? Math.min(s.segs[idx].dur, Math.max(0, P.video.currentTime - f.start)) : 0;
      return P._enterShift(Math.max(0, before + within - sec));
    },
    goLive: function () {
      if (!P._shift) return false;
      P._leaveShift();
      P.state.update({ phase: 'loading', buffering: true });
      P._attempt(P.token, P._srcIndex);
      return true;
    },
    /** Jump to the start of the current programme. Returns {ok, exact} or {ok:false, why}. */
    jumpToProgramme: function () {
      var D = INDTV.DVR, st = P.state.get(), s = D && D.current();
      if (st.kind !== 'channel') return { ok: false, why: 'kind' };
      if (!s || s.stopped || !s.segs.length) return { ok: false, why: 'nodvr' };
      var epg = INDTV.EpgRepository.nowNext(st.item);
      if (!epg || !epg.now) return { ok: false, why: 'noepg' };
      var start = epg.now.start, j = -1, i, before = 0;
      for (i = 0; i < s.segs.length; i++) if (s.segs[i].wall + s.segs[i].dur * 1000 > start) { j = i; break; }
      if (j < 0) return { ok: false, why: 'nodvr' };
      for (i = 0; i < j; i++) before += s.segs[i].dur;
      var exact = s.segs[0].wall <= start + 1500;
      return P._enterShift(before) ? { ok: true, exact: exact } : { ok: false, why: 'nodvr' };
    },
    /** Start / stop recording the current programme. Returns 'started' | 'stopped' | 'busy' | 'unavailable'. */
    toggleRecord: function () {
      var D = INDTV.DVR, st = P.state.get();
      if (!D || st.kind !== 'channel' || !st.item) return 'unavailable';
      if (D.isRecording(st.item.id)) { D.stopRecording('stopped'); P._syncDvr(); return 'stopped'; }
      if (D.isRecording()) return 'busy';
      var s = D.current();
      if (!s && !D._pendingWatch) return 'unavailable';
      if (s && (s.stopped || s.error)) return 'unavailable';
      var cfg = D.settings(), epg = INDTV.EpgRepository.nowNext(st.item), now = epg && epg.now;
      var rec = D.startRecording({
        title: now ? now.title : st.item.name,
        endAt: cfg.autoStop && now ? now.stop + cfg.padMin * 60000 : null,
        fromWall: cfg.fromStart && now ? now.start : null
      });
      P._syncDvr();
      return rec ? 'started' : 'unavailable';
    },
    hasNeighbours: function () { return !!(P._ctx && P._ctx.list.length > 1); }
  };

  if (Bus && Bus.on) Bus.on('dvr', function () { if (P.state.get().kind === 'channel') P._syncDvr(); });
  root.INDTVExo = function (type, a, b) { P._exoEvent(type, a, b); };
  INDTV.Player = P;
  INDTV._ranker = Ranker;
  INDTV._playerTypeOf = typeOf;
})(typeof window !== 'undefined' ? window : globalThis);
