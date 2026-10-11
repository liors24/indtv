import { createRequire } from 'module';
const require = createRequire('/opt/npm-tools/node_modules/');
const { chromium } = require('playwright');
const which = process.argv[2] || 'all';
const W = +(process.env.W || 1920), H = +(process.env.H || 1080), DPR = +(process.env.DPR || 1);
const browser = await chromium.launch();
const errors = [];
async function page(q) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR });
  const p = await ctx.newPage();
  p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
  p.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
  await p.goto('http://127.0.0.1:8777/?' + q);
  return p;
}
const key = async (p, k, n = 1, wait = 160) => { for (let i = 0; i < n; i++) { await p.keyboard.press(k); await p.waitForTimeout(wait); } };
const shot = (p, name) => p.screenshot({ path: `/tmp/claude-0/shots/${name}.png` });

if (which === 'all' || which === 'gate') {
  const p = await page('auth=setup'); await p.waitForTimeout(2600); await shot(p, 'setup');
  const q = await page('auth=qr'); await q.waitForTimeout(3200); await shot(q, 'login-qr');
}
if (which === 'all' || which === 'home') {
  const p = await page('auth=ready');
  await p.waitForTimeout(700); await shot(p, 'intro'); await p.waitForTimeout(2300); await shot(p, 'home');
  await key(p, 'ArrowLeft', 3); await key(p, 'ArrowDown', 1, 700); await shot(p, 'home-2');
  await key(p, 'ArrowDown', 2, 700); await shot(p, 'home-3');
  await key(p, 'Enter', 1, 1800); await shot(p, 'player');
  await p.waitForTimeout(5000); await shot(p, 'player-hidden');
  await key(p, 'ArrowRight', 3, 120); await p.waitForTimeout(300); await shot(p, 'player-seek');
  await p.waitForTimeout(1500);
  await key(p, 'Escape', 1, 300);
}
if (which === 'all' || which === 'lib') {
  const p = await page('auth=ready');
  await p.waitForTimeout(2600);
  await key(p, 'ArrowUp', 3, 200); await key(p, 'ArrowLeft', 1, 900); await shot(p, 'library-nav');
  await key(p, 'ArrowDown', 1, 1600); await shot(p, 'library');
  await key(p, 'Enter', 1, 1200); await key(p, 'ArrowLeft', 2, 500); await shot(p, 'library-2');
  await key(p, 'ArrowDown', 2, 600); await shot(p, 'library-3');
  await key(p, 'ArrowUp', 6, 150); await key(p, 'ArrowLeft', 1, 1200); await key(p, 'ArrowDown', 1, 1500); await shot(p, 'chats');
  await key(p, 'Enter', 1, 1000); await shot(p, 'chat-open');
  await p.evaluate(() => NOVA.back()); await p.waitForTimeout(300); await key(p, 'ArrowLeft', 2, 1200); await key(p, 'ArrowDown', 1, 800); await shot(p, 'settings');
  await key(p, 'ArrowDown', 1, 300); await key(p, 'Enter', 1, 700); await shot(p, 'sheet');
  await p.evaluate(() => NOVA.back()); await p.waitForTimeout(400);
  await p.evaluate(() => NOVA.back()); await p.waitForTimeout(300); await key(p, 'ArrowRight', 1, 1200); await key(p, 'ArrowDown', 1, 600); await shot(p, 'search');
  await key(p, 'Enter', 1, 200); await p.keyboard.type('תחנה'); await p.keyboard.press('Enter'); await p.waitForTimeout(1500); await shot(p, 'search-results'); await key(p, 'ArrowDown', 2, 600); await shot(p, 'search-results2');
}
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors');
await browser.close();
