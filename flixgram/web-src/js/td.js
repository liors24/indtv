// TDLib JSON client over the Android bridge (window.NovaHost).

const host = window.NovaHost;
let seq = 1;
const pending = new Map();
const listeners = {};

export const info = (() => {
  try { return JSON.parse(host.info()); } catch (e) { return {}; }
})();

export function base() {
  return 'http://127.0.0.1:' + info.port;
}

export function send(req) {
  return new Promise((resolve, reject) => {
    const id = seq++;
    req['@extra'] = id;
    pending.set(id, { resolve, reject });
    host.send(JSON.stringify(req));
  });
}

export function fire(req) {
  host.send(JSON.stringify(req));
}

export function on(type, fn) {
  (listeners[type] || (listeners[type] = [])).push(fn);
  return () => {
    const l = listeners[type];
    const i = l.indexOf(fn);
    if (i >= 0) l.splice(i, 1);
  };
}

function emit(o) {
  const l = listeners[o['@type']];
  if (l) for (let i = 0; i < l.length; i++) {
    try { l[i](o); } catch (e) { console.error('listener', o['@type'], e && e.stack); }
  }
  const any = listeners['*'];
  if (any) for (let i = 0; i < any.length; i++) any[i](o);
}

window.__td = function (batch) {
  for (let i = 0; i < batch.length; i++) {
    const o = batch[i];
    const ex = o['@extra'];
    if (ex != null && pending.has(ex)) {
      const p = pending.get(ex);
      pending.delete(ex);
      if (o['@type'] === 'error') p.reject(o);
      else p.resolve(o);
      continue;
    }
    emit(o);
  }
};

export function ready() {
  host.ready();
}

// Samsung TVs (Tizen) have no local server: pictures are read from TDLib and handed over as blob: URLs.
export const tizen = info.kind === 'tizen';

// URLs served by the local stream server ("tgf:<id>" on Tizen, resolved with resolveSrc)
export function thumbUrl(fileId) {
  if (!fileId) return '';
  return tizen ? 'tgf:' + fileId : `${base()}/t/${fileId}`;
}

/** Calls fn with a URL an <img> can load (right away on Android, once the file is read on Tizen). */
export function resolveSrc(url, fn) {
  if (url && url.indexOf('tgf:') === 0 && host.fileSrc) { host.fileSrc(parseInt(url.slice(4), 10), fn); return; }
  fn(url);
}

export function streamUrl(fileId, mime) {
  return `${base()}/f/${fileId}?m=${encodeURIComponent(mime || 'video/mp4')}`;
}

export const player = {
  play: (url, startMs) => host.play(url, startMs | 0),
  pause: () => host.pause(),
  resume: () => host.resume(),
  seek: (ms) => host.seek(ms | 0),
  speed: (s) => host.speed(s),
  track: (i, on) => host.track(i, !!on),
  stop: () => host.stop(),
  mute: (on) => host.mute(!!on),
  aspect: (mode) => { try { host.aspect(mode); } catch (e) { /* older host */ } },
  prefetch: (fileId, bytes) => { try { host.prefetch(fileId, bytes); } catch (e) { /* older host */ } },
  state: () => {
    try { return JSON.parse(host.state()); } catch (e) { return { active: false }; }
  },
};

export function exitApp() {
  host.exit();
}
