// CI smoke test for the Samsung build: starts TDLib (WebAssembly) in headless Chromium and checks that
// it opens its database, reaches the login step and talks to Telegram's servers over WebSockets.
// Usage: node smoke.mjs <app dir>   (needs the playwright package)
import http from 'http';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const dir = path.resolve(process.argv[2]);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.css': 'text/css' };
fs.writeFileSync(path.join(dir, 'smoke.html'), `<!doctype html><script src="tdweb.js"></script><script>
window.steps = [];
const TdClient = tdweb.default || tdweb;
const c = new TdClient({ instanceName: 'smoke', jsLogVerbosityLevel: 'error', logVerbosityLevel: 1, mode: 'wasm', onUpdate: (u) => {
  if (u['@type'] !== 'updateAuthorizationState') return;
  const t = u.authorization_state['@type'];
  steps.push(t);
  if (t === 'authorizationStateWaitTdlibParameters') c.send({ '@type': 'setTdlibParameters', use_test_dc: false, database_directory: '/db', files_directory: '/files',
    database_encryption_key: '', use_file_database: true, use_chat_info_database: true, use_message_database: true, use_secret_chats: false,
    api_id: 1, api_hash: '00000000000000000000000000000000', system_language_code: 'he', device_model: 'CI', system_version: 'Linux', application_version: 'smoke' })
    .catch((e) => steps.push('params error ' + JSON.stringify(e)));
  if (t === 'authorizationStateWaitPhoneNumber') c.send({ '@type': 'requestQrCodeAuthentication', other_user_ids: [] })
    .then((r) => steps.push('server: ' + JSON.stringify(r)), (e) => steps.push('server: ' + (e && e.message)));
} });
</script>`);
const server = http.createServer((q, r) => {
  const f = path.join(dir, decodeURIComponent(q.url.split('?')[0]));
  if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; }
  r.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(r);
}).listen(0, '127.0.0.1');
await new Promise((ok) => server.on('listening', ok));
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('page error:', e.message));
await page.goto(`http://127.0.0.1:${server.address().port}/smoke.html`);
let steps = [];
for (let i = 0; i < 90; i++) {
  await page.waitForTimeout(1000);
  steps = await page.evaluate(() => window.steps);
  if (steps.some((s) => s.startsWith('server:'))) break;
}
console.log(steps.join('\n'));
await browser.close();
server.close();
fs.unlinkSync(path.join(dir, 'smoke.html'));
const server_ = steps.find((s) => s.startsWith('server:')) || '';
// with a fake api_id Telegram answers API_ID_INVALID: that answer proves the whole path works
if (!steps.includes('authorizationStateWaitPhoneNumber') || !/API_ID|link|tg:\/\//.test(server_)) {
  console.error('smoke test failed');
  process.exit(1);
}
console.log('smoke test passed: TDLib runs in the browser and reaches Telegram');
