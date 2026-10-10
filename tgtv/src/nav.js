/* TeleTV — remote-control navigation: arrow keys move focus spatially, OK clicks, Back goes back. */
const KEYS = {
  LEFT: [37, 'ArrowLeft', 'Left'], UP: [38, 'ArrowUp', 'Up'], RIGHT: [39, 'ArrowRight', 'Right'], DOWN: [40, 'ArrowDown', 'Down'],
  OK: [13, 'Enter', 'Accept', 'Select', 'NumpadEnter'],
  BACK: [10009, 461, 27, 'Escape', 'GoBack', 'BrowserBack', 'XF86Back', 'Back'],
  PLAYPAUSE: [10252, 179, 'MediaPlayPause'], PLAY: [415, 'MediaPlay'], PAUSE: [19, 'MediaPause'], STOP: [413, 'MediaStop'],
  FF: [417, 'MediaFastForward'], RW: [412, 'MediaRewind'], CH_UP: [427, 33, 'ChannelUp', 'PageUp'], CH_DOWN: [428, 34, 'ChannelDown', 'PageDown'],
  RED: [403, 'ColorF0Red'], GREEN: [404, 'ColorF1Green'], YELLOW: [405, 'ColorF2Yellow'], BLUE: [406, 'ColorF3Blue']
};
export function keyName(e) {
  for (const n of Object.keys(KEYS)) {
    const l = KEYS[n];
    if (l.indexOf(e.keyCode) >= 0 || l.indexOf(e.key) >= 0) return n;
  }
  return null;
}

const stack = [];
let scope = null;       // element that limits navigation (a screen or a dialog)

function visible(n) {
  if (!n.isConnected || n.disabled || n.hasAttribute('hidden')) return false;
  const r = n.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  for (let p = n; p && p !== document.body; p = p.parentElement) {
    if (p.hasAttribute && p.hasAttribute('hidden')) return false;
  }
  return true;
}
function candidates() {
  const root = scope || document;
  return Array.prototype.slice.call(root.querySelectorAll('.fx')).filter(visible);
}
function pick(from, dir, list) {
  const a = from.getBoundingClientRect(), acx = a.left + a.width / 2, acy = a.top + a.height / 2;
  let best = null, bestScore = Infinity;
  list.forEach((n) => {
    if (n === from) return;
    const b = n.getBoundingClientRect(), bcx = b.left + b.width / 2, bcy = b.top + b.height / 2;
    let primary, overlap, off;
    if (dir === 'RIGHT') { if (bcx <= acx + 1) return; primary = Math.max(0, b.left - a.right); overlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top); off = Math.abs(bcy - acy); }
    else if (dir === 'LEFT') { if (bcx >= acx - 1) return; primary = Math.max(0, a.left - b.right); overlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top); off = Math.abs(bcy - acy); }
    else if (dir === 'DOWN') { if (bcy <= acy + 1) return; primary = Math.max(0, b.top - a.bottom); overlap = Math.min(a.right, b.right) - Math.max(a.left, b.left); off = Math.abs(bcx - acx); }
    else { if (bcy >= acy - 1) return; primary = Math.max(0, a.top - b.bottom); overlap = Math.min(a.right, b.right) - Math.max(a.left, b.left); off = Math.abs(bcx - acx); }
    const score = primary * 2 + (overlap > 0 ? off * 0.5 : 400 + off * 3);
    if (score < bestScore) { bestScore = score; best = n; }
  });
  return best;
}
function reveal(n) {
  try { n.scrollIntoView({ block: n.getAttribute('data-scroll') === 'center' ? 'center' : 'nearest', inline: 'nearest' }); } catch (e) { try { n.scrollIntoView(); } catch (e2) { /* ignore */ } }
}
export const Nav = {
  KEYS,
  focus(n) { if (!n) return false; try { n.focus({ preventScroll: true }); } catch (e) { n.focus(); } reveal(n); return true; },
  first() { return candidates()[0] || null; },
  setScope(s) { scope = s; },
  push(h) { stack.push(h); },
  pop(h) { const i = stack.lastIndexOf(h); if (i >= 0) stack.splice(i, 1); },
  move(dir) {
    const list = candidates();
    let cur = document.activeElement;
    if (!cur || !list.length || list.indexOf(cur) < 0) { Nav.focus(list[0]); return; }
    Nav.focus(pick(cur, dir, list));
  },
  /** Called with a key name; used by the keyboard listener and by the Android shell. */
  press(name, e) {
    const h = stack[stack.length - 1];
    const ae = document.activeElement;
    const typing = ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA');
    if (typing) {
      if (name === 'BACK') { ae.blur(); return true; }
      if (name === 'OK') { const l = candidates(); const nx = pick(ae, 'DOWN', l); ae.blur(); if (nx) Nav.focus(nx); return true; }
      if (name === 'UP' || name === 'DOWN') { Nav.move(name); return true; }
      return false;       // left/right/characters: let the field handle them
    }
    if (h && h.onKey && h.onKey(name, e)) return true;
    if (name === 'LEFT' || name === 'RIGHT' || name === 'UP' || name === 'DOWN') { Nav.move(name); return true; }
    if (name === 'OK') { if (ae && ae.classList && ae.classList.contains('fx')) { ae.click(); return true; } return false; }
    if (name === 'BACK') { if (h && h.onBack) h.onBack(); return true; }
    return false;
  },
  init() {
    window.addEventListener('keydown', (e) => {
      const name = keyName(e);
      if (!name) return;
      const handled = Nav.press(name, e);
      if (handled) { e.preventDefault(); e.stopPropagation(); }
    }, true);
    window.TGKey = (k) => { const name = keyName({ key: k, keyCode: -1 }); return name ? Nav.press(name) : false; };   // Android shell
    // Tizen: ask the TV to deliver the media and colour keys
    try {
      if (window.tizen && tizen.tvinputdevice) {
        ['MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaStop', 'MediaFastForward', 'MediaRewind', 'ChannelUp', 'ChannelDown', 'ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue']
          .forEach((k) => { try { tizen.tvinputdevice.registerKey(k); } catch (e) { /* not supported on this TV */ } });
      }
    } catch (e) { /* ignore */ }
  }
};
