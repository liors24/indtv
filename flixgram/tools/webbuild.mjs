// Bundles web-src into the APK asset folder (prod) or a browser preview with the mock host (dev).
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let esbuild;
for (const base of [root + '/', '/opt/npm-tools/node_modules/']) {
  try { esbuild = createRequire(base)('esbuild'); break; } catch (e) { /* next */ }
}
if (!esbuild) throw new Error('esbuild not found: npm install esbuild');
const mode = process.argv[2] || 'prod';
const out = mode === 'dev' ? `${root}/build/dev` : `${root}/build/assets/web`;
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(`${out}/fonts`, { recursive: true });
await esbuild.build({
  entryPoints: [`${root}/web-src/js/app.js`], bundle: true, minify: mode !== 'dev', sourcemap: false,
  target: ['chrome61'], format: 'iife', outfile: `${out}/app.js`, legalComments: 'none', charset: 'utf8',
});
let css = fs.readFileSync(`${root}/web-src/app.css`, 'utf8');
// authored in 1920-wide design px; 1rem = 10 design px (html font-size = 100vw/192)
css = css.replace(/(-?\d*\.?\d+)px/g, (m, n) => (Math.abs(parseFloat(n)) <= 2 ? m : `${+(parseFloat(n) / 10).toFixed(2)}rem`));
const cssMin = await esbuild.transform(css, { loader: 'css', minify: mode !== 'dev', target: ['chrome61'] });
fs.writeFileSync(`${out}/app.css`, cssMin.code);
let html = fs.readFileSync(`${root}/web-src/index.html`, 'utf8');
if (mode === 'dev') { html = html.replace('<!--MOCK-->', '<script src="mock.js"></script>'); fs.copyFileSync(`${root}/mock/mock.js`, `${out}/mock.js`); }
else html = html.replace('<!--MOCK-->', '');
fs.writeFileSync(`${out}/index.html`, html);
fs.copyFileSync(`${root}/web-src/logo.svg`, `${out}/logo.svg`);
for (const f of fs.readdirSync(`${root}/web-src/fonts`)) fs.copyFileSync(`${root}/web-src/fonts/${f}`, `${out}/fonts/${f}`);
console.log('built', mode, '->', out);
