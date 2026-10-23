// Full-screen playback overlay. Video is decoded natively (MediaPlayer on a SurfaceView behind
// the transparent WebView) from the local stream server, which pulls bytes from Telegram on demand.
import { h, svg, ICON, fmtTime, store } from './util.js';
import * as td from './td.js';
import { displayTitle, itemFromMessage, nextInList } from './media.js';
import { chatTitle } from './state.js';
import { pushScope, popScope, focus, focused } from './focus.js';
import { progress, seen, spinner, button } from './components.js';
import { sheet, toast, modalOpen } from './ui.js';
import { setAmbient } from './ambient.js';
import * as warm from './prefetch.js';
import * as reco from './reco.js';
import * as quality from './quality.js';
import * as episodes from './episodes.js';
import * as preview from './preview.js';

let P = null; // active player session

export function playerActive() {
  return !!P;
}

export async function openItem(item, list) {
  if (item.stale) {
    try {
      const m = await td.send({ '@type': 'getMessage', chat_id: item.chatId, message_id: item.msgId });
      const fresh = itemFromMessage(m);
      if (!fresh) throw new Error('gone');
      item = fresh;
      list = [fresh];
    } catch (e) {
      toast('ההודעה כבר לא זמינה בטלגרם');
      return;
    }
  }
  if (item.kind === 'photo') return openViewer(item, (list || [item]).filter((i) => i.kind === 'photo'));
  if (item.kind === 'file') return toast('אי אפשר לפתוח את סוג הקובץ הזה בטלוויזיה');
  const same = (list || [item]).filter((i) => i.kind === item.kind);
  const ordered = item.kind === 'video' ? episodes.order(item, same) : same;
  // the live preview of this very video is already playing: grow it into the player
  const continued = item.kind === 'video' && preview.take(item);
  start(item, ordered.some((x) => x.key === item.key) ? ordered : same, continued ? { continued: true } : null);
  // episodes of the same series that are not in this list: fetch them from the chat, keep episode order
  if (item.kind === 'video' && episodes.isEpisode(item)) {
    episodes.complete(item, ordered).then((full) => {
      if (!full || !P || P.anchor.key !== item.key) return;
      const anchor = full.find((x) => x.key === item.key);
      if (anchor) P.anchor = anchor;
      P.list = full;
      P.nextBtn.classList.toggle('dim', !nextInList(full, P.anchor));
    });
  }
}

// Plays `item`, but if this chat has a pinned quality, swaps in the matching upload first.
async function start(item, list, opts) {
  let chosen = item;
  if (!(opts && opts.continued)) preview.stop();
  const want = item.kind === 'video' && !(opts && opts.continued) ? quality.pinned(item.chatId) : 0;
  if (want && quality.heightOf(item) !== want) {
    toast('מחפשים ' + quality.qualityLabel(want) + '…', 1200);
    const versions = await quality.findVersions(item, 2500);
    chosen = quality.choose(versions, want) || item;
  }
  play(chosen, list, Object.assign({ anchor: item }, opts || {}));
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

function play(item, list, opts) {
  opts = opts || {};
  const anchor = opts.anchor || item; // the entry in `list` (used for next/previous)
  if (P) teardown(true);
  const t = displayTitle(item);
  const cur = h('span.pl-cur', { text: '0:00' });
  const dur = h('span.pl-dur', { text: item.duration ? fmtTime(item.duration) : '' });
  const fill = h('i.pl-fill');
  const ghost = h('i.pl-ghost');
  const knob = h('b.pl-knob');
  const bar = h('div.pl-bar.fx', null, h('div.pl-rail', null, ghost, fill, knob));
  const seekChip = h('div.pl-seekchip');
  const btn = (icon, label, fn, cls) => h('div.pl-btn.fx' + (cls ? '.' + cls : ''), { onselect: fn, 'aria-label': label }, svg(icon, 34));
  const playBtn = btn(ICON.pause, 'השהיה', () => toggle(), 'main');
  const prevBtn = btn(ICON.skipL, 'הקודם', () => step(-1));
  const nextBtn = btn(ICON.skipR, 'הבא', () => step(1));
  const speedBtn = h('div.pl-pill.fx', { onselect: () => pickSpeed() }, svg(ICON.speed, 26), h('span', { text: '1x' }));
  const trackBtn = h('div.pl-pill.fx', { onselect: () => pickTracks() }, svg(ICON.cc, 26), h('span', { text: 'שמע וכתוביות' }));
  const qualityBtn = h('div.pl-pill.fx.quality', { onselect: () => pickQuality() }, svg(ICON.hd, 26), h('span', { text: quality.qualityLabel(quality.heightOf(item)) }));
  const aspectBtn = h('div.pl-pill.fx.aspect', { onselect: () => pickAspect() }, svg(ICON.aspect, 26), h('span', { text: 'מסך' }));
  const muteBtn = h('div.pl-pill.fx.mute', { onselect: () => toggleMute() }, svg(ICON.vol, 26), h('span', { text: 'השתקה' }));
  const controls = h('div.pl-controls', null,
    h('div.pl-group', null, prevBtn, btn(ICON.dblL, '10 שניות אחורה', () => nudge(-10)), playBtn, btn(ICON.dblR, '10 שניות קדימה', () => nudge(10)), nextBtn),
    h('div.pl-group.end', null, muteBtn, aspectBtn, qualityBtn, speedBtn, trackBtn));
  const status = h('div.pl-status', null, spinner());
  const subs = h('div.pl-subs');
  const upnext = h('div.pl-upnext');
  const err = h('div.pl-error');
  const art = item.kind === 'audio' ? h('div.pl-art', null, item.thumb ? h('img', { src: td.thumbUrl(item.thumb), alt: '' }) : svg(ICON.note, 120)) : null;
  const top = h('div.pl-top', null,
    h('div.pl-kicker', { text: chatTitle(item.chatId) }),
    h('h1.pl-title', { text: t.main }),
    t.sub ? h('div.pl-sub', { text: t.sub }) : null);
  const bottom = h('div.pl-bottom', null, h('div.pl-times', null, cur, seekChip, dur), bar, controls);
  const mutedBadge = h('div.pl-muted', null, svg(ICON.muted, 30));
  const el = h('div.player' + (item.kind === 'audio' ? '.audio' : ''), null, h('div.pl-shade'), art, top, status, subs, upnext, err, mutedBadge, bottom);
  document.getElementById('overlay').appendChild(el);
  document.documentElement.classList.add('playing');
  if (item.kind === 'audio') setAmbient(item.thumb ? td.thumbUrl(item.thumb) : item.mini);

  P = {
    item, anchor, list, el, qualityBtn, aspectBtn, bar, fill, ghost, knob, cur, dur, playBtn, speedBtn, muteBtn, prevBtn, nextBtn, status, subs, upnext, err, seekChip,
    state: { pos: 0, dur: (item.duration || 0) * 1000, playing: false, buffering: true },
    target: -1, seekTimer: 0, hideTimer: 0, poll: 0, nudgeAcc: 0, nudgeTimer: 0, chipTimer: 0,
    speed: store.get('speed', 1), aspect: opts.aspect || '', tracks: [], ended: false, upnextTimer: 0, started: Date.now(),
  };
  prevBtn.classList.toggle('dim', !list || list.indexOf(anchor) <= 0);
  nextBtn.classList.toggle('dim', !nextInList(list || [], anchor));

  bar._onkey = (dir) => {
    if (dir !== 'left' && dir !== 'right') return false;
    scrubBy(dir === 'right' ? 1 : -1);
    return true;
  };
  bar._onselect = () => commitSeek();

  const resume = progress.get(item.key) || (anchor !== item ? progress.get(anchor.key) : null);
  const startMs = opts.startMs != null ? opts.startMs : (resume && resume.pos ? Math.max(0, resume.pos - 3) * 1000 : 0);
  warm.playing(item.fileId);
  if (!opts.continued) td.player.play(td.streamUrl(item.fileId, item.mime), startMs);
  if (P.speed !== 1) td.player.speed(P.speed);
  applyMute();
  applyAspect();
  speedBtn.lastChild.textContent = P.speed + 'x';

  pushScope(el, playBtn);
  showControls();
  requestAnimationFrame(() => el.classList.add('on'));
  P.poll = setInterval(tick, 500);
}

function tick() {
  if (!P) return;
  const s = td.player.state();
  if (!s.active) return;
  const st = P.state;
  if (s.prepared && s.playing) P.watched = (P.watched || 0) + 0.5;
  if (s.prepared) {
    st.pos = s.pos;
    if (s.dur > 0) st.dur = s.dur;
    st.playing = s.playing;
  }
  st.buffering = !!s.buffering;
  P.status.classList.toggle('on', st.buffering && !P.err.classList.contains('on'));
  P.el.classList.toggle('paused', s.prepared && !s.playing && !st.buffering);
  if (P.target < 0) draw(st.pos);
  P.dur.textContent = st.dur ? fmtTime(st.dur / 1000) : '';
  P.playBtn.firstChild.innerHTML = `<svg viewBox="0 0 24 24" width="34" height="34">${st.playing ? ICON.pause : ICON.play}</svg>`;
  // save progress every ~5s
  if (st.dur && Date.now() - (P.lastSave || 0) > 5000) {
    P.lastSave = Date.now();
    progress.set(P.item, st.pos / 1000, st.dur / 1000);
  }
  // offer the next episode near the end, and fetch its first megabytes so it starts at once
  const nx = nextInList(P.list || [], P.anchor);
  if (nx && st.dur && st.dur - st.pos < 120000 && P.warmedNext !== nx.key) { P.warmedNext = nx.key; warm.ahead(nx); }
  if (nx && st.dur && st.dur - st.pos < 25000 && st.pos > 5000 && !P.upnext.classList.contains('on')) showUpNext(nx, false);
}

function draw(posMs) {
  const d = P.state.dur || 1;
  const pct = Math.max(0, Math.min(100, (posMs / d) * 100));
  P.fill.style.transform = `scaleX(${pct / 100})`;
  P.knob.style.left = pct + '%';
  P.cur.textContent = fmtTime(posMs / 1000);
}

function scrubBy(sign) {
  showControls();
  const st = P.state;
  if (P.target < 0) { P.target = st.pos; P.scrubStart = Date.now(); P.scrubSteps = 0; }
  P.scrubSteps++;
  // accelerate: 10s steps, growing the longer the key is held
  const held = (Date.now() - P.scrubStart) / 1000;
  const stepS = held < 1.2 ? 10 : held < 3 ? 30 : held < 6 ? 60 : 180;
  P.target = Math.max(0, Math.min(st.dur - 1000, P.target + sign * stepS * 1000));
  P.ghost.style.transform = `scaleX(${P.target / (st.dur || 1)})`;
  P.el.classList.add('scrubbing');
  draw(P.target);
  clearTimeout(P.seekTimer);
  P.seekTimer = setTimeout(commitSeek, 600);
}

function commitSeek() {
  if (!P || P.target < 0) return;
  clearTimeout(P.seekTimer);
  td.player.seek(P.target);
  P.state.pos = P.target;
  P.target = -1;
  P.el.classList.remove('scrubbing');
  P.state.buffering = true;
}

function nudge(sec) {
  if (!P) return;
  const st = P.state;
  showControls();
  P.nudgeAcc += sec;
  const to = Math.max(0, Math.min((st.dur || 0) - 1000, st.pos + P.nudgeAcc * 1000));
  draw(to);
  P.seekChip.textContent = (P.nudgeAcc > 0 ? '+' : '−') + Math.abs(P.nudgeAcc) + ' שנ׳';
  P.seekChip.classList.add('on');
  clearTimeout(P.nudgeTimer);
  P.nudgeTimer = setTimeout(() => {
    td.player.seek(to);
    st.pos = to;
    P.nudgeAcc = 0;
    clearTimeout(P.chipTimer);
    P.chipTimer = setTimeout(() => P && P.seekChip.classList.remove('on'), 500);
  }, 650);
}

function toggle() {
  if (!P) return;
  if (P.state.playing) { td.player.pause(); P.state.playing = false; P.userPaused = true; } else { td.player.resume(); P.state.playing = true; P.userPaused = false; }
  P.el.classList.toggle('paused', !P.state.playing);
  showControls();
}

function step(dir) {
  if (!P) return;
  const list = P.list || [];
  const i = list.indexOf(P.anchor);
  const target = list[i + dir];
  if (!target) return toast(dir > 0 ? 'זה הפריט האחרון ברשימה' : 'זה הפריט הראשון ברשימה');
  start(target, list);
}

function applyMute() {
  const m = store.get('muted', false);
  td.player.mute(m);
  if (!P) return;
  P.muteBtn.classList.toggle('on', m);
  P.muteBtn.firstChild.innerHTML = `<svg viewBox="0 0 24 24" width="26" height="26">${m ? ICON.muted : ICON.vol}</svg>`;
  P.muteBtn.lastChild.textContent = m ? 'מושתק' : 'השתקה';
  P.el.classList.toggle('is-muted', m);
}

function toggleMute() {
  store.set('muted', !store.get('muted', false));
  applyMute();
  showControls();
}

// ------------------------------------------------------------------ picture size (aspect ratio)

const ASPECTS = [
  { id: 'fit', label: 'מקורי', sub: 'כל התמונה, בלי מתיחה (פסים שחורים אם צריך)' },
  { id: 'zoom', label: 'זום למסך מלא', sub: 'ממלא את המסך בלי לעוות; הקצוות נחתכים' },
  { id: 'fill', label: 'מתיחה למסך מלא', sub: 'ממלא את כל המסך; התמונה עלולה להימתח' },
  { id: '16:9', label: '16:9', sub: 'מסך רחב רגיל' },
  { id: '4:3', label: '4:3', sub: 'טלוויזיה ישנה' },
  { id: '21:9', label: '21:9', sub: 'קולנוע רחב' },
];

function aspectFor(chatId) {
  return store.get('aspectChats', {})[chatId] || store.get('aspect', 'fit');
}

function applyAspect() {
  if (!P || P.item.kind !== 'video') return;
  const mode = P.aspect || aspectFor(P.item.chatId);
  P.aspect = mode;
  td.player.aspect(mode);
  const a = ASPECTS.find((x) => x.id === mode) || ASPECTS[0];
  P.aspectBtn.lastChild.textContent = mode === 'fit' ? 'מסך' : a.label;
}

function pickAspect() {
  const chatId = P.item.chatId;
  const chat = chatTitle(chatId) || 'הצ׳אט הזה';
  const pins = store.get('aspectChats', {});
  const opts = ASPECTS.map((a) => ({ label: a.label, sub: a.sub, value: { kind: 'm', id: a.id }, selected: a.id === P.aspect }));
  const curLabel = (ASPECTS.find((x) => x.id === P.aspect) || ASPECTS[0]).label;
  opts.push({ label: 'להשתמש בזה תמיד', sub: `"${curLabel}" לכל הסרטונים`, value: { kind: 'all' } });
  if (pins[chatId] !== P.aspect) opts.push({ label: 'לקבע לצ׳אט הזה', sub: `כל סרטון ב"${chat}" ייפתח ב"${curLabel}"`, value: { kind: 'pin' } });
  if (pins[chatId]) opts.push({ label: 'ביטול הקיבוע לצ׳אט הזה', sub: `חוזר לברירת המחדל`, value: { kind: 'unpin' } });
  sheet('גודל התמונה', opts, (v) => {
    const all = store.get('aspectChats', {});
    if (v.kind === 'm') { P.aspect = v.id; applyAspect(); return; }
    if (v.kind === 'all') { store.set('aspect', P.aspect); delete all[chatId]; store.set('aspectChats', all); toast(`"${curLabel}" הוא עכשיו ברירת המחדל`); return; }
    if (v.kind === 'pin') { all[chatId] = P.aspect; store.set('aspectChats', all); toast(`כל סרטון ב"${chat}" ייפתח ב"${curLabel}"`); return; }
    delete all[chatId]; store.set('aspectChats', all); toast('הקיבוע בוטל');
  });
}

async function pickQuality() {
  const cur = P.item, anchor = P.anchor, list = P.list;
  toast('בודקים אילו איכויות יש לסרטון…', 1500);
  const versions = await quality.findVersions(cur);
  if (!P || P.item !== cur) return;
  const chat = chatTitle(cur.chatId) || 'הצ׳אט הזה';
  const pinnedH = quality.pinned(cur.chatId);
  const curH = quality.heightOf(cur);
  const opts = versions.map((v) => ({
    label: quality.qualityLabel(v._h),
    sub: [v.size ? fmtSizeShort(v.size) : '', v === versions[0] && versions.length > 1 ? 'הכי גבוהה' : ''].filter(Boolean).join(', '),
    value: { kind: 'v', v }, selected: v.fileId === cur.fileId,
  }));
  if (versions.length < 2) opts[0].sub = 'זו האיכות היחידה שהועלתה לסרטון הזה';
  if (curH && pinnedH !== curH) opts.push({ label: `לקבע ${quality.qualityLabel(curH)} לצ׳אט הזה`, sub: `כל סרטון ב"${chat}" ייפתח מעכשיו ב־${quality.qualityLabel(curH)}`, value: { kind: 'pin', h: curH } });
  if (pinnedH) opts.push({ label: 'ביטול הקיבוע לצ׳אט הזה', sub: `כרגע "${chat}" קבוע על ${quality.qualityLabel(pinnedH)}`, value: { kind: 'unpin' } });
  document.getElementById('toast').classList.remove('on');
  sheet('איכות וידאו', opts, (val) => {
    if (val.kind === 'pin') { quality.pin(cur.chatId, val.h); toast(`מעכשיו כל סרטון ב"${chat}" ייפתח ב־${quality.qualityLabel(val.h)}`); return; }
    if (val.kind === 'unpin') { quality.pin(cur.chatId, 0); toast(`הקיבוע ב"${chat}" בוטל`); return; }
    const v = val.v;
    if (v.fileId === cur.fileId) return;
    const pos = P.state.pos;
    play(v, list, { anchor, startMs: Math.max(0, pos - 2000), aspect: P.aspect });
    toast('עוברים ל־' + quality.qualityLabel(v._h));
  });
}

function fmtSizeShort(b) {
  return '\u2066' + (b >= 1073741824 ? (b / 1073741824).toFixed(1) + ' GB' : Math.round(b / 1048576) + ' MB') + '\u2069';
}

function pickSpeed() {
  sheet('מהירות ניגון', SPEEDS.map((s) => ({ label: s === 1 ? 'רגילה' : s + 'x', value: s, selected: s === P.speed })), (s) => {
    P.speed = s;
    store.set('speed', s);
    td.player.speed(s);
    P.speedBtn.lastChild.textContent = s + 'x';
  });
}

function pickTracks() {
  const tr = P.tracks || [];
  const audio = tr.filter((t) => t.type === 'audio');
  const text = tr.filter((t) => t.type === 'text');
  if (!audio.length && !text.length) return toast('אין בקובץ הזה רצועות שמע או כתוביות נוספות');
  const opts = [];
  audio.forEach((t, i) => opts.push({ label: 'שמע ' + (i + 1), sub: langName(t.lang), value: { kind: 'a', t }, selected: P.audioSel === t.index }));
  opts.push({ label: 'בלי כתוביות', value: { kind: 'off' }, selected: P.textSel == null || P.textSel < 0 });
  text.forEach((t, i) => opts.push({ label: 'כתוביות ' + (i + 1), sub: langName(t.lang), value: { kind: 't', t }, selected: P.textSel === t.index }));
  sheet('שמע וכתוביות', opts, (v) => {
    if (v.kind === 'a') { td.player.track(v.t.index, true); P.audioSel = v.t.index; }
    else if (v.kind === 't') { td.player.track(v.t.index, true); P.textSel = v.t.index; }
    else { if (P.textSel >= 0) td.player.track(P.textSel, false); P.textSel = -1; P.subs.textContent = ''; }
  });
}

const LANGS = { heb: 'עברית', he: 'עברית', iw: 'עברית', eng: 'אנגלית', en: 'אנגלית', rus: 'רוסית', ru: 'רוסית', ara: 'ערבית', ar: 'ערבית', fre: 'צרפתית', fra: 'צרפתית', spa: 'ספרדית', ger: 'גרמנית', deu: 'גרמנית', und: '' };
function langName(l) {
  return LANGS[l] != null ? LANGS[l] : (l || '');
}

function showControls() {
  if (!P) return;
  P.el.classList.add('ui');
  clearTimeout(P.hideTimer);
  if (P.item.kind === 'audio') return;
  const due = Date.now() + 3500;
  const check = () => {
    if (!P) return;
    const busy = P.target >= 0 || modalOpen() || P.err.classList.contains('on') || P.upnext.classList.contains('on');
    if (busy) return;                       // seeking, a menu, an error or "next episode": keep them up
    if (P.state.playing && Date.now() >= due) { P.el.classList.remove('ui'); return; }
    if (P.userPaused) return;               // paused on purpose: controls stay until something is pressed
    P.hideTimer = setTimeout(check, 500);   // still starting / buffering: look again shortly
  };
  P.hideTimer = setTimeout(check, 3500);
}

function showUpNext(nx, autoplay) {
  const t = displayTitle(nx);
  P.upnext.innerHTML = '';
  const go = button(autoplay ? 'מנגנים עוד רגע' : 'לפרק הבא', () => start(nx, P.list), { primary: true, icon: ICON.play });
  P.upnext.appendChild(h('div.un-k', { text: 'הבא בתור' }));
  P.upnext.appendChild(h('div.un-t', { text: t.sub || t.main }));
  P.upnext.appendChild(go);
  P.upnext.classList.add('on');
  if (autoplay) {
    let n = 3;
    const label = go.lastChild;
    label.textContent = `מנגנים בעוד ${n}`;
    P.upnextTimer = setInterval(() => {
      n--;
      if (!P) return;
      if (n <= 0) { clearInterval(P.upnextTimer); start(nx, P.list); return; }
      label.textContent = `מנגנים בעוד ${n}`;
    }, 1000);
    P.el.classList.add('ui');
    focus(go);
  }
}

window.__player = function (ev) {
  if (!P) return;
  switch (ev.type) {
    case 'prepared':
      P.tracks = ev.tracks || [];
      P.audioSel = ev.audioSel;
      P.textSel = ev.textSel;
      if (ev.dur) P.state.dur = ev.dur;
      break;
    case 'subtitle':
      P.subs.textContent = ev.text || '';
      break;
    case 'ended': {
      progress.set(P.item, P.state.dur / 1000, P.state.dur / 1000);
      seen.mark(P.item, 1);
      if (P.anchor && P.anchor !== P.item) seen.mark(P.anchor, 1);
      reco.record(P.item, P.watched || 0, true);
      P.watched = 0;
      P.recorded = true;
      const nx = store.get('autoplay', true) ? nextInList(P.list || [], P.anchor) : null;
      if (nx) showUpNext(nx, true);
      else { P.el.classList.add('ui'); P.el.classList.add('paused'); }
      break;
    }
    case 'error':
      showError(ev);
      break;
    default:
      break;
  }
};

function showError(ev) {
  P.err.innerHTML = '';
  P.status.classList.remove('on');
  const hint = P.item.mime && P.item.mime.indexOf('matroska') < 0 && P.item.mime.indexOf('mp4') < 0
    ? 'ייתכן שהפורמט של הקובץ לא נתמך בטלוויזיה הזו.'
    : 'ייתכן שהחיבור לטלגרם נקטע או שהקודק לא נתמך במכשיר.';
  P.err.appendChild(h('h2', { text: 'הניגון נעצר' }));
  P.err.appendChild(h('p', { text: hint + ` (קוד ${ev.what || 0})` }));
  const again = button('לנסות שוב', () => { const it = P.item, l = P.list, a = P.anchor; play(it, l, { anchor: a }); }, { primary: true });
  P.err.appendChild(h('div.row', null, again, button('חזרה', () => closePlayer())));
  P.err.classList.add('on');
  P.el.classList.add('ui');
  focus(again);
}

function teardown(switching) {
  if (!P) return;
  const s = P;
  if (!switching) preview.hush(s.item.key);
  clearInterval(s.poll);
  clearInterval(s.upnextTimer);
  clearTimeout(s.hideTimer);
  clearTimeout(s.seekTimer);
  clearTimeout(s.nudgeTimer);
  if (s.state.dur) {
    progress.set(s.item, s.state.pos / 1000, s.state.dur / 1000);
    if (s.anchor && s.anchor !== s.item) progress.set(s.anchor, s.state.pos / 1000, s.state.dur / 1000);
  }
  if (s.watched > 3) reco.record(s.item, s.watched, !s.recorded && s.state.dur > 0 && s.state.pos / s.state.dur > 0.94);
  if (!switching) td.player.stop();   // switching episodes: the engine stays up and only the file changes
  // free the space: nothing stays on the device after watching
  td.fire({ '@type': 'cancelDownloadFile', file_id: s.item.fileId, only_if_pending: false });
  setTimeout(() => td.fire({ '@type': 'deleteFile', file_id: s.item.fileId }), 400);
  popScope(s.el);
  s.el.remove();
  P = null;
  warm.stopped();
  if (!switching) {
    document.documentElement.classList.remove('playing');
    window.dispatchEvent(new Event('nova:playerclosed'));
  }
}

export function closePlayer() {
  teardown(false);
}

// Remote handling while the player is up. Returns true if consumed.
export function playerKey(name) {
  if (!P) return false;
  if (name === 'enter' && Date.now() - P.started < 700) return true; // the press that opened the video
  if (name === 'mute') { toggleMute(); return true; }
  const visible = P.el.classList.contains('ui');
  switch (name) {
    case 'back':
      if (modalOpen()) return false;
      if (visible && P.item.kind !== 'audio' && P.state.playing) { P.el.classList.remove('ui'); return true; }
      closePlayer();
      return true;
    case 'playpause': toggle(); return true;
    case 'play': if (!P.state.playing) toggle(); return true;
    case 'pause': if (P.state.playing) toggle(); return true;
    case 'stop': closePlayer(); return true;
    case 'ff': nudge(30); return true;
    case 'rw': nudge(-30); return true;
    case 'next': case 'chup': step(1); return true;
    case 'prev': case 'chdown': step(-1); return true;
    default: break;
  }
  if (modalOpen()) return false;
  if (!visible) {
    if (name === 'left') { nudge(-10); return true; }
    if (name === 'right') { nudge(10); return true; }
    if (name === 'enter') { showControls(); if (focused() !== P.playBtn) focus(P.playBtn); toggle(); return true; }
    if (name === 'up' || name === 'down' || name === 'menu' || name === 'info') { showControls(); focus(name === 'up' ? P.bar : P.playBtn); return true; }
  }
  showControls();
  return false;
}

// ------------------------------------------------------------------ photo viewer

let V = null;

export function viewerActive() {
  return !!V;
}

function openViewer(item, list) {
  const img = h('img.vw-img', { alt: '' });
  const mini = h('img.vw-mini', { alt: '' });
  const cap = h('div.vw-cap');
  const count = h('div.vw-count');
  const el = h('div.viewer', null, mini, img, h('div.vw-foot', null, cap, count));
  const sentinel = h('div.fx.vw-focus');
  el.appendChild(sentinel);
  document.getElementById('overlay').appendChild(el);
  V = { el, img, mini, cap, count, list, i: Math.max(0, list.indexOf(item)), slide: 0 };
  sentinel._onkey = (dir) => {
    if (dir === 'left') go(1);
    else if (dir === 'right') go(-1);
    else el.classList.toggle('bare');
    return true;
  };
  sentinel._onselect = () => toggleSlide();
  pushScope(el, sentinel);
  show();
  requestAnimationFrame(() => el.classList.add('on'));
}

function show() {
  const it = V.list[V.i];
  V.img.classList.remove('ok');
  V.mini.src = it.mini || '';
  V.img.onload = () => V && V.img.classList.add('ok');
  V.img.src = td.thumbUrl(it.fileId);
  V.cap.textContent = (it.caption || '').split('\n')[0];
  V.count.textContent = `${V.i + 1} / ${V.list.length}${V.slide ? '   מצגת פועלת' : ''}`;
  // prefetch neighbour
  const n = V.list[V.i + 1];
  if (n) { const p = new Image(); p.src = td.thumbUrl(n.fileId); }
}

function go(d) {
  const ni = V.i + d;
  if (ni < 0 || ni >= V.list.length) return;
  V.i = ni;
  show();
}

function toggleSlide() {
  if (V.slide) { clearInterval(V.slide); V.slide = 0; toast('המצגת נעצרה'); }
  else {
    V.slide = setInterval(() => { if (V.i + 1 >= V.list.length) { clearInterval(V.slide); V.slide = 0; } else go(1); }, 6000);
    toast('מצגת: תמונה חדשה כל 6 שניות');
  }
  show();
}

export function closeViewer() {
  if (!V) return false;
  clearInterval(V.slide);
  popScope(V.el);
  V.el.remove();
  V = null;
  return true;
}

export function viewerKey(name) {
  if (!V) return false;
  if (name === 'back' || name === 'stop') { closeViewer(); return true; }
  if (name === 'playpause' || name === 'play') { toggleSlide(); return true; }
  return false;
}
