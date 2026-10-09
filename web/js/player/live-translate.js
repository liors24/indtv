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
      body = { model: cfg.llm, instructions: instructions, input: userText, max_output_tokens: 300 };
    } else {
      url = cfg.base.replace(/\/$/, '') + '/chat/completions';
      body = { model: cfg.llm, temperature: 0.2, max_tokens: 300, messages: [{ role: 'system', content: instructions }, { role: 'user', content: userText }] };
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
      var stream = currentStream();
      try { rec = mime ? new root.MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 32000 }) : new root.MediaRecorder(stream); }
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
        else { LT.state.update({ error: describe(e) }); LT._pauseUntil = Date.now() + 15000; }
        if (root.console) console.warn('[INDTV translate]', e && e.status, e && e.step, e && e.detail);
      }).then(function () { LT._busy = false; });
    },

    /** Settings "Save": checks the key, speech recognition and translation, and reports each step. */
    test: function () {
      var cfg = loadCfg();
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

  INDTV.LiveTranslate = LT;
})(typeof window !== 'undefined' ? window : globalThis);
