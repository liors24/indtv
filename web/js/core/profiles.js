/* INDTV — profiles. Anyone can register; there is no limit on the number of profiles.
 * Each profile keeps its own favourites, recently watched, followed shows, VOD progress and recordings.
 * Profiles live on this TV only (localStorage); nothing is sent anywhere. */
(function (root) {
  'use strict';
  var INDTV = root.INDTV = root.INDTV || {};
  var KEY = 'indtv:profiles';
  var LAST = 'indtv:lastProfile';
  var SCOPED_KEYS = ['favorites', 'recent', 'shows', 'vod:progress'];

  function read() {
    try { var v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; }
  }
  function write(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) { /* storage full */ }
  }
  function newId() {
    return 'p' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
  }

  var current = null;

  var Profiles = {
    list: read,
    get: function (id) { return read().filter(function (p) { return p.id === id; })[0] || null; },
    current: function () { return current; },
    currentId: function () { return current ? current.id : null; },
    lastId: function () { try { return localStorage.getItem(LAST); } catch (e) { return null; } },

    create: function (name, avatar) {
      var list = read();
      var p = { id: newId(), name: String(name || '').trim().slice(0, 24), avatar: avatar, createdAt: Date.now(), lastUsed: Date.now() };
      // the very first profile inherits whatever this TV had before profiles existed
      p.inherit = list.length === 0;
      list.push(p);
      write(list);
      return p;
    },

    update: function (id, patch) {
      var list = read();
      list.forEach(function (p) {
        if (p.id !== id) return;
        if (patch.name != null) p.name = String(patch.name).trim().slice(0, 24);
        if (patch.avatar) p.avatar = patch.avatar;
      });
      write(list);
      if (current && current.id === id) current = Profiles.get(id);
    },

    /** Removes the profile and everything it owned on this TV (its recordings included). */
    remove: function (id) {
      write(read().filter(function (p) { return p.id !== id; }));
      SCOPED_KEYS.forEach(function (k) { INDTV.Store.del('u:' + id + ':' + k); });
      try { if (localStorage.getItem(LAST) === id) localStorage.removeItem(LAST); } catch (e) { /* ignore */ }
      if (INDTV.DVR && INDTV.DVR.removeOwned) INDTV.DVR.removeOwned(id);
    },

    /** Activate a profile: every repository loaded after this reads that profile's data. */
    use: function (id) {
      var p = Profiles.get(id);
      if (!p) return Promise.resolve(null);
      current = p;
      INDTV.Store.setScope(p.id);
      try { localStorage.setItem(LAST, p.id); } catch (e) { /* ignore */ }
      var list = read();
      list.forEach(function (x) { if (x.id === p.id) x.lastUsed = Date.now(); });
      write(list);
      document.documentElement.setAttribute('data-profile', p.id);
      if (!p.inherit) return Promise.resolve(p);
      // copy pre-profile data into the first profile, once
      return Promise.all(SCOPED_KEYS.map(function (k) {
        return INDTV.Store.getRaw(k).then(function (v) {
          if (v === undefined) return null;
          return INDTV.Store.set(k, v);
        });
      })).then(function () {
        Profiles._clearInherit(p.id);
        return p;
      }, function () { return p; });
    },
    _clearInherit: function (id) {
      var list = read();
      list.forEach(function (x) { if (x.id === id) delete x.inherit; });
      write(list);
    },

    /** Recordings made before profiles existed belong to the first profile. */
    owns: function (rec) {
      if (!current) return true;
      if (rec.owner) return rec.owner === current.id;
      var first = read()[0];
      return !first || first.id === current.id;
    },

    /** Back to "Who's watching?" (a clean restart so no data from the previous profile stays in memory). */
    switchProfile: function () {
      var go = function () {
        try { sessionStorage.setItem('indtv:pick', '1'); } catch (e) { /* ignore */ }
        try { root.location.replace(new URL('index.html', root.location.href).href); } catch (e) { root.location.reload(); }
      };
      if (INDTV.DVR && INDTV.DVR.isRecording && INDTV.DVR.isRecording() && INDTV.UI && INDTV.UI.confirm) {
        INDTV.UI.confirm(INDTV.I18n.t('pfSwitchRecTitle'), INDTV.I18n.t('pfSwitchRecBody'), INDTV.I18n.t('pfSwitch'), go);
        return;
      }
      go();
    }
  };

  INDTV.Profiles = Profiles;
})(typeof window !== 'undefined' ? window : globalThis);
