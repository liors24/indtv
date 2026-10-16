/* INDTV — event bus, observable state, persistent key/value store (IndexedDB → localStorage → memory). */
(function (root) {
  'use strict';
  var INDTV = root.INDTV = root.INDTV || {};

  /* ---------- Event bus ---------- */
  var listeners = {};
  INDTV.Bus = {
    on: function (evt, fn) {
      (listeners[evt] = listeners[evt] || []).push(fn);
      return function () { INDTV.Bus.off(evt, fn); };
    },
    off: function (evt, fn) {
      var l = listeners[evt];
      if (!l) return;
      var i = l.indexOf(fn);
      if (i >= 0) l.splice(i, 1);
    },
    emit: function (evt, payload) {
      (listeners[evt] || []).slice().forEach(function (fn) {
        try { fn(payload); } catch (e) { if (root.console) console.error('[INDTV bus]', evt, e); }
      });
    }
  };

  /* ---------- Observable state (StateFlow analogue) ---------- */
  function StateFlow(initial) {
    this._value = initial;
    this._subs = [];
  }
  StateFlow.prototype.get = function () { return this._value; };
  StateFlow.prototype.set = function (next) {
    this._value = next;
    this._subs.slice().forEach(function (fn) {
      try { fn(next); } catch (e) { if (root.console) console.error('[INDTV state]', e); }
    });
  };
  StateFlow.prototype.update = function (patch) {
    var next = {};
    var cur = this._value || {};
    Object.keys(cur).forEach(function (k) { next[k] = cur[k]; });
    Object.keys(patch).forEach(function (k) { next[k] = patch[k]; });
    this.set(next);
  };
  StateFlow.prototype.subscribe = function (fn, emitNow) {
    this._subs.push(fn);
    if (emitNow !== false) fn(this._value);
    var self = this;
    return function () {
      var i = self._subs.indexOf(fn);
      if (i >= 0) self._subs.splice(i, 1);
    };
  };
  INDTV.StateFlow = StateFlow;

  /* ---------- Persistent KV store ---------- */
  var DB_NAME = 'indtv';
  var DB_STORE = 'kv';
  var LS_PREFIX = 'indtv:';
  var memory = {};
  var dbPromise = null;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve) {
      try {
        if (!root.indexedDB) return resolve(null);
        var req = root.indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = function () {
          var db = req.result;
          if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
        };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { resolve(null); };
        req.onblocked = function () { resolve(null); };
        setTimeout(function () { resolve(null); }, 3000);
      } catch (e) {
        resolve(null);
      }
    });
    return dbPromise;
  }

  function lsGet(key) {
    try {
      var raw = root.localStorage.getItem(LS_PREFIX + key);
      return raw === null ? undefined : JSON.parse(raw);
    } catch (e) {
      return memory[key];
    }
  }
  function lsSet(key, value) {
    try {
      root.localStorage.setItem(LS_PREFIX + key, JSON.stringify(value));
    } catch (e) {
      memory[key] = value;
    }
  }
  function lsDel(key) {
    try { root.localStorage.removeItem(LS_PREFIX + key); } catch (e) { /* ignore */ }
    delete memory[key];
  }

  /* Per-profile data: these keys are stored separately for every profile (see js/core/profiles.js). */
  var SCOPED = { favorites: 1, recent: 1, shows: 1, 'vod:progress': 1 };
  var scope = null;
  function sk(key) { return scope && SCOPED[key] ? 'u:' + scope + ':' + key : key; }

  INDTV.Store = {
    setScope: function (profileId) { scope = profileId || null; },
    scope: function () { return scope; },
    scopedKey: sk,
    get: function (key) {
      key = sk(key);
      return openDb().then(function (db) {
        if (!db) return lsGet(key);
        return new Promise(function (resolve) {
          try {
            var tx = db.transaction(DB_STORE, 'readonly');
            var r = tx.objectStore(DB_STORE).get(key);
            r.onsuccess = function () { resolve(r.result === undefined ? lsGet(key) : r.result); };
            r.onerror = function () { resolve(lsGet(key)); };
          } catch (e) {
            resolve(lsGet(key));
          }
        });
      });
    },
    set: function (key, value) {
      key = sk(key);
      return openDb().then(function (db) {
        if (!db) return lsSet(key, value);
        return new Promise(function (resolve) {
          try {
            var tx = db.transaction(DB_STORE, 'readwrite');
            tx.objectStore(DB_STORE).put(value, key);
            tx.oncomplete = function () { resolve(); };
            tx.onerror = function () { lsSet(key, value); resolve(); };
          } catch (e) {
            lsSet(key, value);
            resolve();
          }
        });
      });
    },
    del: function (key) {
      key = sk(key);
      lsDel(key);
      return openDb().then(function (db) {
        if (!db) return;
        return new Promise(function (resolve) {
          try {
            var tx = db.transaction(DB_STORE, 'readwrite');
            tx.objectStore(DB_STORE).delete(key);
            tx.oncomplete = function () { resolve(); };
            tx.onerror = function () { resolve(); };
          } catch (e) { resolve(); }
        });
      });
    },
    /** Unscoped access, used once to move pre-profile data into the first profile. */
    getRaw: function (key) { var prev = scope; scope = null; var p = INDTV.Store.get(key); scope = prev; return p; },
    /** Synchronous small-preference access (language etc.) so first paint is correct. */
    getSync: lsGet,
    setSync: lsSet
  };
})(typeof window !== 'undefined' ? window : globalThis);
