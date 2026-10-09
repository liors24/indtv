// Node test: node tests/parser.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
global.window = undefined;
const load = (p) => { new Function(fs.readFileSync(path.join(__dirname, '..', p), 'utf8'))(); };
load('js/core/util.js'); load('js/core/store.js'); load('js/data/m3u-parser.js');
const P = globalThis.INDTV.M3UParser;

const text = fs.readFileSync(path.join(__dirname, 'fixture-in.m3u'), 'utf8');
assert.strictEqual(P.classify(text), 'channels');
const hls = '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:6\n#EXTINF:6.0,\nseg1.ts\n';
assert.strictEqual(P.classify(hls), 'hls', 'HLS media manifest must not be treated as channel list');
assert.strictEqual(P.classify('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nlow.m3u8'), 'hls');
assert.strictEqual(P.classify('<html>nope</html>'), 'invalid');

const r = P.parse(text, { id: 'builtin-in', name: 'India Built-in' });
const e = r.entries;
console.log('stats', r.stats);
assert.strictEqual(r.stats.extinf, 19);
assert.strictEqual(e.length, 16, 'bad scheme, rtmp and dangling entries are dropped');
assert.strictEqual(r.stats.unsupportedScheme, 1);
// mapping example from the spec
assert.strictEqual(e[0].tvgId, '4TVNews.in@SD');
assert.strictEqual(e[0].name, '4TV News');
assert.strictEqual(e[0].quality, '576p');
assert.strictEqual(e[0].logoUrl, 'https://i.imgur.com/fixture4tv.png');
assert.strictEqual(e[0].groupTitle, 'News');
assert.strictEqual(e[0].url, 'https://cdn-4.pishow.tv/live/1007/master.m3u8');
// logo used verbatim
e.forEach((x) => { if (x.rawLogo) assert.strictEqual(x.logoUrl, x.rawLogo); });
// empty tvg-logo → null (fallback), not invented
assert.strictEqual(e.find((x) => x.name === 'B4U Hitz').logoUrl, null);
// flags and VLC options
const shem = e.find((x) => x.name === 'Shemaroo Bhakti');
assert.ok(shem.notAlways); assert.strictEqual(shem.referrer, 'https://example.test/');
assert.ok(e.find((x) => x.tvgId === 'AajTak.in@HD').geoBlocked);
// group split
assert.deepStrictEqual(e.find((x) => x.name === 'ChuChu TV').groups, ['Kids', 'Animation']);
// comma inside quoted attribute / name
const comma = e.find((x) => x.tvgName === 'Comma, Channel');
assert.strictEqual(comma.name, 'Comma, Channel');

// catalog: identity + dedup + multi-source
global.location = { protocol: 'https:' };
load('js/core/i18n.js'); 
globalThis.document = undefined;
load('js/data/repositories.js');
const cat = globalThis.INDTV._buildCatalog([e]);
const aaj = cat.channels.find((c) => c.id === 'id:aajtak.in');
assert.ok(aaj, 'feeds @SD/@HD merge into one logical channel');
assert.strictEqual(aaj.sources.length, 2);
assert.strictEqual(aaj.logoUrl, 'https://i.imgur.com/fixtureaaj.png', 'first parsed tvg-logo is canonical');
assert.ok(!aaj.sources[0].geoBlocked, 'non geo-blocked source first');
const noid = cat.channels.find((c) => c.id === 'nm:noidchannel');
assert.strictEqual(noid.sources.length, 2, 'name identity merges entries without tvg-id');
const b4u = cat.channels.find((c) => c.name === 'B4U Hitz');
assert.ok(b4u.sources[0].insecure, 'http source flagged on https page');
assert.strictEqual(new Set(cat.channels.map((c) => c.id)).size, cat.channels.length);
console.log('channels', cat.channels.length, 'groups', cat.groups.map((g) => g.name + ':' + g.count).join(', '));
// second playlist (Free-TV style): attaches to existing channels by name, never merges by shared domain ids
const free = P.parse(`#EXTM3U x-tvg-url="https://example.test/epg.xml.gz"
#EXTINF:-1 tvg-id="4tvnews.com" tvg-name="4TV News" tvg-logo="https://example.test/4tv.png" group-title="India",4TV News
https://official-cdn.test/4tv/master.m3u8
#EXTINF:-1 tvg-id="News18.com" tvg-logo="" group-title="India",News18 Telugu
https://official-cdn.test/n18te.m3u8
#EXTINF:-1 tvg-id="News18.com" tvg-logo="" group-title="India",News18 Marathi
https://official-cdn.test/n18mr.m3u8
#EXTINF:-1 tvg-id="DDNational.in" group-title="India",DD National
https://www.youtube.com/watch?v=abc
`, { id: 'builtin-freetv-in', name: 'Free-TV India' });
assert.strictEqual(free.kind, 'channels', '.m3u8 channel list with attributes is a catalog');
assert.strictEqual(free.entries.length, 3, 'YouTube page links are skipped');
const cat2 = globalThis.INDTV._buildCatalog([e, free.entries], [false, true]);
const tv4 = cat2.channels.find((c) => c.name === '4TV News');
assert.strictEqual(tv4.sources.length, 2, 'Free-TV stream attaches to the existing 4TV News channel');
assert.ok(tv4.sources[0].preferred && tv4.sources[0].url.includes('official-cdn'), 'official stream tried first');
assert.strictEqual(tv4.logoUrl, 'https://i.imgur.com/fixture4tv.png', 'canonical logo stays the first tvg-logo');
assert.ok(cat2.channels.find((c) => c.name === 'News18 Telugu') && cat2.channels.find((c) => c.name === 'News18 Marathi'), 'shared non-iptv-org ids do not merge different channels');
console.log('ALL PARSER TESTS PASSED');
