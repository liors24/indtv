// The video surface for Samsung TVs: a <video> behind the transparent interface (like Android's
// SurfaceView behind the WebView), driven through the same calls the Android host offers.
import { MseSession } from './mse.js';

export function createPlayer(openSource) {
  let video = null;
  let session = null;
  let token = 0;
  let speed = 1;
  let muted = false;
  let fit = 'contain';
  let box = null;

  function el() {
    if (video) return video;
    video = document.createElement('video');
    video.id = 'tvvideo';
    video.setAttribute('playsinline', '');
    video.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:-1;background:#000;object-fit:contain;display:none';
    document.documentElement.appendChild(video);
    return video;
  }

  function layout() {
    if (!video) return;
    const s = video.style;
    if (box) {
      s.left = box[0] * 100 + 'vw'; s.top = box[1] * 100 + 'vh';
      s.width = box[2] * 100 + 'vw'; s.height = box[3] * 100 + 'vh';
      s.objectFit = 'cover';
      s.background = 'transparent';
    } else {
      s.left = s.top = '0'; s.width = '100vw'; s.height = '100vh';
      s.objectFit = fit;
      s.background = '#000';
    }
  }

  function emit(type, data) {
    if (window.flog && type !== 'buffering' && type !== 'ready') window.flog('player ' + type + ' ' + JSON.stringify(data || {}).slice(0, 300));
    const ev = Object.assign({ type }, data || {});
    if (window.__player) { try { window.__player(ev); } catch (e) { console.error(e); } }
  }

  function parse(url) {
    const m = /\/f\/(\d+)/.exec(url || '');
    return m ? parseInt(m[1], 10) : 0;
  }

  async function play(url, startMs, audio) {
    if (window.flog) window.flog('play ' + url + ' at ' + startMs);
    const my = ++token;
    const v = el();
    if (session) { session.close(); session = null; }
    v.style.display = 'block';
    layout();
    v.muted = muted;
    v.playbackRate = speed;
    let src;
    try {
      src = await openSource(parse(url), url);
    } catch (e) {
      if (my === token) emit('error', { what: 'network', message: String(e && e.message || e) });
      return;
    }
    if (my !== token) { if (src.close) src.close(); return; }
    session = new MseSession(v, src, { startMs, audio, emit });
    session.url = url;
    session.audio = audio || 0;
    v.autoplay = true;
    const p = v.play();
    if (p && p.catch) p.catch(() => { /* starts by itself once data arrives (autoplay) */ });
  }

  return {
    play(url, startMs) { play(url, startMs | 0, 0); },
    pause() { if (video) { video.pause(); if (session) session.userPaused = true; } },
    resume() { if (video) { if (session) session.userPaused = false; video.play().catch(() => {}); } },
    seek(ms) { if (session) session.seek(ms); },
    speed(s) { speed = s || 1; if (video) video.playbackRate = speed; },
    mute(on) { muted = !!on; if (video) video.muted = muted; },
    track(index, on) {
      // switching the spoken language restarts the stream on that audio track at the same moment
      if (!session || !on || index === session.audio) return;
      const at = Math.round((video.currentTime || 0) * 1000);
      play(session.url, at, index);
    },
    aspect(mode) {
      if (mode && mode.indexOf('box:') === 0) box = mode.slice(4).split(',').map(Number);
      else { box = null; fit = { fit: 'contain', zoom: 'cover', fill: 'fill' }[mode] || 'contain'; }
      layout();
    },
    stop() {
      token++;
      if (session) { session.close(); session = null; }
      if (video) {
        video.pause();
        video.removeAttribute('src');
        try { video.load(); } catch (e) { /* nothing loaded */ }
        video.style.display = 'none';
      }
      box = null;
    },
    state() {
      if (!session || !video) return { active: false };
      const prepared = !!session.prepared;
      return {
        active: true,
        prepared,
        buffering: !prepared || (video.readyState < 3 && !video.paused && !video.ended),
        pos: Math.round((video.currentTime || 0) * 1000),
        dur: Math.round((session.dur || video.duration || 0) * 1000) || 0,
        playing: !video.paused && !video.ended,
        speed,
        muted,
        w: video.videoWidth || 0,
        h: video.videoHeight || 0,
      };
    },
  };
}
