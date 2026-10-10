/* TeleTV — progressive playback engine.
 * Telegram files can only be fetched through MTProto (no URL), so the file is downloaded in order, in
 * big blocks, and the <video> element is fed a growing Blob. When playback nears the end of the data
 * that is available, the element is re-pointed at a bigger Blob and resumes at the same position. */
import { Service } from './service.js';

const BLOCK = 4 * 1024 * 1024;       // multiple of Service.PART
const PARALLEL = 3;
const START_BYTES = 6 * 1024 * 1024;  // enough to start almost any video
const SWAP_MIN = 8 * 1024 * 1024;     // do not re-point for less new data than this (unless finished)

/** Is the MP4 "moov" index at the start? Returns true / false / null (not an MP4 / unknown). */
export function moovFirst(buf) {
  const u = new Uint8Array(buf);
  const dv = new DataView(buf);
  let p = 0, n = 0;
  const type = (o) => String.fromCharCode(u[o], u[o + 1], u[o + 2], u[o + 3]);
  if (u.length < 16 || type(4) !== 'ftyp') return null;
  while (p + 8 <= u.length && n++ < 32) {
    let size = dv.getUint32(p), tp = type(p + 4);
    if (size === 1 && p + 16 <= u.length) size = dv.getUint32(p + 8) * 4294967296 + dv.getUint32(p + 12);
    if (tp === 'moov') return true;
    if (tp === 'mdat') return false;
    if (size < 8) return null;
    p += size;
  }
  return null;     // index not within the first block: assume fine
}

export class Progressive {
  /** opts: item, video, onState({loaded,total,buffering,error,done}) */
  constructor(opts) {
    this.item = opts.item; this.v = opts.video; this.cb = opts.onState || (() => {});
    this.total = opts.item.size || 0;
    this.parts = []; this.loaded = 0; this.done = false; this.stopped = false;
    this.mime = (opts.item.mime && opts.item.mime.indexOf('/') > 0) ? opts.item.mime : (opts.item.type === 'audio' ? 'audio/mpeg' : 'video/mp4');
    this.url = null; this.swapped = 0; this.pendingSeek = null; this.started = false; this.waitFull = false; this.err = null;
    this._onTime = () => this._maybeSwap();
    this.v.addEventListener('timeupdate', this._onTime);
    this.v.addEventListener('waiting', this._onTime);
    this.userPaused = false; this.errored = false;
    this.v.addEventListener('error', () => { if (!this.done && !this.stopped) { this.errored = true; this._state({ waiting: true }); this._maybeSwap(); } });
    this.v.addEventListener('ended', () => { if (!this.done) { this._state({ waiting: true }); this._maybeSwap(); } });
    this._run();
  }
  _state(extra) { this.cb(Object.assign({ loaded: this.loaded, total: this.total, done: this.done, error: this.err, waitFull: this.waitFull }, extra || {})); }
  async _run() {
    try {
      const total = this.total;
      if (!total) throw new Error('NO_SIZE');
      const nBlocks = Math.ceil(total / BLOCK);
      const results = {};       // index -> Blob
      let nextFetch = 0, nextAppend = 0, inflight = 0, firstChecked = false;
      await new Promise((resolve, reject) => {
        const pump = () => {
          if (this.stopped) return resolve();
          while (inflight < PARALLEL && nextFetch < nBlocks && (nextFetch - nextAppend) < PARALLEL + 2) {
            const i = nextFetch++; inflight++;
            this._fetchBlock(i).then((blob) => {
              inflight--; results[i] = blob;
              while (results[nextAppend]) {
                this.parts.push(results[nextAppend]); this.loaded += results[nextAppend].size; delete results[nextAppend]; nextAppend++;
              }
              if (!firstChecked && nextAppend > 0) { firstChecked = true; this._checkFirst(); }
              this.done = nextAppend >= nBlocks;
              this._state();
              this._feed();
              if (this.done) resolve(); else pump();
            }, reject);
          }
        };
        pump();
      });
    } catch (e) { if (!this.stopped) { this.err = e; this._state(); } }
  }
  async _fetchBlock(i) {
    let last;
    for (let attempt = 0; attempt < 4 && !this.stopped; attempt++) {
      try {
        const off = i * BLOCK, len = Math.min(BLOCK, this.total - off);
        const b = await Service.fetchRange(this.item, off, len);
        if (b.size < len && off + b.size < this.total) throw new Error('SHORT');
        return b.size > len ? b.slice(0, len) : b;
      } catch (e) {
        last = e;
        const m = String((e && (e.errorMessage || e.message)) || '');
        if (/FILE_REFERENCE|AUTH_KEY|FILE_ID_INVALID/.test(m) && attempt === 0) throw e;
        await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
      }
    }
    throw last || new Error('FETCH');
  }
  async _checkFirst() {
    if (!/mp4|quicktime|m4v|m4a/i.test(this.mime) && !/\.(mp4|m4v|mov|m4a)$/i.test(this.item.name || '')) return;
    try {
      const head = await this.parts[0].slice(0, Math.min(this.parts[0].size, 1024 * 1024)).arrayBuffer();
      if (moovFirst(head) === false) { this.waitFull = true; this._state(); }
    } catch (e) { /* ignore */ }
  }
  _feed() {
    if (this.stopped) return;
    if (this.waitFull) { if (this.done) this._swap(true); return; }
    if (!this.started) {
      if (this.loaded >= Math.min(START_BYTES, this.total) || this.done) { this.started = true; this._swap(true); }
      return;
    }
    if (this.pendingSeek !== null && this.done) this._swap(true);
    else this._maybeSwap();
  }
  _maybeSwap() {
    if (!this.started || this.stopped || this.done && this.swapped >= this.loaded) return;
    const v = this.v, gain = this.loaded - this.swapped;
    if (this.pendingSeek !== null && isFinite(v.duration) && v.duration > 0) {
      if (this.done || this.loaded >= (this.pendingSeek / v.duration) * this.total * 1.02) this._swap(true);
      return;
    }
    if (gain <= 0) return;
    if (!this.done && gain < SWAP_MIN && !(v.ended || v.readyState < 3 || this.errored)) return;
    const dur = v.duration;
    let near = v.readyState < 3 || v.ended || this.errored;
    if (!near && isFinite(dur) && dur > 0) {
      let be = 0; try { for (let i = 0; i < v.buffered.length; i++) if (v.buffered.start(i) <= v.currentTime + 0.5) be = Math.max(be, v.buffered.end(i)); } catch (e) { /* ignore */ }
      near = (be - v.currentTime) < 6;
      // buffered ranges are unreliable for a cut-off file, so also compare the byte position (estimate)
      if (!near && this.total && (v.currentTime / dur) * this.total > this.swapped * 0.7) near = true;
    }
    if (near || this.pendingSeek !== null) this._swap();
  }
  _swap(force) {
    const v = this.v;
    if (!this.loaded || (!force && this.swapped >= this.loaded)) return;
    const t = this.pendingSeek !== null ? this.pendingSeek : (v.currentTime || 0);
    const playing = !this.userPaused;
    this.pendingSeek = null; this.errored = false;
    const blob = new Blob(this.parts, { type: this.mime });
    const old = this.url;
    this.url = URL.createObjectURL(blob); this.swapped = this.loaded;
    const go = () => {
      v.removeEventListener('loadedmetadata', go);
      try { if (t > 0) v.currentTime = t; } catch (e) { /* ignore */ }
      if (playing || !this.firstPlayed) { this.firstPlayed = true; const p = v.play(); if (p && p.catch) p.catch(() => {}); }
    };
    v.addEventListener('loadedmetadata', go);
    v.src = this.url;
    v.load();
    if (old) setTimeout(() => { try { URL.revokeObjectURL(old); } catch (e) { /* ignore */ } }, 4000);
  }
  /** Seek in seconds. If that spot is not downloaded yet, wait for the data. */
  seek(t) {
    const v = this.v, dur = v.duration;
    if (!isFinite(dur) || dur <= 0 || this.done) { try { v.currentTime = Math.max(0, t); } catch (e) { /* ignore */ } return true; }
    t = Math.max(0, Math.min(dur - 0.5, t));
    const need = (t / dur) * this.total * 1.02;
    if (need <= this.swapped * 0.97) { v.currentTime = t; return true; }
    this.pendingSeek = t; this._state({ waiting: true });
    if (need <= this.loaded) this._swap();
    return false;
  }
  stop() {
    this.stopped = true;
    this.v.removeEventListener('timeupdate', this._onTime); this.v.removeEventListener('waiting', this._onTime);
    try { this.v.pause(); this.v.removeAttribute('src'); this.v.load(); } catch (e) { /* ignore */ }
    if (this.url) { try { URL.revokeObjectURL(this.url); } catch (e) { /* ignore */ } }
    this.parts = [];
  }
}
