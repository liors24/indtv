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
    R.register('categories', INDTV.CategoriesScreen);
    R.register('catchup', INDTV.CatchUpScreen);
    R.register('favorites', INDTV.FavoritesScreen);
    R.register('recordings', INDTV.RecordingsScreen);
    R.register('settings', INDTV.SettingsScreen);
    Object.keys(R.screens).forEach(function (k) {
      R.screens[k].el = document.getElementById('screen-' + k);
    });
  }

  function boot() {
    if (root.INDTVNative) document.documentElement.classList.add('is-native');
    // Samsung Tizen app: ask the TV to deliver the remote's media and channel keys to INDTV.
    if (root.tizen && root.tizen.tvinputdevice) {
      document.documentElement.classList.add('is-tizen', 'is-native');
      ['MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaStop', 'MediaFastForward', 'MediaRewind',
        'ChannelUp', 'ChannelDown', 'ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue'].forEach(function (k) {
        try { root.tizen.tvinputdevice.registerKey(k); } catch (e) { /* key not on this model */ }
      });
    }
    INDTV.I18n.applyDir();
    INDTV.Display.apply();
    INDTV.Focus.start();
    INDTV.EditDock.start();
    INDTV.Router.start();
    registerScreens();

    root.INDTVKey = function (key) {
      var target = document.activeElement || document.body;
      target.dispatchEvent(new KeyboardEvent('keydown', { key: key, bubbles: true, cancelable: true }));
      return 'ok';
    };

    // 0. "Who's watching?" — every person gets their own favourites, history and recordings.
    INDTV.ProfileGate.open().then(function (p) {
      try { localStorage.removeItem('indtv:ota-boot'); } catch (e) { /* ignore */ }
      start(p);
    });
    try { localStorage.removeItem('indtv:ota-boot'); } catch (e) { /* the gate rendered: this bundle runs */ }
  }

  function start() {
    // 1. Local data only (IndexedDB). Capped so a slow storage layer never holds the splash.
    var local = Promise.all([
      INDTV.PlaylistRepository.init(),
      INDTV.FavoritesRepository.load(),
      INDTV.RecentRepository.load(),
      INDTV.EpgRepository.load(),
      INDTV.ShowFavorites.load(),
      INDTV.Categories.load(),
      INDTV.StreamScan.load()
    ]).then(function () { return INDTV.VodRepository.load(); });

    withTimeout(local, 900).then(function () {
      // 2. Start the playlist refresh in the background; the splash does not wait for it.
      if (INDTV.PlaylistRepository.shouldAutoRefresh()) INDTV.PlaylistRepository.refresh();
      // Programme guide: downloaded and parsed in the background once Home is up (never blocks the UI).
      setTimeout(function () { INDTV.EpgRepository.ensureFresh(); }, 3500);
      INDTV.ShowFavorites.startWatcher();
      INDTV.StreamScan.start();
      if (INDTV.DVR) INDTV.DVR.load();
      INDTV.PlaylistRepository.startBackgroundPolicy();

      // 3. Build the shell under the splash so Home is ready the moment it lifts.
      INDTV.Router.buildChrome();
      INDTV.PlayerScreen.build();
      var tab = INDTV.Router.initialTab();
      INDTV.Router.go(tab);
      var splash = INDTV.Splash.show(1100);
      return splash.then(function () {
        document.documentElement.classList.add('is-ready');
        INDTV.Router.focusNav(tab);
        try { localStorage.removeItem('indtv:ota-boot'); } catch (e) { /* ignore */ }   // this bundle started fine
        setTimeout(function () { INDTV.Updater.check(); }, 4000);
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
