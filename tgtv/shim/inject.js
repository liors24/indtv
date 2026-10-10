import { Buffer } from 'buffer';
if (typeof globalThis.Buffer === 'undefined') globalThis.Buffer = Buffer;
if (typeof globalThis.process === 'undefined') globalThis.process = { env: {}, platform: 'browser', version: '', versions: {}, nextTick: (f, ...a) => Promise.resolve().then(() => f(...a)), browser: true, cwd: () => '/' };
export { Buffer };
