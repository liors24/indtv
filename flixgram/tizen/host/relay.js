// Getting the API keys from the phone without a local server: the QR opens a small page that encrypts
// api_id/api_hash with a one-time key carried in the link's #fragment (never sent to any server) and
// posts the result to a private ntfy.sh topic. The TV polls that topic while the setup screen is open.

const KEY_BYTES = 72;

function rand(n) {
  const a = new Uint8Array(n);
  (window.crypto || window.msCrypto).getRandomValues(a);
  return a;
}

function b64url(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function unb64(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function load() {
  try {
    const o = JSON.parse(localStorage.getItem('flix.relay') || 'null');
    if (o && o.topic && o.key) return o;
  } catch (e) { /* fresh */ }
  const hex = Array.prototype.map.call(rand(12), (b) => ('0' + b.toString(16)).slice(-2)).join('');
  const o = { topic: 'flixgram-' + hex, key: b64url(rand(KEY_BYTES)) };
  try { localStorage.setItem('flix.relay', JSON.stringify(o)); } catch (e) { /* private mode */ }
  return o;
}

export function decode(message, keyText) {
  const c = unb64(message);
  const k = unb64(keyText);
  if (c.length > k.length) return null;
  let s = '';
  for (let i = 0; i < c.length; i++) s += String.fromCharCode(c[i] ^ k[i]);
  try {
    const o = JSON.parse(decodeURIComponent(escape(s.trim())));
    return o && o.i && o.h ? { api_id: String(o.i), api_hash: String(o.h) } : null;
  } catch (e) {
    return null;
  }
}

export function startRelay(page, onKeys) {
  const r = load();
  const url = page + '#' + r.topic + '.' + r.key;
  let since = '10m';
  let timer = 0;
  const seen = {};

  function needed() {
    try { return !localStorage.getItem('nova.api'); } catch (e) { return false; }
  }

  function poll() {
    timer = 0;
    if (!needed() || document.hidden) { schedule(6000); return; }
    const x = new XMLHttpRequest();
    x.open('GET', 'https://ntfy.sh/' + r.topic + '/json?poll=1&since=' + encodeURIComponent(since), true);
    x.timeout = 15000;
    x.onload = () => {
      String(x.responseText || '').split('\n').forEach((line) => {
        if (!line.trim()) return;
        let m;
        try { m = JSON.parse(line); } catch (e) { return; }
        if (!m || m.event !== 'message' || seen[m.id]) return;
        seen[m.id] = true;
        since = m.id;
        const keys = decode(m.message || '', r.key);
        if (keys && needed()) onKeys(keys);
      });
      schedule(2500);
    };
    x.onerror = x.ontimeout = () => schedule(6000);
    x.send();
  }

  function schedule(ms) {
    if (!timer) timer = setTimeout(poll, ms);
  }

  schedule(1500);
  return { url };
}
