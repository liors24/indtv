/* INDTV — core utilities. Classic script (no modules) for broad Smart TV browser support. */
(function (root) {
  'use strict';
  var INDTV = root.INDTV = root.INDTV || {};

  var Util = {};

  /** Strip control characters and clamp length. Playlist text is untrusted. */
  Util.cleanText = function (value, maxLen) {
    if (value === null || value === undefined) return '';
    var s = String(value).replace(/[\u0000-\u001F\u007F​-‏‪-‮﻿]/g, ' ');
    s = s.replace(/\s+/g, ' ').trim();
    if (maxLen && s.length > maxLen) s = s.slice(0, maxLen);
    return s;
  };

  /** Accept only absolute http(s) URLs of sane length. Returns null otherwise. */
  Util.safeHttpUrl = function (value, maxLen) {
    var s = Util.cleanText(value, maxLen || 4096);
    if (!s) return null;
    if (!/^https?:\/\/[^\s"'<>]+$/i.test(s)) return null;
    try {
      var u = new URL(s);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
      if (!u.hostname) return null;
      return u.href;
    } catch (e) {
      return null;
    }
  };

  /** Lowercase, drop quality/feed decorations and punctuation. Keeps non-Latin letters. */
  Util.normalizeName = function (value) {
    var s = Util.cleanText(value, 300).toLowerCase();
    s = s.replace(/\((\d{3,4}p|4k|hd|sd|fhd|uhd)\)/g, ' ');
    s = s.replace(/\[[^\]]*\]/g, ' ');
    s = s.replace(/[^\p{L}\p{N}]+/gu, '');
    return s;
  };

  /** Small, stable 32-bit string hash (FNV-1a) → base36. */
  Util.hash = function (str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(36);
  };

  Util.escapeHtml = function (s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };

  /** Hide any credentials in a URL before it is shown or logged. */
  Util.redactUrl = function (url) {
    try {
      var u = new URL(url);
      if (u.username || u.password) { u.username = '***'; u.password = ''; }
      var keys = [];
      u.searchParams.forEach(function (_, k) { keys.push(k); });
      keys.forEach(function (k) {
        if (/pass|pwd|token|key|auth|user|sig/i.test(k)) u.searchParams.set(k, '***');
      });
      return u.href;
    } catch (e) {
      return '[invalid url]';
    }
  };

  Util.el = function (tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'html') node.innerHTML = v;
        else if (k.indexOf('on') === 0 && typeof v === 'function') node.addEventListener(k.slice(2), v);
        else if (k === 'dataset') Object.keys(v).forEach(function (d) { node.dataset[d] = v[d]; });
        else node.setAttribute(k, v === true ? '' : v);
      });
    }
    if (children) {
      (Array.isArray(children) ? children : [children]).forEach(function (c) {
        if (c === null || c === undefined || c === false) return;
        node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      });
    }
    return node;
  };

  Util.debounce = function (fn, ms) {
    var t = null;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  };

  Util.fetchText = function (url, opts) {
    opts = opts || {};
    var timeoutMs = opts.timeoutMs || 20000;
    var maxBytes = opts.maxBytes || 20 * 1024 * 1024;
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () { if (controller) controller.abort(); }, timeoutMs);
    return fetch(url, { signal: controller ? controller.signal : undefined, cache: 'no-cache', credentials: 'omit' })
      .then(function (res) {
        if (!res.ok) {
          var err = new Error('HTTP ' + res.status);
          err.code = 'http';
          err.status = res.status;
          throw err;
        }
        var len = Number(res.headers.get('content-length') || 0);
        if (len && len > maxBytes) {
          var big = new Error('Response too large');
          big.code = 'too_large';
          throw big;
        }
        if (opts.gzip && typeof DecompressionStream !== 'undefined' && res.body) {
          return new Response(res.body.pipeThrough(new DecompressionStream('gzip'))).text();
        }
        return res.text();
      })
      .then(function (text) {
        clearTimeout(timer);
        if (text.length > maxBytes) {
          var big = new Error('Response too large');
          big.code = 'too_large';
          throw big;
        }
        return text;
      })
      .catch(function (e) {
        clearTimeout(timer);
        if (!e.code) {
          e.code = (typeof navigator !== 'undefined' && navigator.onLine === false) ? 'offline' : 'network';
        }
        throw e;
      });
  };

  Util.formatTime = function (date, lang) {
    try {
      return new Intl.DateTimeFormat(lang === 'he' ? 'he-IL' : 'en-GB', { hour: '2-digit', minute: '2-digit' }).format(date);
    } catch (e) {
      var d = new Date(date);
      return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
    }
  };

  Util.formatDuration = function (sec) {
    if (!isFinite(sec) || sec < 0) return '--:--';
    sec = Math.floor(sec);
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    var mm = (h ? ('0' + m).slice(-2) : String(m));
    return (h ? h + ':' : '') + mm + ':' + ('0' + s).slice(-2);
  };

  Util.timeAgo = function (ts, lang) {
    if (!ts) return '—';
    var diff = Math.max(0, Date.now() - ts) / 1000;
    var he = lang === 'he';
    if (diff < 60) return he ? 'הרגע' : 'just now';
    if (diff < 3600) { var m = Math.round(diff / 60); return he ? 'לפני ' + m + ' דק׳' : m + ' min ago'; }
    if (diff < 86400) { var h = Math.round(diff / 3600); return he ? 'לפני ' + h + ' שע׳' : h + ' h ago'; }
    var d = Math.round(diff / 86400);
    return he ? 'לפני ' + d + ' ימים' : d + ' d ago';
  };

  INDTV.Util = Util;
})(typeof window !== 'undefined' ? window : globalThis);
