import { createRequire } from 'module';
const require = createRequire('/opt/npm-tools/node_modules/');
const { chromium } = require('playwright');
const browser = await chromium.launch();
const errors = [];
const OUT = '/tmp/claude-0/shots3';
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const p = await ctx.newPage();
p.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const key = async (k, n = 1, w = 200) => { for (let i = 0; i < n; i++) { await p.keyboard.press(k); await p.waitForTimeout(w); } };
const shot = (n) => p.screenshot({ path: `${OUT}/${n}.png` });
await p.goto('http://127.0.0.1:8777/?auth=ready');
await p.waitForTimeout(2800);
await shot('home-nav');
// library -> Grey's channel
await p.evaluate(() => NOVA.back()); await p.waitForTimeout(300);
await key('ArrowLeft', 1, 900); await key('ArrowDown', 1, 1200);
await key('ArrowDown', 3, 900); await key('Enter', 1, 1500);
await key('Enter', 1, 2000); // play first card
await shot('player');
// move focus to quality pill
for (let i = 0; i < 14; i++) { const c = await p.evaluate(() => (document.querySelector('.is-focus') || {}).className || ''); if (c.indexOf('quality') >= 0) break; await key('ArrowRight', 1, 120); }
await key('Enter', 1, 900); await shot('quality-sheet');
// pin current
const rows = await p.evaluate(() => Array.from(document.querySelectorAll('.sheet-row')).map((r) => r.textContent));
console.log('sheet rows:', rows.join(' | '));
// choose 480p
const idx = rows.findIndex((t) => t.indexOf('480p') === 0);
await p.evaluate((i) => document.querySelectorAll('.sheet-row')[i]._onselect(), idx);
await p.waitForTimeout(1500); await shot('player-480');
console.log('quality pill:', await p.evaluate(() => document.querySelector('.pl-pill.quality').textContent));
// pin 480 for this chat
for (let i = 0; i < 14; i++) { const c = await p.evaluate(() => (document.querySelector('.is-focus') || {}).className || ''); if (c.indexOf('quality') >= 0) break; await key('ArrowRight', 1, 120); }
await key('Enter', 1, 900);
const rows2 = await p.evaluate(() => Array.from(document.querySelectorAll('.sheet-row')).map((r) => r.textContent));
console.log('sheet rows 2:', rows2.join(' | '));
await p.evaluate(() => { const r = Array.from(document.querySelectorAll('.sheet-row')).find((x) => x.textContent.indexOf('לקבע') === 0); r._onselect(); });
await p.waitForTimeout(500);
console.log('pins:', await p.evaluate(() => localStorage.getItem('nova.quality')));
// next episode should open in 480p automatically
await p.evaluate(() => NOVA.key('next')); await p.waitForTimeout(3500);
console.log('after next pill:', await p.evaluate(() => document.querySelector('.pl-pill.quality').textContent), await p.evaluate(() => document.querySelector('.pl-sub') && document.querySelector('.pl-sub').textContent));
await shot('player-next');
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors');
await browser.close();
