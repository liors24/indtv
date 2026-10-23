// Flixgram host for Samsung TVs (Tizen). Provides window.NovaHost — the same bridge the Android app
// gives the interface — on top of TDLib compiled to WebAssembly (tdweb), a <video> player fed through
// Media Source Extensions, the TV remote's keys, and an encrypted relay for sending the API keys from
// a phone. Loaded before app.js.
/* global tdweb, tizen, webapis */
import { createPlayer } from './player.js';
import { TdSource, blobBuffer } from './source.js';
import { startRelay } from './relay.js';

const VERSION = typeof __VERSION__ === 'string' ? __VERSION__ : '1.0';
// served straight from the repository (works without GitHub Pages being switched on)
const SETUP_PAGE = 'https://raw.githack.com/liors24/indtv/main/web/flixgram-setup.html';
const OTA_URL = 'https://raw.githubusercontent.com/liors24/indtv/flixgram-ota/bundle.json';
document.documentElement.classList.add('tizen');

// ------------------------------------------------------------------ TDLib

let client = null;
let jsReady = false;
const queue = [];

function deliver(o) {
  if (!jsReady || !window.__td) { queue.push(o); return; }
  window.__td([o]);
}

function makeClient() {
  const TdClient = tdweb.default || tdweb;
  return new TdClient({
    instanceName: 'flixgram',
    jsLogVerbosityLevel: 'error',
    logVerbosityLevel: 1,
    useDatabase: true,
    mode: 'wasm',
    onUpdate: (u) => {
      if (u['@type'] === 'updateFile') files.onUpdate(u.file);
      deliver(u);
    },
  });
}

function td(query) {
  return client.send(query);
}

// ------------------------------------------------------------------ pictures (thumbnails, photos)

const files = (() => {
  const urls = new Map();       // fileId -> object URL (most recent last)
  const waiting = new Map();    // fileId -> [callbacks]
  const pending = [];
  let running = 0;
  const LIMIT = 260;

  function remember(id, url) {
    urls.set(id, url);
    while (urls.size > LIMIT) {
      const [old, u] = urls.entries().next().value;
      urls.delete(old);
      try { URL.revokeObjectURL(u); } catch (e) { /* already gone */ }
    }
  }

  function done(id, url) {
    const cbs = waiting.get(id) || [];
    waiting.delete(id);
    cbs.forEach((cb) => { try { cb(url); } catch (e) { console.error(e); } });
  }

  async function load(id) {
    try {
      // pictures seen before are kept by tdweb in IndexedDB: read them from there without the network
      const f = await td({ '@type': 'getFile', file_id: id });
      if (!f.local || !f.local.is_downloading_completed) {
        await td({ '@type': 'downloadFile', file_id: id, priority: 8, offset: 0, limit: 0, synchronous: true });
      }
      const part = await td({ '@type': 'readFile', file_id: id });
      const data = part.data instanceof Blob ? part.data : new Blob([await blobBuffer(part.data)]);
      const url = URL.createObjectURL(data);
      remember(id, url);
      done(id, url);
    } catch (e) {
      done(id, '');
    }
  }

  function next() {
    while (running < 6 && pending.length) {
      const id = pending.pop();          // newest first: what the viewer looks at now
      running++;
      load(id).then(() => { running--; next(); });
    }
  }

  return {
    get(id, cb) {
      if (!id) { cb(''); return; }
      const u = urls.get(id);
      if (u) { urls.delete(id); urls.set(id, u); cb(u); return; }
      const w = waiting.get(id);
      if (w) { w.push(cb); return; }
      waiting.set(id, [cb]);
      pending.push(id);
      next();
    },
    onUpdate() { /* downloads are awaited directly */ },
  };
})();

// ------------------------------------------------------------------ video

const player = createPlayer((fileId) => TdSource.open({ send: td }, fileId));

// ------------------------------------------------------------------ device

function deviceInfo() {
  let model = 'Samsung Smart TV';
  let system = 'Tizen';
  try { model = 'Samsung ' + webapis.productinfo.getRealModel(); } catch (e) { /* no webapis */ }
  try { system = 'Tizen ' + tizen.systeminfo.getCapability('http://tizen.org/feature/platform.version'); } catch (e) { /* no tizen */ }
  return { model, system };
}

function screenSaver(on) {
  try {
    webapis.appcommon.setScreenSaver(on ? webapis.appcommon.AppCommonScreenSaverState.SCREEN_SAVER_ON : webapis.appcommon.AppCommonScreenSaverState.SCREEN_SAVER_OFF);
  } catch (e) { /* not available */ }
}

const relay = startRelay(SETUP_PAGE, (keys) => { if (window.__setup) window.__setup(keys); });

window.NovaHost = {
  info() {
    const d = deviceInfo();
    return JSON.stringify({
      kind: 'tizen', port: 0, lan: '', token: '', db: '/db', files: '/files',
      model: d.model, system: d.system, version: VERSION, lang: 'he', setupUrl: relay.url,
    });
  },
  ready() {
    jsReady = true;
    updater.started();
    const b = queue.splice(0);
    if (b.length && window.__td) window.__td(b);
  },
  send(json) {
    const q = JSON.parse(json);
    if (q['@type'] === 'setTdlibParameters') {
      // keep chats and the file index on the TV, but not every message of every channel (see tdweb/patch.mjs)
      q.use_message_database = false;
    }
    const extra = q['@extra'];
    delete q['@extra'];
    const back = (r) => {
      if (extra !== undefined) r['@extra'] = extra;
      deliver(r);
    };
    client.send(q).then(back, (e) => back(e && e['@type'] ? e : { '@type': 'error', code: 500, message: String(e && e.message || e) }));
  },
  execute() { return '{}'; },
  restart() { client = makeClient(); },
  fileSrc(id, cb) { files.get(id, cb); },
  play(url, startMs) { screenSaver(false); player.play(url, startMs); },
  pause() { player.pause(); },
  resume() { player.resume(); },
  seek(ms) { player.seek(ms); },
  speed(s) { player.speed(s); },
  track(i, on) { player.track(i, on); },
  aspect(mode) { player.aspect(mode); },
  mute(on) { player.mute(on); },
  prefetch(fileId, bytes) {
    td({ '@type': 'downloadFile', file_id: fileId, priority: 1, offset: 0, limit: bytes, synchronous: false }).catch(() => {});
  },
  stop() { player.stop(); screenSaver(true); },
  state() { return JSON.stringify(player.state()); },
  keepScreenOn(on) { screenSaver(!on); },
  exit() {
    try { tizen.application.getCurrentApplication().exit(); } catch (e) { window.close(); }
  },
};

// ------------------------------------------------------------------ remote control

const MEDIA = {
  MediaPlayPause: 'playpause', MediaPlay: 'play', MediaPause: 'pause', MediaStop: 'stop',
  MediaFastForward: 'ff', MediaRewind: 'rw', MediaTrackNext: 'next', MediaTrackPrevious: 'prev',
  ChannelUp: 'chup', ChannelDown: 'chdown', Info: 'info', ColorF0Red: 'red', Menu: 'menu', Search: 'search',
};
const codes = {};
try {
  const supported = tizen.tvinputdevice.getSupportedKeys().map((k) => k.name);
  const want = Object.keys(MEDIA).filter((n) => supported.indexOf(n) >= 0);
  try { tizen.tvinputdevice.registerKeyBatch(want); } catch (e) { want.forEach((n) => { try { tizen.tvinputdevice.registerKey(n); } catch (er) { /* reserved */ } }); }
  want.forEach((n) => { codes[tizen.tvinputdevice.getKey(n).code] = MEDIA[n]; });
} catch (e) {
  // not a TV (browser test): the usual media key codes
  Object.assign(codes, { 10252: 'playpause', 415: 'play', 19: 'pause', 413: 'stop', 417: 'ff', 412: 'rw', 427: 'chup', 428: 'chdown', 457: 'info' });
}

document.addEventListener('keydown', (e) => {
  if (e.keyCode === 10009 || e.key === 'XF86Back') {   // Return on the Samsung remote
    e.preventDefault();
    e.stopPropagation();
    if (e.repeat) return;
    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) { active.blur(); return; }
    if (window.NOVA) window.NOVA.back();
    else window.NovaHost.exit();
    return;
  }
  const name = codes[e.keyCode];
  if (name) {
    e.preventDefault();
    e.stopPropagation();
    if (!e.repeat && window.NOVA) window.NOVA.key(name);
  }
}, true);

document.addEventListener('visibilitychange', () => {
  if (!window.NOVA) return;
  if (document.hidden) { player.pause(); window.NOVA.lifecycle('pause'); }
  else window.NOVA.lifecycle('resume');
});

// ------------------------------------------------------------------ automatic updates
// The installed app is a shell: on launch it runs the newest interface bundle downloaded earlier
// (index.html). Here we look for a newer one; it is applied right away when nothing is playing,
// otherwise the next time the app opens. A bundle that fails to start twice is dropped by the shell.

const updater = (() => {
  const launched = Date.now();
  let pending = false;
  const num = (k) => parseInt(localStorage.getItem(k), 10) || 0;
  function current() {
    let o = 0;
    try { o = (JSON.parse(localStorage.getItem('flix:ota') || 'null') || {}).build || 0; } catch (e) { o = 0; }
    return Math.max(window.FLIX_BUILD || 0, o);
  }
  function restart() { location.replace(new URL('index.html', location.href).href); }
  function apply() {
    if (!player.state().active && Date.now() - launched < 90000) restart();
    else pending = true;
  }
  function check() {
    if (typeof fetch !== 'function') return;
    fetch(OTA_URL + '?t=' + Date.now(), { cache: 'no-store', credentials: 'omit' })
      .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then((b) => {
        if (!b || !b.html || !(b.build > current()) || b.build === num('flix:ota-bad')) return;
        if (b.tdweb !== window.FLIX_TDWEB) return;   // needs a newer installed package (new TDLib)
        localStorage.setItem('flix:ota', JSON.stringify({ build: b.build, tdweb: b.tdweb, html: b.html }));
        localStorage.removeItem('flix:ota-boot');
        apply();
      })
      .catch(() => { /* offline: keep what we have */ });
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && pending && !player.state().active) restart(); });
  return {
    started() {
      // the interface came up: this bundle is good
      setTimeout(() => { localStorage.removeItem('flix:ota-boot'); }, 6000);
      setTimeout(check, 2500);
      setInterval(check, 6 * 3600 * 1000);
    },
  };
})();

client = makeClient();
