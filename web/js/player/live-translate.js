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

  var CHUNK_MS = 8000;
  var PROVIDERS = {
    groq: { base: 'https://api.groq.com/openai/v1', stt: 'whisper-large-v3-turbo', llm: 'llama-3.3-70b-versatile', api: 'chat' },
    openai: { base: 'https://api.openai.com/v1', stt: 'whisper-1', llm: 'gpt-6-luna', api: 'responses' },
    custom: { base: '', stt: 'whisper-1', llm: '', api: 'chat' }
  };
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
      provider: prov, key: c.key || '', target: c.target || 'he', showOriginal: c.showOriginal !== false,
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
  function http(method, url, headers, bodyU8) {
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
  function apiError(res) {
    var e = new Error('HTTP ' + res.status);
    e.status = res.status;
    return e;
  }

  /* ---------- speech-to-text + translation ---------- */
  function transcribe(cfg, blob) {
    return blob.arrayBuffer().then(function (buf) {
      var type = blob.type || 'audio/webm';
      var ext = /ogg/.test(type) ? 'ogg' : /mp4|m4a/.test(type) ? 'm4a' : 'webm';
      var fields = { model: cfg.stt, response_format: 'verbose_json', temperature: '0' };
      var mp = multipart(fields, { name: 'chunk.' + ext, type: type.split(';')[0], bytes: new Uint8Array(buf) });
      return http('POST', cfg.base.replace(/\/$/, '') + '/audio/transcriptions',
        { Authorization: 'Bearer ' + cfg.key, 'Content-Type': mp.type }, mp.body);
    }).then(function (res) {
      if (res.status !== 200) throw apiError(res);
      var j = JSON.parse(res.text);
      return { text: String(j.text || '').trim(), language: j.language || null };
    });
  }

  function translate(cfg, text, previous) {
    var target = TARGETS.filter(function (x) { return x.code === cfg.target; })[0] || TARGETS[0];
    var instructions = 'You translate live TV subtitles into ' + target.en + '. Output only the translation of the new line, ' +
      'as natural, short subtitle text in ' + target.en + '. Keep names as they are. If the line is already in ' + target.en +
      ', return it unchanged. If it is only noise or music, output nothing.';
    var userText = (previous ? 'Previous line (context only, do not translate): ' + previous + '\n' : '') + 'New line: ' + text;
    var url, body;
    if (PROVIDERS[cfg.provider].api === 'responses') {
      url = cfg.base.replace(/\/$/, '') + '/responses';
      body = { model: cfg.llm, instructions: instructions, input: userText, max_output_tokens: 300 };
    } else {
      url = cfg.base.replace(/\/$/, '') + '/chat/completions';
      body = { model: cfg.llm, temperature: 0.2, max_tokens: 300, messages: [{ role: 'system', content: instructions }, { role: 'user', content: userText }] };
    }
    return http('POST', url, { Authorization: 'Bearer ' + cfg.key, 'Content-Type': 'application/json' }, enc(JSON.stringify(body)))
      .then(function (res) {
        if (res.status !== 200) throw apiError(res);
        var j = JSON.parse(res.text);
        if (j.choices) return String((j.choices[0].message || {}).content || '').trim();
        var out = '';
        (j.output || []).forEach(function (item) {
          (item.content || []).forEach(function (c) { if (c.type === 'output_text') out += c.text; });
        });
        return (out || j.output_text || '').trim();
      });
  }

  /* ---------- audio capture ---------- */
  var audio = { ctx: null, src: null, dest: null, analyser: null, video: null };
  function attach(video) {
    if (audio.video === video && audio.ctx) return audio;
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!AC || typeof root.MediaRecorder === 'undefined') throw Object.assign(new Error('unsupported'), { code: 'unsupported' });
    var ctx = new AC();
    var src = ctx.createMediaElementSource(video);   // once per element; sound keeps playing below
    src.connect(ctx.destination);
    var dest = ctx.createMediaStreamDestination();
    src.connect(dest);
    var analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    src.connect(analyser);
    audio = { ctx: ctx, src: src, dest: dest, analyser: analyser, video: video };
    return audio;
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
    _run: 0, _busy: false, _prev: '', _pauseUntil: 0, _peak: 0, _levelTimer: null, _rec: null, _cycle: null,

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
    isConfigured: function () { var c = loadCfg(); return !!(c.key && c.base && c.stt && c.llm); },
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
      LT.state.set({ on: true, text: '', orig: '', detected: null, error: null, targetName: LT.targetName(), showOriginal: cfg.showOriginal });
      clearInterval(LT._levelTimer);
      LT._levelTimer = setInterval(function () { LT._peak = Math.max(LT._peak, level()); }, 150);
      LT._record(run);
    },

    stop: function () {
      LT._run++;
      clearInterval(LT._levelTimer);
      clearTimeout(LT._cycle);
      if (LT._rec && LT._rec.state !== 'inactive') { try { LT._rec.stop(); } catch (e) { /* ignore */ } }
      LT._rec = null;
      if (LT.state.get().on) LT.state.set({ on: false, text: '', orig: '', detected: null, error: null, targetName: '', showOriginal: true });
    },

    /** Record one chunk, hand it off, immediately start the next. */
    _record: function (run) {
      if (run !== LT._run) return;
      var mime = pickMime();
      var rec;
      try { rec = mime ? new root.MediaRecorder(audio.dest.stream, { mimeType: mime, audioBitsPerSecond: 32000 }) : new root.MediaRecorder(audio.dest.stream); }
      catch (e) { INDTV.UI.toast(t('translateUnsupported')); LT.stop(); return; }
      var parts = [];
      LT._peak = 0;
      rec.ondataavailable = function (ev) { if (ev.data && ev.data.size) parts.push(ev.data); };
      rec.onstop = function () {
        if (run !== LT._run) return;
        var loud = LT._peak > 0.012;
        var blob = new Blob(parts, { type: rec.mimeType || mime || 'audio/webm' });
        LT._record(run);                                  // keep listening without gaps
        if (loud && blob.size > 2000) LT._process(run, blob);
      };
      LT._rec = rec;
      rec.start();
      LT._cycle = setTimeout(function () { if (rec.state !== 'inactive') rec.stop(); }, CHUNK_MS);
    },

    _process: function (run, blob) {
      // Live subtitles: if the previous chunk is still being processed, drop this one rather than fall behind.
      if (LT._busy || Date.now() < LT._pauseUntil) return;
      var cfg = loadCfg();
      LT._busy = true;
      transcribe(cfg, blob).then(function (tr) {
        if (run !== LT._run) return null;
        var text = tr.text.replace(/\s+/g, ' ').trim();
        if (!text || text.length < 2 || HALLUCINATIONS.test(text)) return null;
        var detected = tr.language ? String(tr.language).toLowerCase() : null;
        var target = TARGETS.filter(function (x) { return x.code === cfg.target; })[0] || TARGETS[0];
        var same = detected && (detected === target.code || detected === target.en.toLowerCase());
        var p = same ? Promise.resolve(text) : translate(cfg, text, LT._prev);
        return p.then(function (out) {
          if (run !== LT._run) return;
          out = (out || '').replace(/^["“”']+|["“”']+$/g, '').trim();
          if (!out) return;
          LT._prev = text;
          LT.state.update({ text: out, orig: text, detected: detected, error: null });
          clearTimeout(LT._clear);
          LT._clear = setTimeout(function () { if (LT.state.get().text === out) LT.state.update({ text: '', orig: '' }); }, 14000);
        });
      }).catch(function (e) {
        if (run !== LT._run) return;
        if (e && e.status === 429) { LT._pauseUntil = Date.now() + 60000; LT.state.update({ error: t('translateLimit') }); }
        else if (e && (e.status === 401 || e.status === 403)) { LT.state.update({ error: t('translateFail') }); LT._pauseUntil = Date.now() + 5 * 60000; }
        else { LT.state.update({ error: t('translateError') }); LT._pauseUntil = Date.now() + 15000; }
      }).then(function () { LT._busy = false; });
    },

    /** Settings "Test key": lists models with the saved key. */
    test: function () {
      var cfg = loadCfg();
      return http('GET', cfg.base.replace(/\/$/, '') + '/models', { Authorization: 'Bearer ' + cfg.key }, null)
        .then(function (res) { return res.status === 200; }, function () { return false; });
    }
  };

  INDTV.LiveTranslate = LT;
})(typeof window !== 'undefined' ? window : globalThis);
