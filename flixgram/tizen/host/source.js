// Reads byte ranges of a Telegram file through TDLib (tdweb), for the streaming player.
// TDLib downloads only the parts that are asked for; to keep the TV's memory bounded the partial file
// is deleted and restarted after BUDGET bytes, and whenever the viewer jumps back before what is kept.

const AHEAD = 12 << 20;     // ask TDLib to fetch this far ahead of the read position
const BUDGET = 160 << 20;   // bytes of one file kept in memory before starting a fresh partial file
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class TdSource {
  constructor(td, fileId, size) {
    this.td = td;
    this.id = fileId;
    this.size = size;
    this.low = 0;          // first offset of the current partial file
    this.asked = -1;       // end of the range last requested from TDLib
    this.askedFrom = -1;
    this.closed = false;
  }

  static async open(td, fileId) {
    const f = await td.send({ '@type': 'getFile', file_id: fileId });
    if (window.flog) window.flog('file ' + fileId + ' size=' + f.size + ' expected=' + f.expected_size + ' path=' + (f.local && f.local.path ? 'yes' : 'no'));
    const size = f.size || f.expected_size || 0;
    return new TdSource(td, fileId, size);
  }

  async reset(offset) {
    try { await this.td.send({ '@type': 'cancelDownloadFile', file_id: this.id, only_if_pending: false }); } catch (e) { /* nothing running */ }
    try { await this.td.send({ '@type': 'deleteFile', file_id: this.id }); } catch (e) { /* nothing stored */ }
    this.low = offset;
    this.asked = -1;
    this.askedFrom = -1;
  }

  ask(offset) {
    const limit = Math.min(AHEAD, this.size - offset);
    this.askedFrom = offset;
    this.asked = offset + limit;
    return this.td.send({ '@type': 'downloadFile', file_id: this.id, priority: 32, offset, limit, synchronous: false }).catch(() => null);
  }

  async prefix(offset) {
    try {
      const r = await this.td.send({ '@type': 'getFileDownloadedPrefixSize', file_id: this.id, offset });
      // TDLib 1.8.36 answers fileDownloadedPrefixSize { size }; older versions answered count { count }
      return (r.size != null ? r.size : r.count) || 0;
    } catch (e) {
      return 0;
    }
  }

  /** Resolves with an ArrayBuffer of [offset, offset + length). */
  async read(offset, length) {
    length = Math.min(length, this.size - offset);
    if (length <= 0) return new ArrayBuffer(0);
    if (offset < this.low || offset + length - this.low > BUDGET) await this.reset(offset);
    // keep TDLib busy a little ahead of what is read, without restarting a range that already covers us
    if (offset < this.askedFrom || offset + length > this.asked - (AHEAD >> 2)) await this.ask(offset);
    let waited = 0;
    for (;;) {
      if (this.closed) throw new Error('closed');
      if (await this.prefix(offset) >= length) break;
      await sleep(waited < 2000 ? 60 : 200);
      waited += waited < 2000 ? 60 : 200;
      if (waited > 3000 && waited % 3000 < 200) await this.ask(offset);   // nudge a stalled download
      if (waited > 90000) throw new Error('timeout');
    }
    let part;
    try {
      part = await this.td.send({ '@type': 'readFilePart', file_id: this.id, offset, count: length });
    } catch (e) {
      if (window.flog) window.flog('readFilePart failed at ' + offset + ': ' + JSON.stringify(e).slice(0, 200));
      throw e;
    }
    const buf = await blobBuffer(part.data);
    this.reads = (this.reads || 0) + 1;
    if (window.flog && this.reads <= 3) window.flog('read #' + this.reads + ' at ' + offset + ' len=' + buf.byteLength + ' waited=' + waited + 'ms size=' + this.size);
    return buf;
  }

  async close() {
    this.closed = true;
    await this.reset(0);
  }
}

export function blobBuffer(data) {
  if (data instanceof ArrayBuffer) return Promise.resolve(data);
  if (data && data.buffer instanceof ArrayBuffer) return Promise.resolve(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
  if (data && typeof data.arrayBuffer === 'function') return data.arrayBuffer();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsArrayBuffer(data);
  });
}

/** Same interface over plain HTTP ranges (browser tests). */
export class HttpSource {
  constructor(url, size) {
    this.url = url;
    this.size = size;
  }

  static async open(url) {
    const r = await fetch(url, { method: 'HEAD' });
    return new HttpSource(url, parseInt(r.headers.get('content-length'), 10) || 0);
  }

  async read(offset, length) {
    length = Math.min(length, this.size - offset);
    const r = await fetch(this.url, { headers: { Range: `bytes=${offset}-${offset + length - 1}` } });
    return r.arrayBuffer();
  }

  close() {}
}
