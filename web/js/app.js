/* INDTV — boot. Splash → cached catalog → background playlist refresh → Home. */
(function (root) {
  'use strict';
  var INDTV = root.INDTV;

  function withTimeout(p, ms) {
    return Promise.race([p, new Promise(function (r) { setTimeout(r, ms); })]);
  }

  function registerScreens() {
    var R = INDTV.Router;
    R.register('home', INDTV.HomeScreen);
    R.register('live', INDTV.LiveScreen);
    R.register('movies', INDTV.MoviesScreen);
    R.register('shows', INDTV.ShowsScreen);
    R.register('kids', INDTV.KidsScreen);
    R.register('news', INDTV.NewsScreen);
    R.register('favorites', INDTV.FavoritesScreen);
    R.register('settings', INDTV.SettingsScreen);
    R.register('search', INDTV.SearchScreen);
    Object.keys(R.screens).forEach(function (k) {
      R.screens[k].el = document.getElementById('screen-' + k);
    });
  }

  function boot() {
    if (root.INDTVNative) document.documentElement.classList.add('is-native');
    INDTV.I18n.applyDir();
    INDTV.Focus.start();
    INDTV.Router.start();
    registerScreens();

    // 1. Local data only (IndexedDB). Capped so a slow storage layer never holds the splash.
    var local = Promise.all([
      INDTV.PlaylistRepository.init(),
      INDTV.FavoritesRepository.load(),
      INDTV.RecentRepository.load(),
      INDTV.EpgRepository.load()
    ]).then(function () { return INDTV.VodRepository.load(); });

    withTimeout(local, 900).then(function () {
      // 2. Start the playlist refresh in the background; the splash does not wait for it.
      if (INDTV.PlaylistRepository.shouldAutoRefresh()) INDTV.PlaylistRepository.refresh();
      var st = INDTV.EpgRepository.state.get();
      if (st.url && Date.now() - (st.fetchedAt || 0) > 6 * 3600000) INDTV.EpgRepository.refresh();
      INDTV.PlaylistRepository.startBackgroundPolicy();

      // 3. Build the shell under the splash so Home is ready the moment it lifts.
      INDTV.Router.buildChrome();
      INDTV.PlayerScreen.build();
      var tab = INDTV.Router.initialTab();
      INDTV.Router.go(tab);
      var splash = INDTV.Splash.show(1700);
      return splash.then(function () {
        document.documentElement.classList.add('is-ready');
        INDTV.Router.focusNav(tab);
      });
    });

    INDTV.Bus.on('lang', function () {
      var focusedKey = document.activeElement && document.activeElement.getAttribute('data-key');
      INDTV.Router.buildChrome();
      if (focusedKey) INDTV.Focus.restore(focusedKey);
    });

    // Top bar turns solid once the current screen scrolls under it.
    document.addEventListener('scroll', function (e) {
      var t = e.target;
      if (t && t.classList && t.classList.contains('vscroll') && !t.closest('[hidden]')) {
        document.documentElement.classList.toggle('is-scrolled', t.scrollTop > 24);
      }
    }, true);
    INDTV.Bus.on('tab', function () {
      var s = document.querySelector('.screen:not([hidden]) .vscroll');
      document.documentElement.classList.toggle('is-scrolled', !!s && s.scrollTop > 24);
    });

    // keep relative times and programme progress fresh without re-fetching
    setInterval(function () { INDTV.Bus.emit('epg'); }, 5 * 60 * 1000);

    // Android TV app shell: remote keys the WebView does not deliver (Back, channel, media) arrive here.
    root.INDTVKey = function (key) {
      var target = document.activeElement || document.body;
      target.dispatchEvent(new KeyboardEvent('keydown', { key: key, bubbles: true, cancelable: true }));
      return 'ok';
    };

    if (!root.INDTVNative && 'serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      navigator.serviceWorker.register('sw.js').catch(function () { /* optional */ });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
