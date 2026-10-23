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
// tizen: the Samsung TV app (TDLib in WebAssembly + the host in tizen/host), older Chromium engines
const tizen = mode === 'tizen';
const out = mode === 'dev' ? `${root}/build/dev` : tizen ? `${root}/build/tizen/app` : `${root}/build/assets/web`;
const target = tizen ? ['chrome56'] : ['chrome61'];
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(`${out}/fonts`, { recursive: true });
await esbuild.build({
  entryPoints: [`${root}/web-src/js/app.js`], bundle: true, minify: mode !== 'dev', sourcemap: false,
  target, format: 'iife', outfile: `${out}/app.js`, legalComments: 'none', charset: 'utf8',
});
if (tizen) {
  await esbuild.build({
    entryPoints: [`${root}/tizen/host/main.js`], bundle: true, minify: true, target, format: 'iife', outfile: `${out}/host.js`,
    legalComments: 'none', charset: 'utf8', define: { __VERSION__: JSON.stringify(process.env.VER_NAME || '1.0') },
  });
  fs.copyFileSync(`${root}/tizen/vendor/mp4box.min.js`, `${out}/mp4box.min.js`);
}
let css = fs.readFileSync(`${root}/web-src/app.css`, 'utf8');
// authored in 1920-wide design px; 1rem = 10 design px (html font-size = 100vw/192)
css = css.replace(/(-?\d*\.?\d+)px/g, (m, n) => (Math.abs(parseFloat(n)) <= 2 ? m : `${+(parseFloat(n) / 10).toFixed(2)}rem`));
const cssMin = await esbuild.transform(css, { loader: 'css', minify: mode !== 'dev', target });
fs.writeFileSync(`${out}/app.css`, cssMin.code);
let html = fs.readFileSync(`${root}/web-src/index.html`, 'utf8');
if (mode === 'dev') { html = html.replace('<!--MOCK-->', '<script src="mock.js"></script>'); fs.copyFileSync(`${root}/mock/mock.js`, `${out}/mock.js`); }
else if (tizen) {
  // app.html is the interface; index.html is a small start page that can run a newer downloaded interface
  const build = parseInt(process.env.BUILD || '0', 10) || 0;
  const key = process.env.TDWEB_KEY || 'dev';
  // no inline scripts in the installed pages: a TV's default content policy may block them
  fs.writeFileSync(`${out}/boot.js`, `var FLIX_BUILD = ${build}, FLIX_TDWEB = '${key}';\n` + fs.readFileSync(`${root}/tizen/bootdiag.js`, 'utf8'));
  // a plain-HTML version mark: visible even if no script runs (tells an old install from blocked scripts)
  html = html.replace('<div id="intro">', `<div id="intro"><div id="bootver" style="position:absolute;left:2vw;bottom:2vh;font:1.3vw sans-serif;color:rgba(255,255,255,.45);direction:ltr">Flixgram ${build} · html</div>`);
  html = html.replace('<!--MOCK-->', '<script src="boot.js"></script><script src="tdweb.js"></script><script src="mp4box.min.js"></script><script src="host.js"></script>');
  fs.writeFileSync(`${out}/shell.js`, fs.readFileSync(`${root}/tizen/shell.js`, 'utf8').replace('__BUILD__', String(build)).replace('__TDWEB__', key));
  fs.copyFileSync(`${root}/tizen/shell.html`, `${out}/index.html`);
}
fs.writeFileSync(`${out}/${tizen ? 'app.html' : 'index.html'}`, html);
if (tizen) {
  // the over-the-air bundle: app.html with the interface's own scripts and styles inlined
  const safe = (t) => t.replace(/<\/script/gi, '<\\/script');
  const inline = html.replace('<link rel="stylesheet" href="app.css">', () => '<style>' + fs.readFileSync(`${out}/app.css`, 'utf8').replace(/<\/style/gi, '<\\/style') + '</style>')
    .replace('<script src="host.js"></script>', () => '<script>' + safe(fs.readFileSync(`${out}/host.js`, 'utf8')) + '</script>')
    .replace('<script src="app.js"></script>', () => '<script>' + safe(fs.readFileSync(`${out}/app.js`, 'utf8')) + '</script>')
    .replace('<script src="boot.js"></script>', () => '<script>' + safe(fs.readFileSync(`${out}/boot.js`, 'utf8')) + '</script>');
  fs.mkdirSync(`${root}/build/tizen/ota`, { recursive: true });
  fs.writeFileSync(`${root}/build/tizen/ota/bundle.json`, JSON.stringify({ build: parseInt(process.env.BUILD || '0', 10) || 0, tdweb: process.env.TDWEB_KEY || 'dev', html: inline }));
}
fs.copyFileSync(`${root}/web-src/logo.svg`, `${out}/logo.svg`);
for (const f of fs.readdirSync(`${root}/web-src/fonts`)) fs.copyFileSync(`${root}/web-src/fonts/${f}`, `${out}/fonts/${f}`);
console.log('built', mode, '->', out);
