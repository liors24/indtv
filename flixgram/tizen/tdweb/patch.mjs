// Adapts TDLib's tdweb (example/web/tdweb/src) for Flixgram on Samsung TVs:
//  * big streamed files are kept sparse in memory (sparse.js)
//  * a finished big download is not copied whole into IndexedDB
//  * only the WebAssembly build is shipped (no asm.js fallback)
//  * the .wasm is read with XMLHttpRequest when fetch() can't open packaged files
// Usage: node patch.mjs <tdweb/src>
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = process.argv[2];
if (!src) throw new Error('usage: node patch.mjs <tdweb/src>');

function edit(file, pairs) {
  const p = path.join(src, file);
  let s = fs.readFileSync(p, 'utf8');
  for (const [from, to] of pairs) {
    if (!s.includes(from)) throw new Error(`${file}: anchor not found: ${from}`);
    s = s.split(from).join(to);
  }
  fs.writeFileSync(p, s);
  console.log('patched', file);
}

edit('worker.js', [
  ["import td_asmjs_mem_release from './prebuilt/release/td_asmjs.js.mem';\n", 'const td_asmjs_mem_release = null;\n'],
  ["(await import('./prebuilt/release/td_asmjs.js'))", "(await Promise.reject(new Error('asm.js build is not included')))"],
  ['this.FS = this.TdModule.FS;', 'this.FS = this.TdModule.FS;\n    flixSparse(this.FS);'],
  ['if (file.local.is_downloading_completed) {', 'if (file.local.is_downloading_completed && !(file.size > 8388608)) {'],
  // the caller may turn the message database off: it grows with every channel scanned and tdweb copies
  // the whole database file to IndexedDB every few seconds, which stalls a TV
  ['query.use_message_database = useDb;', 'query.use_message_database = useDb && query.use_message_database !== false;'],
]);
const worker = path.join(src, 'worker.js');
fs.writeFileSync(worker, fs.readFileSync(worker, 'utf8') + '\n' + fs.readFileSync(path.join(here, 'sparse.js'), 'utf8'));

const bytes = `function flixBytes(url) {
  return fetch(url).then(r => { if (!r.ok && r.status !== 0) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); }).catch(
    () => new Promise((resolve, reject) => {
      const x = new XMLHttpRequest();
      x.open('GET', url, true);
      x.responseType = 'arraybuffer';
      x.onload = () => (x.response ? resolve(x.response) : reject(new Error('empty wasm')));
      x.onerror = () => reject(new Error('cannot read ' + url));
      x.send();
    }));
}
`;
edit('wasm-utils.js', [
  ['export async function instantiateStreaming(url, importObject) {', bytes + 'export async function instantiateStreaming(url, importObject) {'],
  ['  return fetch(url)\n    .then(response => response.arrayBuffer())\n    .then(bytes =>', '  return flixBytes(url)\n    .then(bytes =>'],
  ['    return fetch(url)\n      .then(response => response.arrayBuffer())\n      .then(buffer =>', '    return flixBytes(url)\n      .then(buffer =>'],
]);
