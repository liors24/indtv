// Spatial navigation for D-pad remotes.
// Focusable elements carry class "fx". Optional hooks on the element:
//   el._onselect(), el._onfocus(), el._onblur(), el._onkey(dir) -> true to consume
// Containers may carry data-fgroup to remember the last focused child (rails, lists).
// Scrolling containers: .rail (horizontal track = .rail-track) and [data-vscroll] (vertical).

import { $$ } from './util.js';

let current = null;
const scopes = []; // stack of root elements (screen, then modals)
const groupMemory = new WeakMap();
// layout is authored at 1920 design px; convert design px to real px
const k = () => window.innerWidth / 1920;

export function pushScope(el, initial) {
  scopes.push(el);
  focusFirst(el, initial);
}

export function popScope(el) {
  const i = scopes.lastIndexOf(el);
  if (i >= 0) scopes.splice(i, 1);
  const top = scopes[scopes.length - 1];
  if (top) {
    const remembered = top._lastFocus;
    if (remembered && top.contains(remembered) && visible(remembered)) focus(remembered, true);
    else focusFirst(top);
  }
}

export function setRootScope(el, initial, noFocus) {
  scopes.length = 0;
  scopes.push(el);
  if (!noFocus) focusFirst(el, initial);
}

export function scope() {
  return scopes[scopes.length - 1];
}

export function focused() {
  return current;
}

function visible(el) {
  // offsetParent is null for display:none subtrees (no focusable element here is position:fixed itself)
  if (!el.isConnected || el.offsetParent === null) return false;
  return !el.closest('[hidden],.is-hidden');
}

function isRtl(node) {
  if (node._rtl == null) node._rtl = getComputedStyle(node).direction === 'rtl';
  return node._rtl;
}

function sibFx(el, forward) {
  let n = forward ? el.nextElementSibling : el.previousElementSibling;
  while (n && !(n.classList.contains('fx') && visible(n))) n = forward ? n.nextElementSibling : n.previousElementSibling;
  return n;
}

// Cheap, layout-free answers for the common cases (moving along a rail, a grid row, a list).
// Returns undefined when the generic geometric search should decide.
function fastMove(dir) {
  const parent = current.parentNode;
  if (!parent || !parent.classList) return undefined;
  const horizontal = dir === 'left' || dir === 'right';
  if (parent.classList.contains('rail-track') || parent.classList.contains('chips')) {
    if (!horizontal) return undefined;
    const forward = (dir === 'left') === isRtl(parent);
    return sibFx(current, forward) || undefined;
  }
  if (parent.classList.contains('grid')) {
    const kids = parent.children;
    const idx = Array.prototype.indexOf.call(kids, current);
    if (horizontal) {
      const forward = (dir === 'left') === isRtl(parent);
      const n = forward ? kids[idx + 1] : kids[idx - 1];
      // stay on the same visual row
      if (n && n.offsetTop === current.offsetTop) return n;
      return undefined;
    }
    let cols = parent._cols;
    if (!cols) {
      cols = 0;
      const top = kids[0].offsetTop;
      while (cols < kids.length && kids[cols].offsetTop === top) cols++;
      parent._cols = cols;
    }
    const t = dir === 'down' ? idx + cols : idx - cols;
    if (t >= 0 && t < kids.length) return kids[t];
    if (dir === 'down' && Math.floor(idx / cols) < Math.floor((kids.length - 1) / cols)) return kids[kids.length - 1];
    return undefined;
  }
  if (parent.dataset && parent.dataset.flist != null) {
    if (horizontal) return undefined;
    const n = sibFx(current, dir === 'down');
    return n || undefined;
  }
  return undefined;
}

export function focusFirst(root, preferred) {
  root = root || scope();
  if (!root) return;
  let el = preferred && root.contains(preferred) ? preferred : null;
  if (!el) el = root.querySelector('.fx.is-default');
  if (!el) el = $$('.fx', root).find(visible);
  if (el) focus(el, true);
}

export function focus(el, instant) {
  if (!el || el === current) return;
  const prev = current;
  if (prev) {
    prev.classList.remove('is-focus');
    if (prev._onblur) prev._onblur();
    if (prev.tagName === 'INPUT' || prev.tagName === 'TEXTAREA') prev.blur();
  }
  current = el;
  el.classList.add('is-focus');
  const s = scope();
  if (s) s._lastFocus = el;
  const g = el.closest('[data-fgroup]');
  if (g) groupMemory.set(g, el);
  reveal(el, instant);
  if (el._onfocus) el._onfocus();
}

// Offsets ignore CSS transforms, so the maths stays right while a scroll animation is still running.
function offsetWithin(el, ancestor) {
  let x = 0, y = 0, n = el;
  while (n && n !== ancestor) {
    x += n.offsetLeft;
    y += n.offsetTop;
    const p = n.offsetParent;
    if (!p || !ancestor.contains(p) && p !== ancestor) break;
    n = p;
  }
  return { x, y };
}

// Keep the focused element on screen by translating its rail / vertical scroller.
function reveal(el, instant) {
  const rail = el.closest('.rail');
  if (rail) {
    const track = rail.querySelector('.rail-track');
    const item = el.closest('.rail-track > *') || el;
    const o = offsetWithin(item, track);
    const left = o.x + track.offsetLeft, right = left + item.offsetWidth;
    const w = rail.clientWidth;
    const cur = track._tx || 0;
    const pad = parseFloat(rail.dataset.pad || 96) * k();
    let next = cur;
    if (left + cur < pad) next = pad - left;
    else if (right + cur > w - pad) next = w - pad - right;
    const rtl = getComputedStyle(rail).direction === 'rtl';
    next = rtl ? Math.max(0, next) : Math.min(0, next);
    if (next !== cur) {
      track._tx = next;
      track.style.transition = instant ? 'none' : '';
      track.style.transform = `translate3d(${next}px,0,0)`;
    }
  }
  const vs = el.closest('[data-vscroll]');
  if (vs) {
    const content = vs.firstElementChild;
    const anchor = (parseFloat(vs.dataset.vscroll) || 0) * k();
    const row = el.closest('[data-row]') || el;
    const top = offsetWithin(row, content).y;
    const bottom = top + row.offsetHeight;
    const h = vs.clientHeight;
    const cur = content._ty || 0;
    let next = cur;
    if (anchor > 0) next = -(top - anchor);
    else {
      const margin = 80 * k();
      if (top + cur < margin) next = margin - top;
      else if (bottom + cur > h - margin) next = h - margin - bottom;
    }
    const maxScroll = Math.max(0, content.offsetHeight - h + 60 * k());
    next = Math.min(0, Math.max(-maxScroll, next));
    if (next !== cur) {
      content._ty = next;
      content.style.transition = instant ? 'none' : '';
      content.style.transform = `translate3d(0,${next}px,0)`;
    }
  }
}

export function resetScroll(container) {
  $$('.rail-track', container).forEach((t) => { t._tx = 0; t.style.transform = ''; });
  $$('[data-vscroll]', container).forEach((v) => {
    const c = v.firstElementChild;
    if (c) { c._ty = 0; c.style.transform = ''; }
  });
}

function center(r) {
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

export function move(dir) {
  const root = scope();
  if (!root) return false;
  if (!current || !root.contains(current) || !visible(current)) {
    focusFirst(root);
    return true;
  }
  if (current._onkey && current._onkey(dir)) return true;
  const quick = fastMove(dir);
  if (quick) { focus(quick); return true; }
  if (quick === null) {
    if (current._onedge) current._onedge(dir);
    return false;
  }
  const cr = current.getBoundingClientRect();
  const cc = center(cr);
  const cands = $$('.fx', root);
  let best = null, bestScore = Infinity;
  for (let i = 0; i < cands.length; i++) {
    const el = cands[i];
    if (el === current || !visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    const c = center(r);
    let primary, secondary, overlap;
    if (dir === 'left') {
      if (c.x >= cc.x - 1 || r.right > cr.right - 4) continue;
      primary = Math.max(0, cr.left - r.right);
      overlap = Math.min(r.bottom, cr.bottom) - Math.max(r.top, cr.top);
      secondary = Math.abs(c.y - cc.y);
    } else if (dir === 'right') {
      if (c.x <= cc.x + 1 || r.left < cr.left + 4) continue;
      primary = Math.max(0, r.left - cr.right);
      overlap = Math.min(r.bottom, cr.bottom) - Math.max(r.top, cr.top);
      secondary = Math.abs(c.y - cc.y);
    } else if (dir === 'up') {
      if (c.y >= cc.y - 1 || r.bottom > cr.bottom - 4) continue;
      primary = Math.max(0, cr.top - r.bottom);
      overlap = Math.min(r.right, cr.right) - Math.max(r.left, cr.left);
      secondary = Math.abs(c.x - cc.x);
    } else {
      if (c.y <= cc.y + 1 || r.top < cr.top + 4) continue;
      primary = Math.max(0, r.top - cr.bottom);
      overlap = Math.min(r.right, cr.right) - Math.max(r.left, cr.left);
      secondary = Math.abs(c.x - cc.x);
    }
    const score = primary + (overlap > 0 ? secondary * 0.3 : secondary * 2 + 200);
    if (score < bestScore) { bestScore = score; best = el; }
  }
  if (!best) {
    if (current._onedge) current._onedge(dir);
    return false;
  }
  // Entering another remembered group: return to where the user left it.
  const fromG = current.closest('[data-fgroup]');
  const toG = best.closest('[data-fgroup]');
  if (toG && toG !== fromG && (dir === 'up' || dir === 'down' || toG.dataset.fgroup === 'side')) {
    const mem = groupMemory.get(toG);
    if (mem && toG.contains(mem) && visible(mem)) best = mem;
  }
  focus(best);
  return true;
}

export function select() {
  if (!current) return;
  if (current._onselect) current._onselect();
  else if (current.tagName === 'INPUT' || current.tagName === 'TEXTAREA') current.focus();
  else current.click();
}

export function forgetGroup(g) {
  groupMemory.delete(g);
}
