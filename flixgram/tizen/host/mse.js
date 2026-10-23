// Streams an MP4 from a byte source into <video> through Media Source Extensions: mp4box.js turns the
// regular MP4 into fragments on the fly, so playback starts after the first megabytes and seeking jumps
// straight to the right place in the file. Only what is near the playhead is kept in memory.
/* global MP4Box */

const CHUNK = 1 << 20;     // bytes per read
const AHEAD = 40;          // seconds buffered ahead of the playhead before reads pause
const BEHIND = 15;         // seconds kept behind the playhead
const MAX_PROBE = 24 << 20; // give up if no movie header shows up in this many bytes

function bufferedEnd(sb, t) {
  try {
    const b = sb.buffered;
    for (let i = 0; i < b.length; i++) if (b.start(i) <= t + 0.3 && b.end(i) >= t) return b.end(i);
  } catch (e) { /* removed */ }
  return t;
}

function sniff(ab) {
  const u = new Uint8Array(ab, 0, Math.min(12, ab.byteLength));
  if (u[0] === 0x1a && u[1] === 0x45 && u[2] === 0xdf && u[3] === 0xa3) return 'mkv';
  const tag = String.fromCharCode(u[4], u[5], u[6], u[7]);
  if (['ftyp', 'moov', 'mdat', 'free', 'skip', 'wide', 'pnot'].indexOf(tag) >= 0) return 'mp4';
  return 'other';
}

export class MseSession {
  /**
   * @param video   HTMLVideoElement
   * @param source  { size, read(offset, length) -> Promise<ArrayBuffer>, close() }
   * @param opts    { startMs, audio (index among audio tracks), emit(type, data) }
   */
  constructor(video, source, opts) {
    this.v = video;
    this.src = source;
    this.size = source.size;
    this.emit = opts.emit || (() => {});
    this.startSec = (opts.startMs || 0) / 1000;
    this.audioPick = opts.audio || 0;
    this.alive = true;
    this.pos = 0;
    this.gen = 0;
    this.reading = false;
    this.eof = false;
    this.opened = false;
    this.prepared = false;
    this.parsedBytes = 0;
    this.lanes = [];          // { id, sb, queue: [], kind }
    this.audioTracks = [];
    this.dur = 0;

    const mp4 = this.mp4 = MP4Box.createFile();
    mp4.onError = (mod, msg) => this.fail('format', mod + ': ' + msg);
    mp4.onReady = (info) => this.onReady(info);
    mp4.onSegment = (id, lane, buf, next) => { lane.queue.push({ buf, id, next }); this.drain(lane); };

    this.onTime = () => { this.pump(); this.trim(); };
    this.onWaiting = () => this.emit('buffering');
    this.onPlaying = () => this.emit('ready');
    this.onEnded = () => this.emit('ended');
    this.onError = () => {
      const e = this.v.error;
      this.fail(e && e.code === 4 ? 'codec' : 'media', e ? 'media error ' + e.code : 'media error');
    };
    this.onMeta = () => {
      if (this.prepared) return;
      this.prepared = true;
      this.emit('prepared', {
        dur: Math.round(this.dur * 1000),
        tracks: this.audioTracks.length > 1 ? this.audioTracks.map((t, i) => ({ index: i, type: 'audio', lang: t.language || 'und' })) : [],
        audioSel: this.audioTracks.length > 1 ? this.audioPick : -1,
        textSel: -1,
      });
    };
    video.addEventListener('timeupdate', this.onTime);
    video.addEventListener('waiting', this.onWaiting);
    video.addEventListener('playing', this.onPlaying);
    video.addEventListener('ended', this.onEnded);
    video.addEventListener('error', this.onError);
    video.addEventListener('loadeddata', this.onMeta);
    this.emit('buffering');
    this.pump();
  }

  // ---------------------------------------------------------------- reading

  needMore() {
    if (!this.opened) return true;
    if (this.lanes.some((l) => l.queue.length > 6)) return false;
    const t = this.v.currentTime || 0;
    return this.lanes.some((l) => bufferedEnd(l.sb, t) - t < AHEAD);
  }

  async pump() {
    if (this.reading || !this.alive) return;
    this.reading = true;
    try {
      while (this.alive && !this.eof && !this.waitOpen && this.needMore()) {
        const gen = this.gen;
        const at = this.pos;
        if (at >= this.size) { this.finish(); break; }
        const ab = await this.src.read(at, Math.min(CHUNK, this.size - at));
        if (!this.alive || gen !== this.gen) continue;   // a seek moved us while this was loading
        if (!this.parsedBytes && at === 0) {
          const kind = sniff(ab);
          if (kind !== 'mp4') { this.fail(kind === 'mkv' ? 'mkv' : 'format', 'not an MP4 file'); break; }
        }
        this.parsedBytes += ab.byteLength;
        if (!this.info && this.parsedBytes > MAX_PROBE) { this.fail('format', 'no movie header'); break; }
        ab.fileStart = at;
        const next = this.mp4.appendBuffer(ab);
        this.pos = typeof next === 'number' && next > 0 && next !== at ? next : at + ab.byteLength;
        if (this.pos >= this.size && this.opened) this.finish();
      }
    } catch (e) {
      if (this.alive) this.fail('network', String(e && e.message || e));
    }
    this.reading = false;
  }

  finish() {
    if (this.eof) return;
    this.eof = true;
    try { this.mp4.flush(); } catch (e) { /* nothing left */ }
    this.lanes.forEach((l) => this.drain(l));
  }

  // ---------------------------------------------------------------- set-up

  onReady(info) {
    this.info = info;
    this.dur = info.duration && info.timescale ? info.duration / info.timescale : 0;
    const video = info.videoTracks.filter((t) => MediaSource.isTypeSupported('video/mp4; codecs="' + t.codec + '"'))[0];
    const audios = info.audioTracks.filter((t) => MediaSource.isTypeSupported('audio/mp4; codecs="' + t.codec + '"'));
    if (!video && info.videoTracks.length) { this.fail('codec', 'video codec ' + info.videoTracks[0].codec); return; }
    if (!video && !audios.length) { this.fail('codec', 'no playable track'); return; }
    this.audioTracks = audios;
    if (this.audioPick >= audios.length) this.audioPick = 0;
    const picks = [];
    if (video) picks.push({ track: video, type: 'video/mp4; codecs="' + video.codec + '"', kind: 'video' });
    if (audios.length) picks.push({ track: audios[this.audioPick], type: 'audio/mp4; codecs="' + audios[this.audioPick].codec + '"', kind: 'audio' });
    this.waitOpen = true;
    const ms = this.ms = new MediaSource();
    ms.addEventListener('sourceopen', () => {
      if (!this.alive) return;
      try {
        if (this.dur) ms.duration = this.dur;
        picks.forEach((p) => {
          const sb = ms.addSourceBuffer(p.type);
          const lane = { id: p.track.id, sb, queue: [], kind: p.kind };
          sb.addEventListener('updateend', () => this.drain(lane));
          sb.addEventListener('error', () => this.fail('media', 'source buffer error'));
          this.lanes.push(lane);
          this.mp4.setSegmentOptions(p.track.id, lane, { nbSamples: 100 });
        });
        this.mp4.initializeSegmentation('per-track').forEach((s) => { s.user.queue.push({ buf: s.buffer, init: true }); this.drain(s.user); });
        const r = this.mp4.seek(this.startSec, true);
        this.pos = r.offset;
        this.v.currentTime = this.startSec;
        this.opened = true;
        this.waitOpen = false;
        this.mp4.start();
        this.pump();
      } catch (e) {
        this.fail('codec', String(e && e.message || e));
      }
    }, { once: true });
    this.v.src = URL.createObjectURL(ms);
  }

  // ---------------------------------------------------------------- feeding the buffers

  drain(lane) {
    if (!this.alive || !this.ms || this.ms.readyState === 'closed') return;
    const sb = lane.sb;
    if (sb.updating) return;
    const item = lane.queue[0];
    if (!item) {
      if (this.eof && this.lanes.every((l) => !l.queue.length && !l.sb.updating)) {
        try { this.ms.endOfStream(); } catch (e) { /* already ended */ }
      }
      if (!this.reading) this.pump();
      return;
    }
    try {
      if (item.remove) sb.remove(item.remove[0], item.remove[1]);
      else sb.appendBuffer(item.buf);
      lane.queue.shift();
      if (item.id !== undefined && !item.init) this.mp4.releaseUsedSamples(item.id, item.next);
    } catch (e) {
      if (e && e.name === 'QuotaExceededError') {
        // the TV's buffer is full: drop what was already watched and try again
        const t = this.v.currentTime || 0;
        const start = sb.buffered.length ? sb.buffered.start(0) : 0;
        if (t - 2 > start) { try { sb.remove(start, t - 2); } catch (er) { /* busy */ } }
        else setTimeout(() => this.drain(lane), 500);
      } else {
        this.fail('media', String(e && e.message || e));
      }
    }
  }

  trim() {
    const t = this.v.currentTime || 0;
    this.lanes.forEach((l) => {
      if (l.sb.updating || l.queue.length) return;
      try {
        const b = l.sb.buffered;
        if (b.length && b.start(0) < t - BEHIND - 10) l.sb.remove(b.start(0), t - BEHIND);
      } catch (e) { /* busy */ }
    });
  }

  // ---------------------------------------------------------------- control

  inBuffer(t) {
    return this.lanes.length > 0 && this.lanes.every((l) => {
      try {
        const b = l.sb.buffered;
        for (let i = 0; i < b.length; i++) if (b.start(i) <= t && b.end(i) > t + 1) return true;
      } catch (e) { /* removed */ }
      return false;
    });
  }

  seek(ms) {
    if (!this.alive) return;
    const t = Math.max(0, ms / 1000);
    if (!this.opened) { this.startSec = t; return; }
    if (this.inBuffer(t)) { this.v.currentTime = t; return; }
    this.gen++;
    this.mp4.stop();
    const end = Math.max(this.dur || 0, this.v.duration || 0, t) + 60;
    this.lanes.forEach((l) => {
      l.queue = [{ remove: [0, end] }];
      try { if (l.sb.updating) l.sb.abort(); } catch (e) { /* not open */ }
    });
    const r = this.mp4.seek(t, true);
    this.pos = r.offset;
    this.eof = false;
    this.v.currentTime = t;
    this.emit('buffering');
    this.mp4.start();
    this.lanes.forEach((l) => this.drain(l));
    this.pump();
  }

  fail(what, message) {
    if (!this.alive) return;
    this.emit('error', { what, message });
    this.close();
  }

  close() {
    if (!this.alive) return;
    this.alive = false;
    const v = this.v;
    v.removeEventListener('timeupdate', this.onTime);
    v.removeEventListener('waiting', this.onWaiting);
    v.removeEventListener('playing', this.onPlaying);
    v.removeEventListener('ended', this.onEnded);
    v.removeEventListener('error', this.onError);
    v.removeEventListener('loadeddata', this.onMeta);
    try { this.mp4.stop(); } catch (e) { /* not started */ }
    try { if (this.src.close) this.src.close(); } catch (e) { /* gone */ }
    this.lanes = [];
    this.mp4 = null;
  }
}
