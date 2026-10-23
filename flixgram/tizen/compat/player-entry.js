// Test page for the streaming player alone (compat runs): plays a local file through HTTP ranges.
import { createPlayer } from '../host/player.js';
import { HttpSource } from '../host/source.js';
window.events = [];
window.__player = (e) => window.events.push(e.type + (e.what ? ':' + e.what + ':' + e.message : ''));
window.P = createPlayer(async (id, url) => {
  const file = /file=([^&]+)/.exec(url)[1];
  return HttpSource.open('/' + file);
});
