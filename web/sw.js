/* INDTV service worker.
 * App shell: network first, cached copy when offline (so an update is picked up on the next load).
 * Channel logos (tvg-logo images): cache first, capped — the disk cache for logos.
 * Playlists, guide data and video streams are never touched here. */
var SHELL = 'indtv-shell-v5';
var LOGOS = 'indtv-logos-v1';
var LOGO_LIMIT = 500;
var SHELL_FILES = [
  './', 'index.html', 'app.html', 'css/app.css', 'manifest.webmanifest', 'assets/icons/favicon.svg', 'assets/icons/icon-192.png',
  'js/core/util.js', 'js/core/updater.js', 'js/core/store.js', 'js/core/i18n.js', 'js/data/m3u-parser.js', 'js/data/repositories.js',
  'js/data/epg-vod.js', 'js/data/shows.js', 'js/player/player-controller.js', 'js/player/live-translate.js', 'js/ui/icons.js', 'js/ui/focus.js', 'js/ui/edit-dock.js', 'js/ui/components.js',
  'js/ui/router.js', 'js/ui/screens/splash.js', 'js/ui/screens/home.js', 'js/ui/screens/live.js', 'js/ui/screens/grids.js',
  'js/ui/screens/search.js', 'js/ui/screens/settings.js', 'js/ui/screens/player-screen.js', 'js/app.js'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(SHELL).then(function (c) { return c.addAll(SHELL_FILES); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== SHELL && k !== LOGOS; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function trim(cache) {
  return cache.keys().then(function (keys) {
    if (keys.length <= LOGO_LIMIT) return;
    return Promise.all(keys.slice(0, keys.length - LOGO_LIMIT).map(function (k) { return cache.delete(k); }));
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);

  if (url.origin === self.location.origin) {
    e.respondWith(fetch(req).then(function (res) {
      if (res.ok) { var copy = res.clone(); caches.open(SHELL).then(function (c) { c.put(req, copy); }); }
      return res;
    }).catch(function () {
      return caches.match(req, { ignoreSearch: true }).then(function (hit) { return hit || caches.match('index.html'); });
    }));
    return;
  }

  if (req.destination === 'image') {
    e.respondWith(caches.open(LOGOS).then(function (cache) {
      return cache.match(req).then(function (hit) {
        if (hit) return hit;
        return fetch(req).then(function (res) {
          // opaque responses are fine for <img>; store successful ones only
          if (res.ok || res.type === 'opaque') { cache.put(req, res.clone()).then(function () { trim(cache); }); }
          return res;
        });
      });
    }));
  }
});
