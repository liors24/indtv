/* Bundles the INDTV Telegram app (src/main.js + Telegram MTProto library) into dist/app.js for old TV browsers.
 * Libraries come from tgtv/vendor (run ./vendor.sh first). */
const path = require('path'), fs = require('fs');
let esbuild;
try { esbuild = require('esbuild'); } catch (e) { esbuild = require(process.env.ESBUILD_PATH || '/opt/npm-tools/node_modules/esbuild'); }
const V = (p) => path.join(__dirname, 'vendor', p);
const S = (p) => path.join(__dirname, 'shim', p);
const alias = {
  telegram: V('gramjs/gramjs'),
  '@cryptography/utils': V('cryptography/packages/utils/src/index.ts'),
  'big-integer': V('BigInteger.js/BigInteger.js'),
  'async-mutex': V('async-mutex/src/index.ts'),
  'real-cancellable-promise': V('real-cancellable-promise/src/index.ts'),
  'ts-custom-error': V('ts-custom-error/src/index.ts'),
  pako: V('pako/src/index.ts'),
  '@cryptography/aes': V('cryptography/packages/aes/src/index.ts'),
  buffer: V('buffer/index.js'),
  'base64-js': V('base64-js/index.js'),
  ieee754: V('ieee754/index.js'),
  'path-browserify': V('path-browserify/index.js'),
  'qrcode-generator': V('qrcode-generator/js/dist/qrcode.js'),
  util: S('util.js'), mime: S('mime.js'), store2: S('store2.js'), htmlparser2: S('htmlparser2.js'),
  'htmlparser2/lib/Parser': S('htmlparser2.js'), websocket: S('websocket.js'), socks: S('socks.js'),
  fs: S('empty.js'), net: S('empty.js'), os: S('empty.js'), crypto: S('empty.js'), path: V('path-browserify/index.js'),
  'node-localstorage': S('empty.js')
};
// gramjs ships "-BROWSER" twins of its Node-only files: use them.
const browserTwins = {
  name: 'browser-twins',
  setup(b) {
    b.onResolve({ filter: /^\.\.?\// }, (args) => {
      if (!args.importer.includes(path.join('vendor', 'gramjs'))) return null;
      const base = path.resolve(args.resolveDir, args.path);
      for (const ext of ['.ts', '.js']) {
        const twin = base + '-BROWSER' + ext;
        if (fs.existsSync(twin)) return { path: twin };
      }
      return null;
    });
  }
};
// UI tests: swap the real Telegram service for the mock (no network, no MTProto bundle)
const mockPlugin = {
  name: 'mock-service',
  setup(b) { b.onResolve({ filter: /service\.js$/ }, (a) => (process.env.TG_MOCK && !/mock/.test(a.path) ? { path: path.join(__dirname, 'src', 'mock-service.js') } : null)); }
};
const entry = process.argv[2] || path.join(__dirname, 'src', 'main.js');
const out = process.argv[3] || path.join(__dirname, 'dist', 'app.js');
esbuild.build({
  entryPoints: [entry], bundle: true, minify: !process.env.TG_DEBUG, sourcemap: false, format: 'iife', target: ['es2017'],
  outfile: out, alias, plugins: [mockPlugin, browserTwins], logLevel: 'warning', legalComments: 'none',
  define: { '__TG_API_ID__': JSON.stringify(process.env.TG_API_ID || ''), '__TG_API_HASH__': JSON.stringify(process.env.TG_API_HASH || ''), 'process.env.NODE_ENV': '"production"', global: 'globalThis' },
  inject: [path.join(__dirname, 'shim', 'inject.js')],
  tsconfigRaw: JSON.stringify({ compilerOptions: { experimentalDecorators: true, useDefineForClassFields: false, target: 'es2017' } })
}).then(() => console.log('built', out, Math.round(fs.statSync(out).size / 1024) + ' KB')).catch(() => process.exit(1));
