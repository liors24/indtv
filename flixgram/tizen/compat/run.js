// Runs the Samsung build in old Chromium engines like the ones inside Samsung TVs (Tizen 5 ≈ Chromium 63,
// Tizen 5.5 ≈ 69) and records what happens: start-up line, errors, screens, video playback.
// Usage (Node 10): node run.js <app dir> <out dir> <label>   — puppeteer must be installed next to it.
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const app = path.resolve(process.argv[2]);
const out = path.resolve(process.argv[3]);
const label = process.argv[4];
const types = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.css': 'text/css', '.mp4': 'video/mp4', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

const server = http.createServer((q, r) => {
  const f = path.join(app, decodeURIComponent(q.url.split('?')[0]));
  if (!f.startsWith(app) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; }
  const st = fs.statSync(f);
  const m = /bytes=(\d+)-(\d*)/.exec(q.headers.range || '');
  const ty = types[path.extname(f)] || 'application/octet-stream';
  if (m) {
    const a = +m[1], b = m[2] ? +m[2] : st.size - 1;
    r.writeHead(206, { 'Content-Type': ty, 'Content-Range': `bytes ${a}-${b}/${st.size}`, 'Content-Length': b - a + 1 });
    fs.createReadStream(f, { start: a, end: b }).pipe(r);
  } else {
    r.writeHead(200, { 'Content-Type': ty, 'Content-Length': st.size });
    if (q.method === 'HEAD') r.end(); else fs.createReadStream(f).pipe(r);
  }
}).listen(8090, '127.0.0.1');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const result = { label, steps: [] };
function note(k, v) { result.steps.push({ k, v }); console.log(label, k, typeof v === 'string' ? v : JSON.stringify(v)); }

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--window-size=1920,1080'] });
  note('engine', await browser.version());
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') note('console.' + m.type(), m.text().slice(0, 300)); });
  page.on('pageerror', (e) => note('pageerror', String(e && e.message || e).slice(0, 400)));
  page.on('requestfailed', (r) => note('requestfailed', r.url().slice(0, 120)));

  const look = () => page.evaluate(() => {
    const d = document.getElementById('bootdiag');
    const app = document.getElementById('app');
    return { url: location.pathname, diag: d ? d.textContent : '', intro: !!document.getElementById('intro'), mode: app ? app.dataset.mode : '', title: (document.querySelector('.gate-title') || {}).textContent || '' };
  });

  // 1. first launch: no API keys yet -> the setup screen with the QR
  await page.goto('http://127.0.0.1:8090/index.html');
  for (let i = 0; i < 6; i++) { await sleep(3000); note('first-launch t=' + (i + 1) * 3 + 's', await look()); }
  await page.screenshot({ path: path.join(out, label + '-1-setup.png') });

  // 2. keys present -> TDLib asks Telegram for the login QR
  await page.evaluate(() => localStorage.setItem('nova.api', JSON.stringify({ id: 12345, hash: '0123456789abcdef0123456789abcdef' })));
  await page.reload();
  for (let i = 0; i < 6; i++) { await sleep(3000); note('with-keys t=' + (i + 1) * 3 + 's', await look()); }
  await page.screenshot({ path: path.join(out, label + '-2-login.png') });

  // 3. the streaming player on its own, with a test video
  await page.goto('http://127.0.0.1:8090/compat-player.html');
  await sleep(1000);
  note('mse', await page.evaluate(() => typeof MediaSource !== 'undefined' && ['video/mp4; codecs="avc1.64001f"', 'video/mp4; codecs="vp09.00.21.08"', 'audio/mp4; codecs="mp4a.40.2"', 'audio/mp4; codecs="fLaC"'].map((t) => t + '=' + MediaSource.isTypeSupported(t)).join(' ')));
  await page.evaluate(() => P.play('/f/1?file=test.mp4', 20000));
  await sleep(6000);
  note('player after start@20s', await page.evaluate(() => ({ st: P.state(), ev: events.slice() })));
  await page.evaluate(() => P.seek(70000));
  await sleep(4000);
  note('player after seek 70s', await page.evaluate(() => ({ st: P.state(), ev: events.slice(-4) })));
  await page.screenshot({ path: path.join(out, label + '-3-player.png') });

  await browser.close();
  server.close();
  fs.writeFileSync(path.join(out, label + '.json'), JSON.stringify(result, null, 1));
})().catch((e) => {
  note('crash', String(e && e.stack || e).slice(0, 600));
  fs.writeFileSync(path.join(out, label + '.json'), JSON.stringify(result, null, 1));
  process.exit(0);
});
