/* Flixgram on Samsung TVs — remote start-up log (temporary, for finding why the app stops on the logo).
 * Sends short lines to a public ntfy.sh topic. No keys, codes or personal data are sent. */
(function () {
  var sid = Math.random().toString(36).slice(2, 7), t0 = Date.now(), sent = 0, last = Date.now();
  function flog(msg) {
    if (sent++ > 120) return;
    try {
      var x = new XMLHttpRequest();
      x.open('POST', 'https://ntfy.sh/flixgram-diag-l24tv', true);
      x.send('[' + sid + ' ' + ((Date.now() - t0) / 1000).toFixed(1) + 's] ' + String(msg).slice(0, 400));
    } catch (e) { /* offline */ }
  }
  window.flog = flog;
  window.onerror = function (msg, src, line, col) { flog('ERROR ' + msg + ' @' + String(src || '').split('/').pop() + ':' + line + ':' + col); };
  window.addEventListener('unhandledrejection', function (e) { var r = e.reason; flog('REJECT ' + (r && (r.message || r['@type'] && JSON.stringify(r).slice(0, 200)) || r)); });
  flog('start ' + navigator.userAgent + ' wasm=' + (typeof WebAssembly) + ' worker=' + (typeof Worker) + ' idb=' + (typeof indexedDB) + ' mse=' + (typeof MediaSource) + ' cores=' + navigator.hardwareConcurrency + ' mem=' + navigator.deviceMemory + ' heap=' + (performance.memory ? Math.round(performance.memory.jsHeapSizeLimit / 1048576) + 'MB' : '?') + ' ls=' + (function () { try { return localStorage.length; } catch (e) { return 'x'; } })());
  // heartbeat: shows whether the page keeps running and how much the main thread is held up
  var n = 0;
  var hb = setInterval(function () {
    var now = Date.now(), lag = now - last - 2000;
    last = now;
    n++;
    var intro = document.getElementById('intro');
    flog('beat ' + n + ' lag=' + lag + 'ms intro=' + (intro ? 1 : 0) + ' tdweb=' + (window.tdweb ? 1 : 0) + ' host=' + (window.NovaHost ? 1 : 0) + ' ui=' + (window.NOVA ? 1 : 0) + ' mode=' + ((document.getElementById('app') || {}).dataset || {}).mode);
    if (n >= 45) clearInterval(hb);
  }, 2000);
  document.addEventListener('DOMContentLoaded', function () { flog('dom ready'); });
  window.addEventListener('load', function () { flog('window load'); });
})();
