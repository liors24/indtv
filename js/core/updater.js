/* INDTV — automatic updates. On every launch the app asks whether a newer build of INDTV was published;
 * if so it downloads it (one small file), keeps it, and applies it by itself: right away when nothing is
 * playing, otherwise the next time the app opens. Nothing to download or install by hand. */
(function (root) {
  'use strict';
  var INDTV = root.INDTV = root.INDTV || {};
  var URL_OTA = 'https://raw.githubusercontent.com/liors24/indtv/ota/bundle.json';

  function current() {
    var b = typeof root.INDTV_BUILD === 'number' ? root.INDTV_BUILD : 0, o = 0;
    try { var s = JSON.parse(localStorage.getItem('indtv:ota') || 'null'); o = s && s.build || 0; } catch (e) { o = 0; }
    var bad = parseInt(localStorage.getItem('indtv:ota-bad'), 10) || 0;   // a build that failed to start is never retried
    return Math.max(b, o, bad);
  }
  function playing() { var p = document.getElementById('player'); return !!(p && !p.hidden); }

  function restart() { try { root.location.replace(new URL('index.html', root.location.href).href); } catch (e) { root.location.reload(); } }

  var Updater = {
    build: function () { return current(); },
    check: function () {
      if (!INDTV_BUILD_OK()) return Promise.resolve(false);
      return fetch(URL_OTA + '?t=' + Date.now(), { cache: 'no-store', credentials: 'omit' })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function (b) {
          if (!b || !b.html || !(b.build > current()) || b.html.indexOf('INDTV') < 0) return false;
          localStorage.setItem('indtv:ota', JSON.stringify({ build: b.build, html: b.html }));
          localStorage.removeItem('indtv:ota-boot');
          Updater.apply();
          return true;
        })
        .catch(function () { return false; });   // offline or blocked: keep what is installed
    },
    /** Reload now if nothing is playing; otherwise wait for the player to close. */
    apply: function () {
      if (!playing()) { restart(); return; }
      INDTV.UI.toast(INDTV.I18n.lang() === 'he' ? 'יצאה גרסה חדשה — תותקן כשתסגרו את הנגן' : 'New version ready — it will apply when you close the player');
      var iv = setInterval(function () { if (!playing()) { clearInterval(iv); restart(); } }, 3000);
    }
  };
  function INDTV_BUILD_OK() { return typeof root.fetch === 'function' && typeof root.localStorage !== 'undefined'; }

  INDTV.Updater = Updater;
})(typeof window !== 'undefined' ? window : globalThis);
