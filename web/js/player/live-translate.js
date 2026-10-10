/* INDTV — live translation of the programme's sound.
 *
 * Pipeline (continuous while on):
 *   player <video> → Web Audio (sound still plays normally) → MediaRecorder chunks of ~8 s
 *   → speech-to-text (Whisper; any spoken language, auto-detected)
 *   → translation into the chosen language (chat model) → subtitles over the video.
 *
 * Uses the viewer's own API key (Groq free tier by default, or OpenAI / any OpenAI-compatible
 * server). In the Android TV app requests go through the native layer; in a browser via fetch.
 * Silent chunks are skipped, the queue never grows (subtitles stay live), and quota limits pause
 * and resume automatically. */
(function (root) {
  'use strict';
  var INDTV = root.INDTV = root.INDTV || {};
  var Store = INDTV.Store, t = function (k) { return INDTV.I18n.t(k); };

  // Phrase detection and pacing
  var VOICE_LEVEL = 0.015;   // RMS above this counts as sound worth transcribing
  var PAUSE_MS = 280;        // a short pause ends a phrase
  var MIN_SEG = 1100;        // shortest phrase sent
  var MAX_SEG = 4000;        // continuous speech is cut here
  // Minimum time between requests per service (Groq free tier allows 20 per minute).
  var PACE = { groq: 3100, openai: 900, custom: 1500 };
  var PROVIDERS = {
    groq: { base: 'https://api.groq.com/openai/v1', stt: 'whisper-large-v3-turbo', llm: 'llama-3.3-70b-versatile', api: 'chat' },
    openai: { base: 'https://api.openai.com/v1', stt: 'whisper-1', llm: 'gpt-6-luna', api: 'responses' },
    custom: { base: '', stt: 'whisper-1', llm: '', api: 'chat' },
    // Streaming: speech recognition and translation in one live connection, word by word.
    soniox: { base: 'wss://stt-rt.soniox.com/transcribe-websocket', stt: 'stt-rt-v5', llm: '-', api: 'stream' },
    // Streaming speech recognition by Deepgram (free starting credit) + translation by Groq (free).
    deepgram: { base: 'wss://api.deepgram.com/v1/listen', stt: 'nova-3', llm: 'llama-3.3-70b-versatile', api: 'stream' }
  };
  var GROQ_BASE = 'https://api.groq.com/openai/v1';
  var TARGETS = [
    { code: 'he', name: 'עברית', en: 'Hebrew' }, { code: 'en', name: 'English', en: 'English' },
    { code: 'ar', name: 'العربية', en: 'Arabic' }, { code: 'ru', name: 'Русский', en: 'Russian' },
    { code: 'hi', name: 'हिन्दी', en: 'Hindi' }, { code: 'fr', name: 'Français', en: 'French' },
    { code: 'es', name: 'Español', en: 'Spanish' }
  ];
  // Whisper's common inventions on music or silence.
  var HALLUCINATIONS = /^(thank(s| you)( very much)?( for watching)?[.!]*|please subscribe.*|subtitles by.*|you|bye[.!]*|\.+|♪+|music|\[music\]|\(music\))$/i;

  /* ---------- settings ---------- */
  function loadCfg() {
    var c = null;
    try { c = Store.getSync('translate'); } catch (e) { c = null; }
    c = c && typeof c === 'object' ? c : {};
    var prov = PROVIDERS[c.provider] ? c.provider : 'groq';
    return {
      provider: prov, key: String(c.key || '').replace(/[\s"']/g, ''), key2: String(c.key2 || '').replace(/[\s"']/g, ''), target: c.target || 'he', showOriginal: c.showOriginal === true,
      subSize: c.subSize || 'l', subBg: c.subBg || 'semi', subColor: c.subColor || 'white', subPos: c.subPos || 'bottom',
      base: c.base || PROVIDERS[prov].base, stt: c.stt || PROVIDERS[prov].stt, llm: c.llm || PROVIDERS[prov].llm
    };
  }

  /* ---------- HTTP (native bridge in the app, fetch in a browser) ---------- */
  var pending = {}, seq = 0;
  root.INDTVNativeResponse = function (id, status, b64) {
    var p = pending[id];
    if (!p) return;
    delete pending[id];
    var text = '';
    try { text = decodeURIComponent(escape(atob(b64 || ''))); } catch (e) { text = ''; }
    p({ status: status, text: text });
  };
  function bytesToB64(u8) {
    var s = '', CH = 0x8000;
    for (var i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
    return btoa(s);
  }
  function http(method, url, headers, bodyU8, retried) {
    return httpOnce(method, url, headers, bodyU8).then(function (res) {
      if (res.status === 0 && !retried) return http(method, url, headers, bodyU8, true);
      return res;
    }, function (err) {
      if (!retried) return http(method, url, headers, bodyU8, true);
      throw err;
    });
  }
  function httpOnce(method, url, headers, bodyU8) {
    if (root.INDTVNative && root.INDTVNative.httpRequest) {
      return new Promise(function (resolve, reject) {
        var id = 'r' + (++seq);
        var timer = setTimeout(function () { delete pending[id]; reject(new Error('timeout')); }, 45000);
        pending[id] = function (res) { clearTimeout(timer); resolve(res); };
        root.INDTVNative.httpRequest(id, method, url, JSON.stringify(headers || {}), bodyU8 ? bytesToB64(bodyU8) : '');
      });
    }
    return fetch(url, { method: method, headers: headers, body: bodyU8 || undefined, credentials: 'omit' })
      .then(function (r) { return r.text().then(function (txt) { return { status: r.status, text: txt }; }); });
  }
  function enc(s) { return new TextEncoder().encode(s); }
  function blobBytes(blob) {
    if (blob.arrayBuffer) return blob.arrayBuffer().then(function (b) { return new Uint8Array(b); });
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(new Uint8Array(fr.result)); };
      fr.onerror = function () { reject(fr.error || new Error('read')); };
      fr.readAsArrayBuffer(blob);
    });
  }
  function multipart(fields, file) {
    var boundary = '----indtv' + Math.random().toString(16).slice(2);
    var parts = [];
    Object.keys(fields).forEach(function (k) {
      parts.push(enc('--' + boundary + '\r\nContent-Disposition: form-data; name="' + k + '"\r\n\r\n' + fields[k] + '\r\n'));
    });
    parts.push(enc('--' + boundary + '\r\nContent-Disposition: form-data; name="file"; filename="' + file.name + '"\r\nContent-Type: ' + file.type + '\r\n\r\n'));
    parts.push(file.bytes);
    parts.push(enc('\r\n--' + boundary + '--\r\n'));
    var len = parts.reduce(function (n, p) { return n + p.length; }, 0);
    var out = new Uint8Array(len), off = 0;
    parts.forEach(function (p) { out.set(p, off); off += p.length; });
    return { body: out, type: 'multipart/form-data; boundary=' + boundary };
  }
  function apiError(res, step) {
    var msg = '';
    try { var j = JSON.parse(res.text); msg = (j.error && (j.error.message || j.error.code)) || j.message || ''; } catch (x) { msg = (res.text || '').slice(0, 120); }
    var e = new Error(msg || ('HTTP ' + res.status));
    e.status = res.status;
    e.step = step;
    e.detail = String(msg || '').replace(/\s+/g, ' ').slice(0, 140);
    return e;
  }
  /** One line the viewer can read (and send us) when something fails. */
  function describe(e) {
    var he = INDTV.I18n.lang() === 'he';
    var step = e && e.step === 'stt' ? (he ? 'זיהוי דיבור' : 'speech recognition') : e && e.step === 'llm' ? (he ? 'תרגום' : 'translation') : (he ? 'חיבור' : 'connection');
    if (!e || !e.status) return (he ? 'אין תשובה מהשירות (' : 'No answer from the service (') + step + (e && e.message ? ': ' + String(e.message).slice(0, 80) : '') + ')';
    return (he ? 'השירות החזיר שגיאה ' : 'Service error ') + e.status + ' · ' + step + (e.detail ? ' — ' + e.detail : '');
  }

  /* ---------- speech-to-text + translation ---------- */
  var STT_FALLBACK = { groq: ['whisper-large-v3-turbo', 'whisper-large-v3'], openai: ['whisper-1', 'gpt-4o-mini-transcribe'] };
  var LLM_FALLBACK = { groq: ['llama-3.3-70b-versatile', 'openai/gpt-oss-20b', 'llama-3.1-8b-instant', 'openai/gpt-oss-120b'], openai: [] };
  function nextModel(list, current) {
    var l = list || [];
    var i = l.indexOf(current);
    return i >= 0 && i + 1 < l.length ? l[i + 1] : (i < 0 && l.length && l[0] !== current ? l[0] : null);
  }
  function modelProblem(e) { return e && (e.status === 400 || e.status === 404) && /model|decommission|not.?found|does not exist|access/i.test(e.detail || ''); }

  function transcribe(cfg, blob, attempt) {
    var model = cfg.stt;
    return blobBytes(blob).then(function (bytes) {
      var type = (blob.type || 'audio/webm').split(';')[0];
      var ext = /ogg/.test(type) ? 'ogg' : /mp4|m4a/.test(type) ? 'm4a' : /wav/.test(type) ? 'wav' : 'webm';
      var fields = { model: model, response_format: /whisper/.test(model) ? 'verbose_json' : 'json', temperature: '0' };
      var mp = multipart(fields, { name: 'chunk.' + ext, type: type, bytes: bytes });
      return http('POST', cfg.base.replace(/\/$/, '') + '/audio/transcriptions',
        { Authorization: 'Bearer ' + cfg.key, 'Content-Type': mp.type, Accept: 'application/json' }, mp.body);
    }).then(function (res) {
      if (res.status !== 200) throw apiError(res, 'stt');
      var j = JSON.parse(res.text);
      return { text: String(j.text || '').trim(), language: j.language || null };
    }).catch(function (e) {
      if (e && !e.step) e.step = 'stt';
      var alt = modelProblem(e) && !attempt ? nextModel(STT_FALLBACK[cfg.provider], model) : null;
      if (alt) { LT.saveConfig({ stt: alt }); return transcribe(Object.assign({}, cfg, { stt: alt }), blob, 1); }
      throw e;
    });
  }

  function translate(cfg, text, previous, attempt) {
    var target = TARGETS.filter(function (x) { return x.code === cfg.target; })[0] || TARGETS[0];
    var instructions = 'You translate live TV subtitles into ' + target.en + '. Output only the translation of the new line, ' +
      'as natural, short subtitle text in ' + target.en + '. Keep names as they are. If the line is already in ' + target.en +
      ', return it unchanged. If it is only noise or music, output nothing.';
    var userText = (previous ? 'Previous line (context only, do not translate): ' + previous + '\n' : '') + 'New line: ' + text;
    var url, body;
    if (PROVIDERS[cfg.provider].api === 'responses') {
      url = cfg.base.replace(/\/$/, '') + '/responses';
      body = { model: cfg.llm, instructions: instructions, input: userText, max_output_tokens: 160 };
    } else {
      url = cfg.base.replace(/\/$/, '') + '/chat/completions';
      body = { model: cfg.llm, temperature: 0.1, max_tokens: 160, messages: [{ role: 'system', content: instructions }, { role: 'user', content: userText }] };
    }
    return http('POST', url, { Authorization: 'Bearer ' + cfg.key, 'Content-Type': 'application/json', Accept: 'application/json' }, enc(JSON.stringify(body)))
      .then(function (res) {
        if (res.status !== 200) throw apiError(res, 'llm');
        var j = JSON.parse(res.text);
        if (j.choices) return String((j.choices[0].message || {}).content || '').trim();
        var out = '';
        (j.output || []).forEach(function (item) {
          (item.content || []).forEach(function (c) { if (c.type === 'output_text') out += c.text; });
        });
        return (out || j.output_text || '').trim();
      }).catch(function (e) {
        if (e && !e.step) e.step = 'llm';
        // the chosen model may be retired or not enabled for this key: try the next one and remember it
        var tries = attempt || 0;
        var alt = modelProblem(e) && tries < 3 ? nextModel(LLM_FALLBACK[cfg.provider], cfg.llm) : null;
        if (alt) { LT.saveConfig({ llm: alt }); return translate(Object.assign({}, cfg, { llm: alt }), text, previous, tries + 1); }
        throw e;
      });
  }

  /** Fast free translator (no key, no per-minute quota). The Groq key, when given, is only a backup. */
  var GCODE = { he: 'iw' };
  function gtranslate(text, target) {
    var url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&dt=t&tl=' + (GCODE[target] || target) + '&q=' + encodeURIComponent(text);
    return http('GET', url, { Accept: 'application/json' }, null).then(function (res) {
      if (res.status !== 200) { var e = new Error('HTTP ' + res.status); e.status = res.status; e.step = 'llm'; throw e; }
      var j = JSON.parse(res.text), out = '';
      (j[0] || []).forEach(function (seg) { out += seg[0] || ''; });
      return out.trim();
    });
  }
  function fastTranslate(cfg, text, previous) {
    return gtranslate(text, cfg.target).catch(function (e) {
      if (cfg.key2) return translate({ provider: 'groq', base: GROQ_BASE, key: cfg.key2, llm: cfg.llm, target: cfg.target }, text, previous);
      throw e;
    });
  }

  /** A one-second test tone as WAV, to check the whole pipeline from Settings. */
  function testWav() {
    var rate = 16000, n = rate, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
    function str(o, s) { for (var i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); }
    str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt '); v.setUint32(16, 16, true);
    v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true);
    v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * 2, true);
    for (var i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.sin(i / rate * 2 * Math.PI * 440) * 6000, true);
    return new Blob([buf], { type: 'audio/wav' });
  }

  /* ---------- audio capture ----------
   * Preferred: video.captureStream() — a copy of the sound; what you hear is untouched.
   * Fallback (older WebViews): Web Audio routing, used only while translation is on. */
  var audio = { ctx: null, src: null, dest: null, analyser: null, video: null, mode: null, stream: null };
  function captureStreamOf(video) {
    var fn = video.captureStream || video.mozCaptureStream;
    if (!fn) return null;
    try {
      var st = fn.call(video);
      var tracks = st.getAudioTracks();
      return tracks.length ? new MediaStream(tracks) : null;
    } catch (e) { return null; }
  }
  function attach(video) {
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!AC || typeof root.MediaRecorder === 'undefined') throw Object.assign(new Error('unsupported'), { code: 'unsupported' });
    if (!audio.ctx) audio.ctx = new AC();
    var ctx = audio.ctx;
    var stream = captureStreamOf(video);
    if (stream) {
      if (audio.srcNode) { try { audio.srcNode.disconnect(); } catch (e) { /* ignore */ } }
      var node = ctx.createMediaStreamSource(stream);       // analysis only, not connected to the speakers
      var analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      node.connect(analyser);
      audio.srcNode = node; audio.analyser = analyser; audio.stream = stream; audio.mode = 'capture'; audio.video = video;
      return audio;
    }
    if (audio.video !== video || audio.mode !== 'route') {
      var src = ctx.createMediaElementSource(video);
      src.connect(ctx.destination);
      var dest = ctx.createMediaStreamDestination();
      src.connect(dest);
      var an = ctx.createAnalyser();
      an.fftSize = 1024;
      src.connect(an);
      audio.src = src; audio.dest = dest; audio.analyser = an; audio.mode = 'route'; audio.video = video;
    }
    audio.stream = audio.dest.stream;
    return audio;
  }
  /** The stream to record now (re-captured each chunk: a channel switch replaces the audio track). */
  function currentStream() {
    if (audio.mode === 'capture' && audio.video) {
      var live = audio.stream && audio.stream.getAudioTracks().some(function (tr) { return tr.readyState === 'live'; });
      if (!live) { try { attach(audio.video); } catch (e) { /* keep old */ } }
    }
    return audio.stream;
  }
  function level() {
    var a = audio.analyser;
    if (!a) return 1;
    var buf = new Float32Array(a.fftSize);
    a.getFloatTimeDomainData(buf);
    var sum = 0;
    for (var i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    return Math.sqrt(sum / buf.length);
  }
  function pickMime() {
    var opts = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
    for (var i = 0; i < opts.length; i++) { if (root.MediaRecorder.isTypeSupported && root.MediaRecorder.isTypeSupported(opts[i])) return opts[i]; }
    return '';
  }

  /* ---------- controller ---------- */
  var LT = {
    TARGETS: TARGETS, PROVIDERS: PROVIDERS,
    state: new INDTV.StateFlow({ on: false, text: '', orig: '', detected: null, error: null, targetName: '', showOriginal: true }),
    _run: 0, _prev: '', _pauseUntil: 0, _rec: null, _vad: null, _seq: 0, _shown: 0, _inFlight: 0, _lastSent: 0, _minGap: 3100,

    config: loadCfg,
    saveConfig: function (patch) {
      var c = loadCfg();
      Object.keys(patch).forEach(function (k) { c[k] = patch[k]; });
      if (patch.provider && PROVIDERS[patch.provider]) {
        var d = PROVIDERS[patch.provider];
        if (!('base' in patch)) c.base = d.base;
        if (!('stt' in patch)) c.stt = d.stt;
        if (!('llm' in patch)) c.llm = d.llm;
      }
      Store.setSync('translate', c);
      var st = LT.state.get();
      if (st.on) LT.state.update({ targetName: LT.targetName(), showOriginal: c.showOriginal });
      return c;
    },
    targetName: function () {
      var c = loadCfg();
      var tg = TARGETS.filter(function (x) { return x.code === c.target; })[0] || TARGETS[0];
      return tg.name;
    },
    isConfigured: function () { var c = loadCfg(); if (c.provider === 'deepgram') return !!(c.key && c.base && c.stt);
      return !!(c.key && c.base && c.stt && (c.llm || c.provider === 'soniox')); },
    isStreaming: function () { return PROVIDERS[loadCfg().provider].api === 'stream'; },
    isOn: function () { return LT.state.get().on; },

    toggle: function (video) { return LT.isOn() ? LT.stop() : LT.start(video); },

    start: function (video) {
      var cfg = loadCfg();
      if (!LT.isConfigured()) { INDTV.UI.toast(t('translateSetup')); return; }
      // A stream the page cannot read (no CORS, outside the app) would be muted by Web Audio.
      var P = INDTV.Player;
      if (!root.INDTVNative && P._native) { INDTV.UI.toast(t('translateUnsupported')); return; }
      try { attach(video); } catch (e) { INDTV.UI.toast(t('translateUnsupported')); return; }
      if (audio.ctx.state === 'suspended') audio.ctx.resume();
      var run = ++LT._run;
      LT._prev = '';
      LT._pauseUntil = 0;
      LT._seq = 0; LT._shown = 0; LT._inFlight = 0; LT._lastSent = 0;
      LT._minGap = PACE[cfg.provider] || PACE.custom;
      LT.state.set({ on: true, text: '', orig: '', detected: null, error: null, targetName: LT.targetName(), showOriginal: cfg.showOriginal });
      if (cfg.provider === 'deepgram') LT._streamDG(run, cfg);
      else if (PROVIDERS[cfg.provider].api === 'stream') LT._stream(run, cfg);
      else LT._record(run);
    },

    /* ---------- streaming mode (word by word) ----------
     * The programme sound is sent continuously (200 ms pieces) over one WebSocket; the service
     * returns recognised words and their translation as they are spoken. Words still being heard
     * are shown immediately and corrected in place; finished sentences roll up like live captions. */
    _stream: function (run, cfg) {
      var mime = pickMime();
      var sx = LT._sx = { ws: null, rec: null, lines: [], cur: '', curNon: '', orig: '', origNon: '', retry: 0, watch: null };
      function show() {
        var current = (sx.cur + sx.curNon).trim();
        var lines = sx.lines.slice(-1);
        if (current) lines.push(current);
        var text = lines.map(function (l) { return l.length > 90 ? '…' + l.slice(-88) : l; }).join('\n').trim();
        var orig = (sx.orig + sx.origNon).trim();
        if (orig.length > 90) orig = '…' + orig.slice(-88);
        LT.state.update({ text: text, orig: orig, error: null });
        clearTimeout(LT._clear);
        LT._clear = setTimeout(function () { if (run === LT._run) { sx.lines = []; LT.state.update({ text: '', orig: '' }); } }, 6000);
      }
      function startRecorder() {
        var stream = currentStream();
        var rec;
        try { rec = mime ? new root.MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 48000 }) : new root.MediaRecorder(stream); }
        catch (e) { INDTV.UI.toast(t('translateUnsupported')); LT.stop(); return; }
        rec.ondataavailable = function (ev) {
          if (run === LT._run && ev.data && ev.data.size && sx.ws && sx.ws.readyState === 1) sx.ws.send(ev.data);
        };
        sx.rec = rec;
        rec.start(200);
      }
      function open() {
        if (run !== LT._run) return;
        var ws;
        try { ws = new WebSocket(cfg.base); } catch (e) { LT._notify(describe(e)); return; }
        sx.ws = ws;
        ws.onopen = function () {
          ws.send(JSON.stringify({
            api_key: cfg.key, model: cfg.stt, audio_format: 'auto',
            language_hints: ['hi', 'en'], enable_endpoint_detection: true,
            translation: { type: 'one_way', target_language: cfg.target }
          }));
          sx.retry = 0;
          startRecorder();
        };
        ws.onmessage = function (ev) {
          if (run !== LT._run) return;
          var m;
          try { m = JSON.parse(ev.data); } catch (e) { return; }
          if (m.error_code || m.error_message) {
            var err = new Error(m.error_message || 'error'); err.status = m.error_code; err.step = 'stt'; err.detail = m.error_message;
            LT._notify(err.status === 401 ? t('translateFail') : describe(err));
            sx.fatal = err.status === 401 || err.status === 402 || /api key|balance|credit|model/i.test(m.error_message || '');
            return;
          }
          var trNon = '', orNon = '', ended = false;
          (m.tokens || []).forEach(function (tk) {
            if (tk.text === '<end>') { if (tk.is_final) ended = true; return; }
            if (tk.translation_status === 'translation') { if (tk.is_final) sx.cur += tk.text; else trNon += tk.text; }
            else { if (tk.is_final) sx.orig += tk.text; else orNon += tk.text; if (tk.language) LT.state.update({ detected: tk.language }); }
          });
          sx.curNon = trNon; sx.origNon = orNon;
          if (ended && sx.cur.trim()) { sx.lines.push(sx.cur.trim()); sx.lines = sx.lines.slice(-2); sx.cur = ''; sx.orig = ''; }
          if ((m.tokens || []).length) show();
        };
        ws.onclose = function () {
          if (sx.rec && sx.rec.state !== 'inactive') { try { sx.rec.stop(); } catch (e) { /* ignore */ } }
          if (run !== LT._run || sx.fatal) return;
          sx.retry++;
          setTimeout(open, Math.min(5000, 400 * sx.retry));    // reconnect quickly (channel change, network blip)
        };
        ws.onerror = function () { if (sx.retry > 2) LT._notify(describe({ step: 'stt' })); };
      }
      open();
      // A channel change replaces the audio track: restart the session on the new sound.
      sx.watch = setInterval(function () {
        if (run !== LT._run) { clearInterval(sx.watch); return; }
        var live = audio.stream && audio.stream.getAudioTracks().some(function (tr) { return tr.readyState === 'live'; });
        if (!live && sx.ws) { try { attach(audio.video); } catch (e) { /* keep */ } try { sx.ws.close(); } catch (e2) { /* ignore */ } }
      }, 700);
    },

    /* ---------- Deepgram + Groq (free streaming) ----------
     * The programme sound streams to Deepgram over one WebSocket; recognised words (interim and final)
     * come back within a fraction of a second. The sentence being spoken is translated by Groq about
     * once a second and replaced in place, so subtitles follow the speech word by word. */
    _streamDG: function (run, cfg) {
      var mime = pickMime();
      var dg = LT._dg = { ws: null, rec: null, lines: [], final: '', interim: '', shownSrc: '', busy: false, seq: 0, shown: 0, retry: 0, prev: '', watch: null, tick: null, dirty: false, lastTr: '' };
      function render(out) {
        var cur = out || dg.lastTr;
        var lines = dg.lines.slice(-1);
        if (cur) lines.push(cur);
        var text = lines.map(function (l) { return l.length > 90 ? '…' + l.slice(-88) : l; }).join('\n').trim();
        var orig = (dg.final + ' ' + dg.interim).trim();
        if (orig.length > 90) orig = '…' + orig.slice(-88);
        LT.state.update({ text: text, orig: orig, error: null });
        clearTimeout(LT._clear);
        LT._clear = setTimeout(function () { if (run === LT._run) { dg.lines = []; dg.lastTr = ''; LT.state.update({ text: '', orig: '' }); } }, 6000);
      }
      function translateNow() {
        if (dg.busy || run !== LT._run || Date.now() < LT._pauseUntil) return;
        var src = (dg.final + ' ' + dg.interim).replace(/\s+/g, ' ').trim();
        if (!src || src === dg.shownSrc) return;
        dg.busy = true; dg.dirty = false;
        var seq = ++dg.seq;
        fastTranslate(cfg, src, dg.prev).then(function (out) {
          dg.busy = false;
          if (run !== LT._run || seq < dg.shown) return;
          dg.shown = seq; dg.shownSrc = src;
          out = (out || '').replace(/^["“”']+|["“”']+$/g, '').trim();
          if (out) { dg.lastTr = out; render(out); }
        }).catch(function (e) {
          dg.busy = false;
          if (run !== LT._run) return;
          if (e && e.status === 429) { LT._pauseUntil = Date.now() + 2000; LT._notify(t('translateLimit')); }
          else if (e && (e.status === 401 || e.status === 403)) { LT._pauseUntil = Date.now() + 5 * 60000; LT._notify(t('translateFail')); }
          else { LT._pauseUntil = Date.now() + 1500; LT._notify(describe(e)); }
        });
      }
      function commit() {
        // sentence finished: keep its translation as a finished line, then start fresh
        var src = dg.final.trim();
        if (!src) return;
        var done = dg.lastTr;
        var seq = ++dg.seq;
        dg.prev = src;
        fastTranslate(cfg, src, '').then(function (out) {
          if (run !== LT._run) return;
          out = (out || '').trim() || done;
          if (out) { dg.lines.push(out); dg.lines = dg.lines.slice(-2); }
          dg.final = ''; dg.interim = ''; dg.lastTr = ''; dg.shownSrc = ''; dg.shown = seq;
          render('');
        }).catch(function () {
          if (done) dg.lines.push(done);
          dg.final = ''; dg.interim = ''; dg.lastTr = ''; dg.shownSrc = '';
        });
      }
      function startRecorder() {
        var stream = currentStream(), rec;
        try { rec = mime ? new root.MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 48000 }) : new root.MediaRecorder(stream); }
        catch (e) { INDTV.UI.toast(t('translateUnsupported')); LT.stop(); return; }
        rec.ondataavailable = function (ev) {
          if (run === LT._run && ev.data && ev.data.size && dg.ws && dg.ws.readyState === 1) dg.ws.send(ev.data);
        };
        dg.rec = rec;
        rec.start(150);
      }
      function open() {
        if (run !== LT._run) return;
        var url = cfg.base + (cfg.base.indexOf('?') < 0 ? '?' : '&') + 'model=' + encodeURIComponent(cfg.stt) +
          '&language=' + encodeURIComponent(cfg.srcLang || 'multi') + '&interim_results=true&endpointing=400&smart_format=true&punctuate=true';
        var ws;
        try { ws = new WebSocket(url, ['token', cfg.key]); } catch (e) { LT._notify(describe(e)); return; }
        dg.ws = ws;
        ws.onopen = function () { dg.retry = 0; startRecorder(); };
        ws.onmessage = function (ev) {
          if (run !== LT._run) return;
          var m; try { m = JSON.parse(ev.data); } catch (e) { return; }
          if (m.type === 'Error' || m.err_code) { LT._notify(describe({ step: 'stt', status: m.status, detail: m.err_msg || m.description })); return; }
          if (m.type !== 'Results' || !m.channel || !m.channel.alternatives || !m.channel.alternatives[0]) return;
          var alt = m.channel.alternatives[0], txt = String(alt.transcript || '').trim();
          if (!txt) return;
          if (m.is_final) {
            dg.final = (dg.final + ' ' + txt).trim(); dg.interim = '';
            if (m.speech_final) { translateNow(); setTimeout(commit, 250); }
          } else dg.interim = txt;
          dg.dirty = true;
        };
        ws.onclose = function (ev) {
          if (dg.rec && dg.rec.state !== 'inactive') { try { dg.rec.stop(); } catch (e) { /* ignore */ } }
          if (run !== LT._run) return;
          if (ev && (ev.code === 1008 || ev.code === 4001 || ev.code === 4003)) { LT._notify(t('translateFail')); return; }
          dg.retry++;
          setTimeout(open, Math.min(5000, 400 * dg.retry));
        };
        ws.onerror = function () { if (dg.retry > 2) LT._notify(describe({ step: 'stt' })); };
      }
      open();
      dg.tick = setInterval(function () { if (run === LT._run && dg.dirty) translateNow(); }, 200);
      dg.watch = setInterval(function () {
        if (run !== LT._run) { clearInterval(dg.watch); return; }
        var live = audio.stream && audio.stream.getAudioTracks().some(function (tr) { return tr.readyState === 'live'; });
        if (!live && dg.ws) { try { attach(audio.video); } catch (e) { /* keep */ } try { dg.ws.close(); } catch (e2) { /* ignore */ } }
      }, 700);
    },

    stop: function () {
      LT._run++;
      if (LT._sx) {
        clearInterval(LT._sx.watch);
        if (LT._sx.rec && LT._sx.rec.state !== 'inactive') { try { LT._sx.rec.stop(); } catch (e) { /* ignore */ } }
        if (LT._sx.ws) { try { LT._sx.ws.send(''); LT._sx.ws.close(); } catch (e) { /* ignore */ } }
        LT._sx = null;
      }
      if (LT._dg) {
        clearInterval(LT._dg.watch); clearInterval(LT._dg.tick);
        if (LT._dg.rec && LT._dg.rec.state !== 'inactive') { try { LT._dg.rec.stop(); } catch (e) { /* ignore */ } }
        if (LT._dg.ws) { try { LT._dg.ws.send(JSON.stringify({ type: 'CloseStream' })); LT._dg.ws.close(); } catch (e) { /* ignore */ } }
        LT._dg = null;
      }
      clearInterval(LT._vad);
      clearTimeout(LT._clear);
      if (LT._rec && LT._rec.state !== 'inactive') { try { LT._rec.stop(); } catch (e) { /* ignore */ } }
      LT._rec = null;
      if (LT.state.get().on) LT.state.set({ on: false, text: '', orig: '', detected: null, error: null, targetName: '', showOriginal: true });
    },

    /**
     * Record one phrase. A voice-activity detector ends the chunk at the first natural pause
     * (or at MAX_SEG during continuous speech), so subtitles follow the speech phrase by phrase.
     * The next recorder starts immediately; requests are paced to stay inside the service's
     * per-minute limit, and results are shown strictly in order.
     */
    _record: function (run) {
      if (run !== LT._run) return;
      var mime = pickMime();
      var rec, stream = currentStream();
      try { rec = mime ? new root.MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 32000 }) : new root.MediaRecorder(stream); }
      catch (e) { INDTV.UI.toast(t('translateUnsupported')); LT.stop(); return; }
      var parts = [];
      var started = Date.now(), lastVoice = 0, voiced = 0;
      rec.ondataavailable = function (ev) { if (ev.data && ev.data.size) parts.push(ev.data); };
      rec.onstop = function () {
        if (run !== LT._run) return;
        var blob = new Blob(parts, { type: rec.mimeType || mime || 'audio/webm' });
        var speech = voiced >= 3;
        LT._record(run);                                  // keep listening without gaps
        if (speech && blob.size > 1500) LT._send(run, blob);
      };
      LT._rec = rec;
      rec.start();
      clearInterval(LT._vad);
      LT._vad = setInterval(function () {
        if (run !== LT._run || rec.state === 'inactive') { clearInterval(LT._vad); return; }
        var now = Date.now(), lv = level();
        if (lv > VOICE_LEVEL) { lastVoice = now; voiced++; }
        var elapsed = now - started;
        var paused = voiced >= 3 && now - lastVoice >= PAUSE_MS;
        var paced = now - LT._lastSent >= LT._minGap;
        var cut = (paused && elapsed >= MIN_SEG && paced) || (elapsed >= Math.max(MAX_SEG, LT._minGap) && paced) ||
          (!voiced && elapsed >= 6000);             // nothing said: start a fresh, small chunk
        if (cut) { clearInterval(LT._vad); try { rec.stop(); } catch (e) { /* ignore */ } }
      }, 80);
    },

    _send: function (run, blob) {
      if (Date.now() < LT._pauseUntil || LT._inFlight >= 3) return;
      var cfg = loadCfg();
      var seq = ++LT._seq;
      LT._lastSent = Date.now();
      LT._inFlight++;
      transcribe(cfg, blob).then(function (tr) {
        if (run !== LT._run) return null;
        var text = tr.text.replace(/\s+/g, ' ').trim();
        if (!text || text.length < 2 || HALLUCINATIONS.test(text)) return null;
        var detected = tr.language ? String(tr.language).toLowerCase() : null;
        var target = TARGETS.filter(function (x) { return x.code === cfg.target; })[0] || TARGETS[0];
        var same = detected && (detected === target.code || detected === target.en.toLowerCase());
        var p = same ? Promise.resolve(text) : translate(cfg, text, LT._prev);
        return p.then(function (out) {
          if (run !== LT._run || seq < LT._shown) return;   // a newer line is already on screen
          out = (out || '').replace(/^["“”']+|["“”']+$/g, '').trim();
          if (!out) return;
          LT._shown = seq;
          LT._prev = text;
          LT.state.update({ text: out, orig: text, detected: detected, error: null });
          clearTimeout(LT._clear);
          var keep = Math.min(9000, Math.max(3500, out.length * 90));
          LT._clear = setTimeout(function () { if (LT.state.get().text === out) LT.state.update({ text: '', orig: '' }); }, keep);
        });
      }).catch(function (e) {
        if (run !== LT._run) return;
        var msg;
        if (e && e.status === 429) {
          // over the per-minute quota: slow down a little and pause briefly
          LT._minGap = Math.min(9000, Math.round(LT._minGap * 1.4));
          LT._pauseUntil = Date.now() + 20000;
          msg = t('translateLimit');
        } else if (e && (e.status === 401 || e.status === 403)) { LT._pauseUntil = Date.now() + 5 * 60000; msg = t('translateFail'); }
        else { LT._pauseUntil = Date.now() + 8000; msg = describe(e); }
        LT._notify(msg);
        if (root.console) console.warn('[INDTV translate]', e && e.status, e && e.step, e && e.detail);
      }).then(function () { LT._inFlight = Math.max(0, LT._inFlight - 1); });
    },

    /** Problems appear once as a short notice, never as a permanent banner over the picture. */
    _notify: function (msg) {
      var now = Date.now();
      if (msg === LT._lastNote && now - LT._lastNoteAt < 60000) return;
      LT._lastNote = msg; LT._lastNoteAt = now;
      INDTV.UI.toast(msg, 'error');
    },

    /** Settings "Save": checks the key, speech recognition and translation, and reports each step. */
    test: function () {
      var cfg = loadCfg();
      if (cfg.provider === 'deepgram') return LT._testDG(cfg);
      if (PROVIDERS[cfg.provider].api === 'stream') return LT._testStream(cfg);
      var he = INDTV.I18n.lang() === 'he';
      var report = { ok: false, lines: [] };
      return http('GET', cfg.base.replace(/\/$/, '') + '/models', { Authorization: 'Bearer ' + cfg.key, Accept: 'application/json' }, null)
        .then(function (res) {
          if (res.status !== 200) throw apiError(res, 'key');
          report.lines.push((he ? '✓ המפתח תקין' : '✓ Key accepted'));
          return transcribe(loadCfg(), testWav());
        })
        .then(function () {
          report.lines.push((he ? '✓ זיהוי דיבור (' : '✓ Speech recognition (') + loadCfg().stt + ')');
          return translate(loadCfg(), 'नमस्ते, आप कैसे हैं?', '');
        })
        .then(function (out) {
          report.lines.push((he ? '✓ תרגום (' : '✓ Translation (') + loadCfg().llm + '): ' + (out || '—'));
          report.ok = true;
          return report;
        })
        .catch(function (e) {
          report.lines.push('✗ ' + (e && e.status === 401 ? t('translateFail') : describe(e)));
          return report;
        });
    }
  };

  LT._testDG = function (cfg) {
    var he = INDTV.I18n.lang() === 'he';
    var lines = [];
    // 1) ask the REST API: it tells a wrong key (401/403) from a connection problem
    var rest = http('GET', 'https://api.deepgram.com/v1/projects', { Authorization: 'Token ' + cfg.key, Accept: 'application/json' }, null)
      .then(function (res) { return res.status; }, function () { return 0; });
    return rest.then(function (status) {
      if (status === 200) return { ok: true, line: he ? '✓ Deepgram — המפתח תקין (' + cfg.stt + ')' : '✓ Deepgram key accepted (' + cfg.stt + ')' };
      if (status === 401 || status === 403) return { ok: false, line: '✗ Deepgram: ' + (he ? 'המפתח שגוי — הועתק חלקית או שהוא מפתח אחר (' + cfg.key.length + ' תווים)' : 'wrong key — copied partially or a different key (' + cfg.key.length + ' chars)') };
      // 2) REST unreachable (browser CORS etc.): try the live connection itself
      return new Promise(function (resolve) {
        var ws, done = false;
        function fin(ok, line) { if (done) return; done = true; try { ws.close(); } catch (e) { /* ignore */ } resolve({ ok: ok, line: line }); }
        try { ws = new WebSocket(cfg.base + '?model=' + encodeURIComponent(cfg.stt) + '&language=multi', ['token', cfg.key]); } catch (e) { fin(false, '✗ ' + describe(e)); return; }
        var timer = setTimeout(function () { fin(false, '✗ Deepgram: ' + (he ? 'אין תשובה מהשירות — בדקו חיבור לאינטרנט' : 'no answer — check the internet connection')); }, 10000);
        ws.onopen = function () { clearTimeout(timer); fin(true, he ? '✓ Deepgram — המפתח תקין (' + cfg.stt + ')' : '✓ Deepgram key accepted (' + cfg.stt + ')'); };
        ws.onerror = function () { clearTimeout(timer); fin(false, '✗ Deepgram: ' + (he ? 'החיבור נדחה (' + cfg.key.length + ' תווים במפתח; בדרך כלל 40) — צרו מפתח חדש והעתיקו אותו במלואו' : 'connection refused (key has ' + cfg.key.length + ' chars; usually 40) — create a new key and copy it fully')); };
      });
    }).then(function (r) {
      lines.push(r.line);
      if (!r.ok) return { ok: false, lines: lines };
      return fastTranslate(cfg, 'नमस्ते, आप कैसे हैं?', '').then(function (out) {
        lines.push((he ? '✓ תרגום מהיר: ' : '✓ Fast translation: ') + (out || '—'));
        return { ok: true, lines: lines };
      }).catch(function (e) {
        lines.push('✗ ' + describe(e));
        return { ok: false, lines: lines };
      });
    });
  };

  LT._testStream = function (cfg) {
    var he = INDTV.I18n.lang() === 'he';
    return new Promise(function (resolve) {
      var done = false, ws;
      function finish(ok, line) { if (done) return; done = true; try { ws.close(); } catch (e) { /* ignore */ } resolve({ ok: ok, lines: [line] }); }
      try { ws = new WebSocket(cfg.base); } catch (e) { finish(false, '✗ ' + describe(e)); return; }
      var timer = setTimeout(function () { finish(false, '✗ ' + (he ? 'אין תשובה מהשירות' : 'No answer from the service')); }, 12000);
      ws.onopen = function () {
        ws.send(JSON.stringify({ api_key: cfg.key, model: cfg.stt, audio_format: 'auto', translation: { type: 'one_way', target_language: cfg.target } }));
        ws.send(testWav());
        ws.send('');
      };
      ws.onmessage = function (ev) {
        var m; try { m = JSON.parse(ev.data); } catch (e) { return; }
        if (m.error_code || m.error_message) { clearTimeout(timer); finish(false, '✗ ' + (m.error_code === 401 ? t('translateFail') : (he ? 'השירות החזיר שגיאה ' : 'Service error ') + (m.error_code || '') + ' — ' + (m.error_message || ''))); }
        else if (m.finished) { clearTimeout(timer); finish(true, he ? '✓ חיבור רציף פעיל (' + cfg.stt + ') · התרגום יופיע מילה אחרי מילה' : '✓ Streaming connection works (' + cfg.stt + ')'); }
      };
      ws.onerror = function () { clearTimeout(timer); finish(false, '✗ ' + (he ? 'החיבור לשירות נכשל' : 'Could not connect to the service')); };
    });
  };

  INDTV.LiveTranslate = LT;
})(typeof window !== 'undefined' ? window : globalThis);
