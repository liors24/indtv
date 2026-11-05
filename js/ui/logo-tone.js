/* INDTV — logo tone. Every channel logo sits in a disc whose colour suits that logo:
 *   - a logo with its own background → the disc takes that background colour (seamless),
 *   - a white / light logo on transparency → a deep disc,
 *   - a dark logo on transparency → a milky light disc,
 *   - not known yet → a milky mid-tone on which both white and dark logos stay readable.
 * The logo is measured once (24×24 pixels) and remembered on this TV. */
(function (root) {
  'use strict';
  var INDTV = root.INDTV = root.INDTV || {};
  var KEY = 'indtv:tones', MAX = 3000;
  var tones = {};
  try { tones = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { tones = {}; }
  var queue = [], busy = 0, waiting = {};
  var saveSoon = null;

  function save() {
    clearTimeout(saveSoon);
    saveSoon = setTimeout(function () {
      var keys = Object.keys(tones);
      if (keys.length > MAX) keys.slice(0, keys.length - MAX).forEach(function (k) { delete tones[k]; });
      try { localStorage.setItem(KEY, JSON.stringify(tones)); } catch (e) { /* full */ }
    }, 2000);
  }
  function hex(r, g, b) { return '#' + [r, g, b].map(function (v) { return ('0' + Math.round(v).toString(16)).slice(-2); }).join(''); }
  function lum(r, g, b) { return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; }

  /** Pixels → 'dark' | 'light' | '#rrggbb'. */
  function judge(px) {
    var n = px.length / 4, clear = 0, sumL = 0, wL = 0, i;
    for (i = 0; i < px.length; i += 4) {
      var a = px[i + 3] / 255;
      if (a < 0.15) { clear++; continue; }
      var l = lum(px[i], px[i + 1], px[i + 2]);
      sumL += l * a; wL += a;
    }
    if (clear / n > 0.12) {          // transparent background: judge the drawing itself
      var L = wL ? sumL / wL : 0.5;
      return L > 0.58 ? 'dark' : 'light';
    }
    // opaque image: use the colour of its border as the disc colour
    var size = Math.round(Math.sqrt(n)), r = 0, g = 0, b = 0, c = 0;
    for (var y = 0; y < size; y++) for (var x = 0; x < size; x++) {
      if (x > 0 && y > 0 && x < size - 1 && y < size - 1) continue;
      var j = (y * size + x) * 4;
      r += px[j]; g += px[j + 1]; b += px[j + 2]; c++;
    }
    return c ? hex(r / c, g / c, b / c) : 'light';
  }

  /** The logo is fetched as data (the Android app answers with CORS headers), so its pixels can be read. */
  function analyze(url) {
    busy++;
    var finish = function (tone) {
      busy--;
      if (tone) { tones[url] = tone; save(); }
      (waiting[url] || []).forEach(function (el) { Tone.paint(el, tone); });
      delete waiting[url];
      setTimeout(next, 30);
    };
    fetch(url, { credentials: 'omit' }).then(function (r) {
      if (!r.ok) throw new Error('http');
      return r.blob();
    }).then(function (blob) {
      var obj = URL.createObjectURL(blob), img = new Image();
      img.onload = function () {
        var tone = null;
        try {
          var cv = document.createElement('canvas');
          cv.width = cv.height = 24;
          var cx = cv.getContext('2d');
          cx.drawImage(img, 0, 0, 24, 24);
          tone = judge(cx.getImageData(0, 0, 24, 24).data);
        } catch (e) { tone = null; }
        URL.revokeObjectURL(obj);
        finish(tone);
      };
      img.onerror = function () { URL.revokeObjectURL(obj); finish(null); };
      img.src = obj;
    }).catch(function () { finish(null); });
  }
  function next() {
    while (busy < 3 && queue.length) analyze(queue.shift());
  }

  var Tone = {
    /** Give the logo element its disc colour (now if known, else after measuring). */
    mark: function (el, url) {
      if (!url) return;
      var t = tones[url];
      if (t) { Tone.paint(el, t); return; }
      if (!root.fetch || !root.URL || !URL.createObjectURL) return;
      if (waiting[url]) { waiting[url].push(el); return; }
      waiting[url] = [el];
      queue.push(url);
      next();
    },
    paint: function (el, t) {
      if (!t) return;
      if (t.charAt(0) === '#') { el.setAttribute('data-tone', 'own'); el.style.setProperty('--tone', t); }
      else el.setAttribute('data-tone', t);
    },
    _judge: judge
  };

  INDTV.LogoTone = Tone;
})(typeof window !== 'undefined' ? window : globalThis);
