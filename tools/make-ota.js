/* Builds the over-the-air bundle: index.html with all local scripts and styles inlined.
 * Usage: node tools/make-ota.js <build-number> <out.json> */
const fs = require('fs'), path = require('path');
const web = path.join(__dirname, '..', 'web');
const build = parseInt(process.argv[2], 10) || 0;
let html = fs.readFileSync(path.join(web, 'app.html'), 'utf8');
html = html.replace(/INDTV_BUILD = \d+;/, 'INDTV_BUILD = ' + build + ';');
const safe = (s) => s.replace(/<\/script/gi, '<\\/script');
html = html.replace(/<script src="(?!https?:)([^"]+)"><\/script>/g, (m, src) => '<script>' + safe(fs.readFileSync(path.join(web, src), 'utf8')) + '</script>');
html = html.replace(/<link rel="stylesheet" href="(?!https?:)([^"]+)">/g, (m, href) => {
  // url() paths inside a stylesheet are relative to it; once inlined they must be relative to the page.
  const dir = path.posix.dirname(href);
  const css = fs.readFileSync(path.join(web, href), 'utf8').replace(/url\((['"]?)(?!data:|https?:|\/|#)([^'")]+)\1\)/g,
    (u, q, rel) => 'url(' + q + path.posix.normalize(path.posix.join(dir, rel)) + q + ')');
  return '<style>' + css.replace(/<\/style/gi, '<\\/style') + '</style>';
});
fs.writeFileSync(process.argv[3], JSON.stringify({ build, html }));
console.log('bundle', build, Math.round(html.length / 1024) + ' KB');
