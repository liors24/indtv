// Live preview: rest on a video for a moment and the video itself starts playing, silently, behind the
// page (the room becomes the screen). Press OK and the same picture grows into the full player and simply
// carries on with sound from that second; no black screen, no second load. Move away and it fades out.
import * as td from './td.js';
import { store } from './util.js';
import { progress } from './components.js';

const DELAY = 1500;
let timer = 0, poll = 0;
let cur = null;        // item previewing
let shown = false;     // the picture is on screen
let handed = false;    // given over to the player
let quiet = '';       // just watched: no preview until the focus moves elsewhere
let frameEl = null;  // where the picture plays (a frame on the page), or null for the whole screen
let framed = null;     // the frame currently showing the film
let holeEl = null;
function hole() {
  if (!holeEl) { holeEl = document.createElement('div'); holeEl.id = 'pvhole'; (document.getElementById('ambient') || document.body).appendChild(holeEl); }
  return holeEl;
}
function unframe() { if (framed) { framed.classList.remove('pv-frame'); framed = null; } }

const root = () => document.documentElement;

export function enabled() { return store.get('preview', true) !== false; }
export function setEnabled(on) { store.set('preview', !!on); if (!on) stop(); }

/** Called when a video gets the focus (hero). */
export function rest(item, frame) {
  frameEl = frame || null;
  clearTimeout(timer);
  if (cur && (!item || cur.key !== item.key)) stop();
  if (item && quiet && item.key !== quiet) quiet = '';
  if (!item || item.kind !== 'video' || !item.fileId || !enabled() || (cur && cur.key === item.key) || item.key === quiet) return;
  timer = setTimeout(() => begin(item), DELAY);
}

function begin(item) {
  if (root().classList.contains('playing')) return;
  cur = item; shown = false; handed = false;
  const p = progress.get(item.key);
  const startMs = p && p.pos && p.dur && p.pos < p.dur - 30 ? Math.max(0, p.pos - 3) * 1000 : 0;
  td.player.mute(true);
  td.player.play(td.streamUrl(item.fileId, item.mime), startMs);
  const r = frameEl && frameEl.getBoundingClientRect();
  const W = window.innerWidth, H = window.innerHeight;
  if (r && r.width > 0 && r.height > 0) {
    td.player.aspect('box:' + [r.left / W, r.top / H, r.width / W, r.height / H].map((n) => n.toFixed(4)).join(','));
    // the room is painted around the frame from underneath the page, so only the frame shows the film
    const hl = hole();
    hl.style.left = r.left + 'px'; hl.style.top = r.top + 'px'; hl.style.width = r.width + 'px'; hl.style.height = r.height + 'px';
    hl.style.borderRadius = getComputedStyle(frameEl).borderTopLeftRadius;
    frameEl.classList.add('pv-frame');
    framed = frameEl;
    root().classList.add('pv-box');
  } else {
    td.player.aspect('zoom');
    root().classList.remove('pv-box');
  }
  root().classList.add('pv-load');
  clearInterval(poll);
  poll = setInterval(() => {
    if (!cur || cur !== item) return clearInterval(poll);
    const s = td.player.state();
    if (s.active && s.prepared && s.playing && !s.buffering && !shown) {
      shown = true;
      root().classList.add('pv-on');
    }
  }, 200);
}

/** The player opens this item: hand over the running picture instead of starting again. */
export function take(item) {
  clearTimeout(timer);
  if (!cur || !item || cur.key !== item.key) { stop(); return false; }
  const ok = shown;
  handed = ok;
  clearInterval(poll);
  root().classList.remove('pv-load', 'pv-on', 'pv-box'); unframe();
  if (!ok) { stop(); return false; }
  cur = null;
  return true;
}

export function stop() {
  clearTimeout(timer);
  clearInterval(poll);
  root().classList.remove('pv-load', 'pv-on', 'pv-box'); unframe();
  if (!cur) return;
  const it = cur;
  cur = null; shown = false;
  if (handed) return;
  td.player.stop();
  // nothing stays on the device
  td.fire({ '@type': 'cancelDownloadFile', file_id: it.fileId, only_if_pending: false });
  setTimeout(() => td.fire({ '@type': 'deleteFile', file_id: it.fileId }), 400);
}

export function active() { return !!cur; }
/** After the player closes, the item it showed does not start previewing again under the viewer. */
export function hush(key) { quiet = key || ''; stop(); }
