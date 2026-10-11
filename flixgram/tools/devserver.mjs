import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const base = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = base + '/build/dev', tdir = base + '/mock/t'; // mock/t: run `python3 mock/gen.py` inside mock/
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.ttf': 'font/ttf', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  let file;
  if (p.startsWith('/t/')) { file = path.join(tdir, p.slice(3).replace('.jpg', '') + '.jpg'); }
  else file = path.join(root, p === '/' ? 'index.html' : p);
  fs.readFile(file, (e, d) => {
    if (e) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Access-Control-Allow-Origin': '*' });
    res.end(d);
  });
}).listen(8777, '127.0.0.1', () => console.log('dev on 8777'));
