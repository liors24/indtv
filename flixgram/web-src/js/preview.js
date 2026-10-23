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
let quiet = '';        // just watched: no preview until the focus moves elsewhere

const root = () => document.documentElement;

export function enabled() { return store.get('preview', true) !== false; }
export function setEnabled(on) { store.set('preview', !!on); if (!on) stop(); }

/** Called when a video gets the focus (hero). */
export function rest(item) {
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
  td.player.aspect('zoom');
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
  root().classList.remove('pv-load', 'pv-on');
  if (!ok) { stop(); return false; }
  cur = null;
  return true;
}

export function stop() {
  clearTimeout(timer);
  clearInterval(poll);
  root().classList.remove('pv-load', 'pv-on');
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
