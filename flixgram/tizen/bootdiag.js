/* Start-up diagnostics on Samsung TVs, independent of the rest of the app: while the intro is showing,
 * a small line at the bottom tells the version, seconds since start, which parts loaded and any error. */
(function () {
  var t0 = Date.now(), errs = [];
  window.onerror = function (msg, src, line) { errs.push(String(msg).slice(0, 90) + (src ? ' @' + String(src).split('/').pop() + ':' + line : '')); };
  window.addEventListener('unhandledrejection', function (e) { var r = e.reason; errs.push('promise: ' + String(r && (r.message || r['@type'] && JSON.stringify(r)) || r).slice(0, 90)); });
  var iv = setInterval(function () {
    var intro = document.getElementById('intro');
    if (!document.body) return;
    if (!intro) { clearInterval(iv); var d0 = document.getElementById('bootdiag'); if (d0) d0.remove(); return; }
    var mark = document.getElementById('bootver');
    if (mark) mark.textContent = 'Flixgram ' + (window.FLIX_BUILD || '?') + ' · js';
    var d = document.getElementById('bootdiag');
    if (!d) {
      d = document.createElement('div');
      d.id = 'bootdiag';
      d.style.cssText = 'position:fixed;left:0;right:0;bottom:3vh;z-index:200;text-align:center;font:1.4vw/1.5 sans-serif;color:rgba(255,255,255,.55);direction:ltr';
      document.body.appendChild(d);
    }
    var parts = ['v' + (window.FLIX_BUILD || '?'), Math.round((Date.now() - t0) / 1000) + 's',
      'td:' + (window.tdweb ? 1 : 0), 'mp4:' + (window.MP4Box ? 1 : 0), 'host:' + (window.NovaHost ? 1 : 0), 'ui:' + (window.NOVA ? 1 : 0),
      'stage:' + (window.FLIX_STAGE || '-')];
    d.textContent = parts.join('  ') + (errs.length ? '  |  ' + errs.slice(-2).join('  |  ') : '');
  }, 1000);
})();
