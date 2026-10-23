/* Flixgram on Samsung TVs: loads the interface into this page (no second page, no inline markup).
 * A newer interface downloaded earlier (tizen/host/main.js, "flix:ota2") is used when it fits this
 * installed package; if it can't run, or failed to start twice, the installed files are used. */
(function () {
  var ota = null;
  try { ota = JSON.parse(localStorage.getItem('flix:ota2') || 'null'); } catch (e) { ota = null; }
  var tried = 0;
  try { tried = parseInt(localStorage.getItem('flix:ota-boot'), 10) || 0; } catch (e) { tried = 0; }
  var use = !!(ota && ota.host && ota.app && ota.css && ota.build > window.FLIX_BUILD && ota.tdweb === window.FLIX_TDWEB);
  if (use && tried >= 2) {
    try { localStorage.setItem('flix:ota-bad', String(ota.build)); localStorage.removeItem('flix:ota2'); localStorage.removeItem('flix:ota-boot'); } catch (e) { /* ignore */ }
    use = false;
  }
  function ext(src, next) {
    var s = document.createElement('script');
    s.src = src;
    s.async = false;
    s.onload = s.onerror = function () { if (next) next(); };
    document.body.appendChild(s);
  }
  function code(text) {
    var s = document.createElement('script');
    s.text = text;
    document.body.appendChild(s);
  }
  function packaged() { ext('host.js', function () { ext('app.js'); }); }
  ext('tdweb.js', function () {
    ext('mp4box.min.js', function () {
      if (!use) { packaged(); return; }
      try { localStorage.setItem('flix:ota-boot', String(tried + 1)); } catch (e) { /* ignore */ }
      var st = document.createElement('style');
      st.textContent = ota.css;
      document.head.appendChild(st);
      var packagedBuild = window.FLIX_BUILD;
      window.FLIX_BUILD = ota.build;
      code(ota.host);
      if (!window.NovaHost) {
        // this TV doesn't run downloaded code: stay on the installed interface
        try { localStorage.setItem('flix:ota-bad', String(ota.build)); localStorage.removeItem('flix:ota2'); } catch (e) { /* ignore */ }
        st.parentNode.removeChild(st);
        window.FLIX_BUILD = packagedBuild;
        packaged();
        return;
      }
      code(ota.app);
    });
  });
})();
