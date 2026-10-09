/* INDTV — D-pad focus engine.
 * Geometric spatial navigation across elements marked .fx, with per-group focus memory,
 * remote key mapping (Tizen, webOS, Android TV, keyboards) and Back handling. */
(function (root) {
  'use strict';
  var INDTV = root.INDTV = root.INDTV || {};

  var KEY = {
    LEFT: [37, 'ArrowLeft', 'Left'], UP: [38, 'ArrowUp', 'Up'], RIGHT: [39, 'ArrowRight', 'Right'], DOWN: [40, 'ArrowDown', 'Down'],
    OK: [13, 'Enter', 'Accept', 'Select', 'NumpadEnter'],
    BACK: [10009, 461, 27, 'Escape', 'GoBack', 'BrowserBack', 'Back', 'XF86Back'],
    PLAY: [415, 'MediaPlay'], PAUSE: [19, 'MediaPause'], PLAYPAUSE: [10252, 179, 'MediaPlayPause'],
    STOP: [413, 'MediaStop'], FF: [417, 'MediaFastForward'], RW: [412, 'MediaRewind'],
    CH_UP: [427, 33, 'ChannelUp', 'PageUp'], CH_DOWN: [428, 34, 'ChannelDown', 'PageDown']
  };
  function match(e, list) {
    return list.indexOf(e.keyCode) >= 0 || list.indexOf(e.key) >= 0;
  }

  var Focus = {
    scope: null,            // element limiting navigation (e.g. player overlay or modal)
    _memory: {},            // group id -> last focused element
    handlers: [],           // stack of {onBack, onKey}
    _lastMove: 0,

    isVisible: function (el) {
      if (!el || !el.isConnected) return false;
      if (el.disabled) return false;
      var r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return false;
      var cs = root.getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') return false;
      // inside a hidden ancestor?
      return el.offsetParent !== null || cs.position === 'fixed';
    },

    candidates: function () {
      var scope = Focus.scope || document;
      var list = scope.querySelectorAll('.fx');
      var out = [];
      for (var i = 0; i < list.length; i++) {
        var el = list[i];
        if (el.closest('[hidden]') || el.closest('[aria-hidden="true"]')) continue;
        if (Focus.isVisible(el)) out.push(el);
      }
      return out;
    },

    current: function () {
      var a = document.activeElement;
      return a && a.classList && a.classList.contains('fx') ? a : null;
    },

    focus: function (el, opts) {
      if (!el) return false;
      opts = opts || {};
      try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); }
      var g = el.closest('[data-fgroup]');
      if (g) Focus._memory[g.getAttribute('data-fgroup')] = el;
      if (!opts.noScroll) Focus.reveal(el);
      return true;
    },

    /** Keep the focused element visible: horizontal inside rails, vertical inside the screen scroller. */
    reveal: function (el) {
      var track = el.closest('.rail-track, .hscroll');
      if (track) {
        var tr = track.getBoundingClientRect(), r = el.getBoundingClientRect();
        var pad = parseFloat(root.getComputedStyle(document.documentElement).fontSize) * 2.2;
        var dx = 0;
        if (r.left < tr.left + pad) dx = r.left - tr.left - pad;
        else if (r.right > tr.right - pad) dx = r.right - tr.right + pad;
        if (dx) track.scrollBy({ left: dx, behavior: Focus.smooth() });
      }
      var scroller = el.closest('.vscroll');
      if (scroller) {
        var anchor = el.closest('[data-row]') || el;
        var sr = scroller.getBoundingClientRect(), ar = anchor.getBoundingClientRect();
        var top = parseFloat(scroller.getAttribute('data-top-offset') || '0') *
          parseFloat(root.getComputedStyle(document.documentElement).fontSize);
        var dy = 0;
        if (anchor.hasAttribute('data-row-top')) {
          dy = ar.top - sr.top - top;
        } else if (ar.top < sr.top + top) dy = ar.top - sr.top - top;
        else if (ar.bottom > sr.bottom - 16) dy = ar.bottom - sr.bottom + 16 + (ar.height < sr.height * 0.4 ? sr.height * 0.12 : 0);
        if (Math.abs(dy) > 1) scroller.scrollBy({ top: dy, behavior: Focus.smooth() });
      }
    },

    smooth: function () {
      return root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    },

    /** Move focus in a direction. Returns true when focus moved. */
    move: function (dir) {
      var cur = Focus.current();
      var all = Focus.candidates();
      if (!cur) { return Focus.focus(Focus.defaultTarget() || all[0]); }

      // A container can override geometric navigation (e.g. keep Up inside a list).
      var stop = cur.getAttribute('data-stop-' + dir);
      if (stop === 'true') return false;
      var explicit = cur.getAttribute('data-nav-' + dir);
      if (explicit) {
        var target = document.querySelector(explicit);
        if (target && Focus.isVisible(target)) return Focus.focus(Focus.remembered(target) || target);
      }

      var cr = cur.getBoundingClientRect();
      var cx = cr.left + cr.width / 2, cy = cr.top + cr.height / 2;
      var curGroup = cur.closest('[data-fgroup]');

      // Lists declare an axis: moving along it stays inside the list (e.g. SideRail Up/Down
      // never jumps into the hero). data-flock also forbids leaving the list along that axis.
      var axisGroup = cur.closest('[data-faxis]');
      if (axisGroup) {
        var ax = axisGroup.getAttribute('data-faxis');
        var along = (ax === 'v' && (dir === 'up' || dir === 'down')) || (ax === 'h' && (dir === 'left' || dir === 'right'));
        if (along) {
          var inside = all.filter(function (el) { return axisGroup.contains(el); });
          var hit = Focus._pick(dir, cur, cr, cx, cy, inside);
          if (hit) return Focus.focus(hit);
          if (axisGroup.hasAttribute('data-flock')) return false;
        }
      }
      var best = Focus._pick(dir, cur, cr, cx, cy, all);
      if (!best) return false;

      // Entering another group: return to that group's last focused item when it lies the same way.
      var bestGroup = best.closest('[data-fgroup]');
      if (bestGroup && bestGroup !== curGroup) {
        var mem = Focus.remembered(bestGroup);
        if (mem && mem !== best) {
          var mr = mem.getBoundingClientRect();
          var mcx = mr.left + mr.width / 2, mcy = mr.top + mr.height / 2;
          var sameWay = (dir === 'down' && mcy > cy) || (dir === 'up' && mcy < cy) ||
            (dir === 'left' && mcx < cx) || (dir === 'right' && mcx > cx);
          var visible = mr.right > 0 && mr.left < root.innerWidth;
          if (sameWay && visible && bestGroup.hasAttribute('data-fmemory')) best = mem;
        }
      }
      return Focus.focus(best);
    },

    _pick: function (dir, cur, cr, cx, cy, all) {
      var best = null, bestScore = Infinity;
      for (var i = 0; i < all.length; i++) {
        var el = all[i];
        if (el === cur) continue;
        var r = el.getBoundingClientRect();
        var ex = r.left + r.width / 2, ey = r.top + r.height / 2;
        var primary, secondary, overlap;
        if (dir === 'right') {
          if (r.left < cr.right - 6 && ex <= cx + 1) continue;
          if (ex <= cx + 1) continue;
          primary = Math.max(0, r.left - cr.right);
          overlap = Math.min(r.bottom, cr.bottom) - Math.max(r.top, cr.top);
          secondary = overlap > 0 ? 0 : Math.abs(ey - cy);
        } else if (dir === 'left') {
          if (ex >= cx - 1) continue;
          primary = Math.max(0, cr.left - r.right);
          overlap = Math.min(r.bottom, cr.bottom) - Math.max(r.top, cr.top);
          secondary = overlap > 0 ? 0 : Math.abs(ey - cy);
        } else if (dir === 'down') {
          if (ey <= cy + 1 || r.top < cr.top + cr.height * 0.5) continue;
          primary = Math.max(0, r.top - cr.bottom);
          overlap = Math.min(r.right, cr.right) - Math.max(r.left, cr.left);
          secondary = overlap > 0 ? 0 : Math.min(Math.abs(r.left - cr.left), Math.abs(ex - cx));
        } else {
          if (ey >= cy - 1 || r.bottom > cr.bottom - cr.height * 0.5) continue;
          primary = Math.max(0, cr.top - r.bottom);
          overlap = Math.min(r.right, cr.right) - Math.max(r.left, cr.left);
          secondary = overlap > 0 ? 0 : Math.min(Math.abs(r.left - cr.left), Math.abs(ex - cx));
        }
        var score = primary + secondary * 2.2;
        if (score < bestScore) { bestScore = score; best = el; }
      }
      return best;
    },

    remembered: function (groupEl) {
      var key = groupEl.getAttribute && groupEl.getAttribute('data-fgroup');
      var el = key ? Focus._memory[key] : null;
      return el && el.isConnected && Focus.isVisible(el) ? el : null;
    },

    defaultTarget: function () {
      var scope = Focus.scope || document;
      return scope.querySelector('.fx[data-default]:not([hidden])') || null;
    },

    /** Restore focus after a re-render using data-key. */
    restore: function (key, container) {
      if (!key) return false;
      var el = (container || document).querySelector('.fx[data-key="' + cssEscape(key) + '"]');
      return el ? Focus.focus(el, { noScroll: true }) : false;
    },

    pushHandler: function (h) { Focus.handlers.push(h); return function () { Focus.popHandler(h); }; },
    popHandler: function (h) { var i = Focus.handlers.indexOf(h); if (i >= 0) Focus.handlers.splice(i, 1); },

    onKeyDown: function (e) {
      var top = Focus.handlers[Focus.handlers.length - 1];
      var t = e.target;
      var typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') && t.type !== 'checkbox' && t.type !== 'range' && t.type !== 'file';

      if (match(e, KEY.BACK) || (e.keyCode === 8 && !typing)) {
        e.preventDefault();
        if (typing && (e.keyCode === 27 || e.key === 'Escape')) { t.blur(); Focus.focus(t); }
        if (top && top.onBack && top.onBack(e) !== false) return;
        INDTV.Router.back();
        return;
      }
      if (top && top.onKey && top.onKey(e, KEY, match) === true) { e.preventDefault(); return; }

      var dir = match(e, KEY.LEFT) ? 'left' : match(e, KEY.RIGHT) ? 'right' : match(e, KEY.UP) ? 'up' : match(e, KEY.DOWN) ? 'down' : null;
      if (dir) {
        if (typing) {
          // Left/right edit text until the caret reaches an edge; up/down always leave the field.
          if (dir === 'left' || dir === 'right') {
            var atStart = t.selectionStart === 0 && t.selectionEnd === 0;
            var atEnd = t.selectionStart === t.value.length;
            var rtl = document.documentElement.dir === 'rtl';
            var leaving = (dir === 'left') !== rtl ? atStart : atEnd;
            if (!leaving) return;
          }
          if (t.tagName === 'TEXTAREA' && (dir === 'up' || dir === 'down')) {
            var lineBefore = t.value.slice(0, t.selectionStart).indexOf('\n') >= 0;
            var lineAfter = t.value.slice(t.selectionEnd).indexOf('\n') >= 0;
            if ((dir === 'up' && lineBefore) || (dir === 'down' && lineAfter)) return;
          }
        }
        e.preventDefault();
        document.documentElement.classList.add('kbd');
        Focus.move(dir);
        return;
      }
      if (match(e, KEY.OK)) {
        if (typing) return;
        var cur = Focus.current();
        if (cur) {
          e.preventDefault();
          if (cur.tagName === 'INPUT' && (cur.type === 'checkbox')) { cur.click(); return; }
          if (cur.tagName === 'INPUT' || cur.tagName === 'TEXTAREA' || cur.tagName === 'SELECT') { cur.focus(); return; }
          cur.click();
        } else {
          Focus.move('down');
        }
      }
    },

    start: function () {
      document.addEventListener('keydown', Focus.onKeyDown, true);
      // Mouse / pointer remotes (LG Magic Remote) move focus too.
      document.addEventListener('mouseover', function (e) {
        var el = e.target && e.target.closest ? e.target.closest('.fx') : null;
        if (el && el !== document.activeElement && Focus.isVisible(el) && (!Focus.scope || Focus.scope.contains(el))) {
          document.documentElement.classList.remove('kbd');
          Focus.focus(el, { noScroll: true });
        }
      });
      document.addEventListener('focusin', function (e) {
        var el = e.target;
        if (el && el.classList && el.classList.contains('fx')) {
          var g = el.closest('[data-fgroup]');
          if (g) Focus._memory[g.getAttribute('data-fgroup')] = el;
        }
      });
    },
    KEY: KEY,
    match: match
  };

  function cssEscape(s) {
    return root.CSS && root.CSS.escape ? root.CSS.escape(s) : String(s).replace(/["\\]/g, '\\$&');
  }

  INDTV.Focus = Focus;
})(typeof window !== 'undefined' ? window : globalThis);
