// Instant start: when the user rests on a video for a moment, quietly fetch its first few MB.
// Only one video is warmed at a time; the previous one is cancelled and deleted, so nothing piles up.
import * as td from './td.js';

let timer = 0;
let warm = 0;        // file id currently warmed
let protectId = 0;   // file id now playing (never delete under the player)
const BYTES = 3 * 1024 * 1024;

function drop(id) {
  if (!id || id === protectId) return;
  td.fire({ '@type': 'cancelDownloadFile', file_id: id, only_if_pending: false });
  td.fire({ '@type': 'deleteFile', file_id: id });
}

export function hover(item) {
  clearTimeout(timer);
  if (!item || item.kind !== 'video' || !item.fileId) return;
  timer = setTimeout(() => {
    if (warm === item.fileId) return;
    drop(warm);
    warm = item.fileId;
    td.player.prefetch(item.fileId, BYTES);
  }, 900);
}

export function playing(fileId) {
  clearTimeout(timer);
  protectId = fileId;
  if (warm && warm !== fileId) drop(warm);
  warm = 0;
}

export function stopped() {
  protectId = 0;
}
