import { createRequire } from 'module';
const require = createRequire('/opt/npm-tools/node_modules/');
const { chromium } = require('playwright');
const browser = await chromium.launch();
const errors = [];
const OUT = process.env.OUT || '/tmp/claude-0/shots2';
async function page(q) {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const p = await ctx.newPage();
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  p.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
  await p.goto('http://127.0.0.1:8777/?' + q);
  return p;
}
const key = async (p, k, n = 1, wait = 160) => { for (let i = 0; i < n; i++) { await p.keyboard.press(k); await p.waitForTimeout(wait); } };
const shot = (p, name) => p.screenshot({ path: `${OUT}/${name}.png` });
const back = async (p) => { await p.evaluate(() => NOVA.back()); await p.waitForTimeout(350); };
const which = process.argv[2] || 'all';

if (which === 'all' || which === 'home') {
  const p = await page('auth=ready&taste=1');
  await p.waitForTimeout(3200); await shot(p, 'home-reco');
  await key(p, 'ArrowDown', 1, 700); await shot(p, 'home-reco2');
  await key(p, 'Enter', 1, 1800); await shot(p, 'player');
  const st = await p.evaluate(() => JSON.parse(NovaHost.state()));
  console.log('autoplay state after open:', JSON.stringify(st));
  await key(p, 'ArrowLeft', 7, 200); await shot(p, 'player-nav');
  // find mute and press it
  for (let i = 0; i < 12; i++) { const t = await p.evaluate(() => document.querySelector('.is-focus') && document.querySelector('.is-focus').className); if (t && t.indexOf('mute') >= 0) break; await key(p, 'ArrowRight', 1, 150); }
  await key(p, 'Enter', 1, 400); await shot(p, 'player-muted');
  console.log('muted:', await p.evaluate(() => JSON.parse(NovaHost.state()).muted));
}
if (which === 'all' || which === 'side') {
  const p = await page('auth=ready');
  await p.waitForTimeout(2600);
  await back(p); await key(p, 'ArrowLeft', 1, 900); await key(p, 'ArrowDown', 1, 1500);
  await shot(p, 'library');
  // go to the ☰ button: up from first source row
  await key(p, 'ArrowUp', 1, 300); await shot(p, 'library-menu-focus');
  await key(p, 'Enter', 1, 600); await shot(p, 'library-collapsed');
  await key(p, 'ArrowDown', 2, 300); await key(p, 'ArrowLeft', 1, 700); await shot(p, 'library-collapsed-content');
}
if (which === 'all' || which === 'search') {
  const p = await page('auth=ready');
  await p.waitForTimeout(2600);
  await back(p); await key(p, 'ArrowLeft', 3, 900); await key(p, 'ArrowDown', 1, 500);
  await shot(p, 'search-empty');
  await key(p, 'ArrowDown', 1, 300); await key(p, 'ArrowLeft', 1, 300); await shot(p, 'search-scope-focus');
  await key(p, 'Enter', 1, 1400); await shot(p, 'search-in-chat');
  await key(p, 'ArrowUp', 1, 300); await key(p, 'Enter', 1, 200); await p.keyboard.type('Grey'); await p.keyboard.press('Enter'); await p.waitForTimeout(1500);
  await shot(p, 'search-in-chat-query');
}
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors');
await browser.close();
