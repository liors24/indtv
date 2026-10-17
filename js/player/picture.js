/* INDTV — picture size (original / zoom / stretch / 16:9 / 4:3 / 21:9) and video quality.
 * A choice can be just for now, kept for one channel ("always for this channel"), or made the default for
 * every channel. Saved per profile. Works with both engines (the page's player and the TV's own engine). */
(function (root) {
  'use strict';
  var INDTV = root.INDTV = root.INDTV || {};
  var MODES = ['fit', 'zoom', 'fill', '16:9', '4:3', '21:9'];

  function key() { return 'pic:' + ((INDTV.Profiles && INDTV.Profiles.currentId()) || '_'); }
  function load() {
    var d = null;
    try { d = INDTV.Store.getSync(key()); } catch (e) { d = null; }
    d = d && typeof d === 'object' ? d : {};
    d.def = d.def && typeof d.def === 'object' ? d.def : {};
    d.ch = d.ch && typeof d.ch === 'object' ? d.ch : {};
    return d;
  }
  function save(d) { try { INDTV.Store.setSync(key(), d); } catch (e) { /* ignore */ } }
  function P() { return INDTV.Player; }
  function itemId() { var st = P().state.get(); return st.item && st.kind === 'channel' ? st.item.id : null; }

  var sess = { id: null, aspect: null, q: null };   // "just for now" choices for the item on screen
  function sessFor(id) { if (sess.id !== id) sess = { id: id, aspect: null, q: null }; return sess; }

  var Picture = {
    modes: MODES,
    /** What applies to the item on screen: now-choice → channel pin → default. */
    current: function () {
      var d = load(), id = itemId(), s = sessFor(id), pin = id ? d.ch[id] || {} : {};
      return {
        aspect: s.aspect || pin.aspect || d.def.aspect || 'fit',
        q: s.q !== null ? s.q : pin.q !== undefined ? pin.q : d.def.q || 0,
        pinnedAspect: !!(id && pin.aspect), pinnedQ: !!(id && pin.q !== undefined),
        defAspect: d.def.aspect || 'fit', defQ: d.def.q || 0
      };
    },
    /** kind: 'aspect' | 'q'. scope: 'now' | 'channel' | 'default'. */
    set: function (kind, value, scope) {
      var d = load(), id = itemId(), s = sessFor(id);
      if (scope === 'default') { d.def[kind] = value; s[kind] = null; }
      else if (scope === 'channel' && id) { d.ch[id] = d.ch[id] || {}; d.ch[id][kind] = value; s[kind] = null; }
      else s[kind] = value;
      // a pinned channel keeps following the new choice
      if (scope === 'now' && id && d.ch[id] && d.ch[id][kind] !== undefined) { d.ch[id][kind] = value; s[kind] = null; }
      save(d);
      Picture.apply();
      INDTV.Bus.emit('picture');
    },
    /** Pin / unpin the current choice for this channel. */
    pin: function (kind, on) {
      var d = load(), id = itemId();
      if (!id) return;
      var cur = Picture.current();
      if (on) { d.ch[id] = d.ch[id] || {}; d.ch[id][kind] = kind === 'aspect' ? cur.aspect : cur.q; }
      else if (d.ch[id]) { delete d.ch[id][kind]; if (!Object.keys(d.ch[id]).length) delete d.ch[id]; }
      sessFor(id)[kind] = null;
      if (!on) sessFor(id)[kind] = kind === 'aspect' ? cur.aspect : cur.q;
      save(d);
      INDTV.Bus.emit('picture');
    },

    /** Heights the stream offers (best first). */
    levels: function () {
      var p = P(), out = [];
      if (p.usingTvEngine && p.usingTvEngine()) out = (p._exoTracks || []).slice();
      else if (p.hls && p.hls.levels) p.hls.levels.forEach(function (l) { if (l.height && out.indexOf(l.height) < 0) out.push(l.height); });
      return out.sort(function (a, b) { return b - a; });
    },
    label: function (h) { return !h ? INDTV.I18n.t('qAuto') : h >= 2000 ? '4K' : h + 'p'; },

    apply: function () {
      var p = P(), c = Picture.current();
      var el = document.getElementById('player');
      if (el) el.setAttribute('data-aspect', c.aspect);
      if (p.usingTvEngine && p.usingTvEngine()) {
        try { root.INDTVNative.exoAspect(c.aspect); root.INDTVNative.exoQuality(c.q || 0); } catch (e) { /* ignore */ }
        return;
      }
      var hls = p.hls;
      if (hls && hls.levels && hls.levels.length > 1) {
        if (!c.q) { if (hls.autoLevelEnabled === false) hls.currentLevel = -1; return; }
        // the best level not above the chosen height (or the lowest one)
        var best = -1, bestH = 0, lowest = -1, lowH = 1e9;
        hls.levels.forEach(function (l, i) {
          if (l.height <= c.q && l.height > bestH) { best = i; bestH = l.height; }
          if (l.height < lowH) { lowest = i; lowH = l.height; }
        });
        var target = best >= 0 ? best : lowest;
        if (hls.currentLevel !== target) hls.currentLevel = target;
      }
    },
    /** Called when playback starts or the engine changes. */
    onStart: function () { Picture.apply(); }
  };

  INDTV.Picture = Picture;
})(typeof window !== 'undefined' ? window : globalThis);
