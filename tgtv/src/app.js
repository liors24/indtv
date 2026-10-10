/* TeleTV — screens and boot */
import qrcode from 'qrcode-generator';
import { Service, errCode } from './service.js';
import { Progressive } from './player.js';
import { Nav } from './nav.js';
import { I18n, t } from './i18n.js';
import { el, fmtDur, fmtSize, fmtDate, ls, initials, colorFor, Queue } from './util.js';

const root = () => document.getElementById('app');
const stack = [];          // open screens
let toastTimer = null;

function toast(msg) {
  const n = document.getElementById('toast'); if (!n) return;
  n.textContent = msg; n.className = 'on'; clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { n.className = ''; }, 3200);
}
function exitApp() {
  try { if (window.tizen && tizen.application) { tizen.application.getCurrentApplication().exit(); return; } } catch (e) { /* ignore */ }
  try { if (window.TeleTVNative && TeleTVNative.exitApp) { TeleTVNative.exitApp(); return; } } catch (e) { /* ignore */ }
  try { window.close(); } catch (e) { /* ignore */ }
}

/* ---------- screen stack ---------- */
function open(screen, opts) {
  const top = stack[stack.length - 1];
  if (top) { top.el.style.display = 'none'; top.lastFocus = document.activeElement; }
  screen.el.classList.add('screen');
  root().appendChild(screen.el);
  stack.push(screen);
  Nav.push(screen);
  Nav.setScope(screen.el);
  if (!screen.onBack) screen.onBack = () => close();
  if (screen.onOpen) screen.onOpen(opts);
  if (!screen.noAutoFocus) setTimeout(() => { if (screen.focusFirst) screen.focusFirst(); else Nav.focus(Nav.first()); }, 30);
  return screen;
}
function close() {
  const s = stack.pop(); if (!s) return;
  Nav.pop(s);
  if (s.destroy) { try { s.destroy(); } catch (e) { /* ignore */ } }
  if (s.el.parentNode) s.el.parentNode.removeChild(s.el);
  const top = stack[stack.length - 1];
  if (top) {
    top.el.style.display = '';
    Nav.setScope(top.el);
    if (top.onResume) top.onResume();
    setTimeout(() => { if (top.lastFocus && top.lastFocus.isConnected) Nav.focus(top.lastFocus); else Nav.focus(Nav.first()); }, 20);
  }
}
function replaceAll(screen) { while (stack.length) close(); return open(screen); }

function btn(text, onclick, cls) { return el('button', { class: 'fx btn ' + (cls || ''), type: 'button', text, onclick }); }
function field(label, attrs) {
  const input = el('input', Object.assign({ class: 'fx field', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' }, attrs));
  return { input, row: el('label', { class: 'frow' }, [el('span', { class: 'flabel', text: label }), input]) };
}

/* ---------- setup (API keys) ---------- */
function setupScreen(fromSettings) {
  const keys = Service.keys() || {};
  const id = field(t('apiId'), { type: 'text', inputmode: 'numeric', value: keys.apiId || '' });
  const hash = field(t('apiHash'), { type: 'text', value: keys.apiHash || '' });
  const err = el('div', { class: 'err' });
  const go = () => {
    const a = id.input.value.trim(), h = hash.input.value.trim().toLowerCase();
    if (!/^\d{3,12}$/.test(a) || !/^[0-9a-f]{32}$/.test(h)) { err.textContent = t('setupBad'); return; }
    Service.saveKeys(a, h);
    if (fromSettings) { ls('session', null); }
    start();
  };
  const s = { el: el('div', { class: 'center-card' }, [
    el('h1', { text: t('setupTitle') }), el('p', { class: 'body', text: t('setupBody') }),
    id.row, hash.row, err, el('div', { class: 'row' }, [btn(t('save'), go, 'primary'), fromSettings ? btn(t('cancel'), () => close()) : null, langButton()])
  ]) };
  s.onBack = () => { if (fromSettings) close(); else exitApp(); };
  return s;
}
function langButton() {
  return btn(I18n.lang() === 'he' ? 'English' : 'עברית', () => { I18n.set(I18n.lang() === 'he' ? 'en' : 'he'); start(); });
}

/* ---------- login ---------- */
function loginScreen() {
  let cancelled = false, mode = 'qr';
  const qrBox = el('div', { class: 'qrbox' });
  const msg = el('p', { class: 'body', text: t('loginWait') });
  const err = el('div', { class: 'err' });
  const form = el('div', { class: 'form' });
  const actions = el('div', { class: 'row' });
  const s = { el: el('div', { class: 'center-card login' }, [el('h1', { text: t('loginTitle') }), msg, qrBox, form, err, actions]) };
  s.destroy = () => { cancelled = true; };

  function ask(label, type, hintText) {
    return new Promise((resolve) => {
      form.innerHTML = ''; qrBox.style.display = 'none';
      const f = field(label, { type: type || 'text' });
      if (hintText) form.appendChild(el('p', { class: 'body', text: t('passwordHint') + ': ' + hintText }));
      form.appendChild(f.row);
      form.appendChild(btn(t('send'), () => { const v = f.input.value.trim(); if (!v) return; form.innerHTML = ''; err.textContent = ''; resolve(v); }, 'primary'));
      setTimeout(() => Nav.focus(f.input), 50);
    });
  }
  function drawQr(url) {
    if (mode !== 'qr') return;
    form.innerHTML = ''; qrBox.style.display = '';
    try {
      const q = qrcode(0, 'M'); q.addData(url); q.make();
      qrBox.innerHTML = q.createSvgTag({ cellSize: 8, margin: 3, scalable: true });
    } catch (e) { qrBox.textContent = url; }
    msg.textContent = t('loginQr'); err.textContent = '';
  }
  async function runQr() {
    mode = 'qr'; err.textContent = ''; msg.textContent = t('loginWait'); qrBox.innerHTML = '';
    try {
      await Service.qrLogin({
        cancelled: () => cancelled || mode !== 'qr',
        onQr: drawQr,
        onPassword: (hint) => { msg.textContent = t('password'); return ask(t('password'), 'password', hint); },
        onError: (e) => { const c = errCode(e); err.textContent = /PASSWORD_HASH_INVALID/.test(c) ? t('wrongPass') : c; }
      });
      if (!cancelled) showChats();
    } catch (e) {
      if (cancelled || mode !== 'qr') return;
      err.textContent = errCode(e); msg.textContent = t('retry');
      form.innerHTML = ''; form.appendChild(btn(t('retry'), runQr, 'primary')); Nav.focus(Nav.first());
    }
  }
  async function runPhone() {
    mode = 'phone'; qrBox.style.display = 'none'; msg.textContent = t('loginPhone'); err.textContent = '';
    try {
      await Service.phoneLogin({
        cancelled: () => cancelled || mode !== 'phone',
        getPhone: () => ask(t('phone'), 'tel'), getCode: () => ask(t('code'), 'tel'),
        getPassword: (hint) => ask(t('password'), 'password', hint),
        onError: (e) => { const c = errCode(e); err.textContent = /PHONE_CODE_INVALID/.test(c) ? t('wrongCode') : /PASSWORD_HASH_INVALID/.test(c) ? t('wrongPass') : /PHONE_NUMBER_INVALID/.test(c) ? t('badPhone') : c; }
      });
      if (!cancelled) showChats();
    } catch (e) { if (!cancelled && mode === 'phone') { err.textContent = errCode(e); form.innerHTML = ''; form.appendChild(btn(t('retry'), runPhone, 'primary')); } }
  }
  const phoneBtn = btn(t('loginPhone'), () => { if (mode === 'qr') { mode = 'x'; setTimeout(runPhone, 50); phoneBtn.textContent = t('qrBack'); } else { mode = 'x'; start(); } });
  actions.appendChild(phoneBtn);
  actions.appendChild(btn(t('loginKeys'), () => open(setupScreen(true))));
  actions.appendChild(langButton());
  s.onBack = () => exitApp();
  s.onOpen = () => { runQr(); };
  return s;
}

/* ---------- chats ---------- */
function avatarNode(dlg, big) {
  const n = el('div', { class: 'avatar' + (big ? ' big' : ''), style: { background: colorFor(dlg.key) }, text: initials(dlg.title) });
  return n;
}
const avatarQ = new Queue(3);
const avatarCache = {};

function chatsScreen() {
  let dialogs = [], filter = ls('chatFilter') || 'all';
  const grid = el('div', { class: 'grid chats' });
  const tabs = el('div', { class: 'tabs' });
  const info = el('div', { class: 'info' });
  const FILTERS = [['all', 'all'], ['user', 'users'], ['group', 'groups'], ['channel', 'channels'], ['bot', 'bots']];
  const s = { el: el('div', { class: 'page' }, [
    el('div', { class: 'top' }, [el('h1', { text: t('chats') }), tabs, btn('⚙', () => open(settingsScreen()), 'icon')]), info, grid
  ]) };
  let io = null;
  function loadAvatar(card, dlg) {
    if (dlg.avatarDone) return; dlg.avatarDone = true;
    avatarQ.add(async () => {
      if (!card.isConnected) { dlg.avatarDone = false; return; }
      let url = avatarCache[dlg.key];
      if (!url) { const b = await Service.avatar(dlg); if (b) { url = URL.createObjectURL(b); avatarCache[dlg.key] = url; } }
      if (url && card.isConnected) { const a = card.querySelector('.avatar'); a.textContent = ''; a.style.backgroundImage = 'url(' + url + ')'; }
    });
  }
  function render() {
    grid.innerHTML = '';
    const list = dialogs.filter((d) => filter === 'all' || d.kind === filter);
    info.textContent = list.length ? '' : t('noChats');
    if (io) io.disconnect();
    io = ('IntersectionObserver' in window) ? new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { loadAvatar(e.target, e.target._dlg); io.unobserve(e.target); } }), { rootMargin: '300px' }) : null;
    list.forEach((d) => {
      const card = el('button', { class: 'fx card chat', type: 'button', onclick: () => open(mediaScreen(d)) }, [
        avatarNode(d),
        el('div', { class: 'meta' }, [el('div', { class: 'title', text: d.title }), el('div', { class: 'sub', text: d.last })]),
        d.unread ? el('span', { class: 'badge', text: String(d.unread > 99 ? '99+' : d.unread) }) : null
      ]);
      card._dlg = d;
      if (avatarCache[d.key]) { const a = card.querySelector('.avatar'); a.textContent = ''; a.style.backgroundImage = 'url(' + avatarCache[d.key] + ')'; d.avatarDone = true; }
      else if (io) io.observe(card); else loadAvatar(card, d);
      grid.appendChild(card);
    });
  }
  function renderTabs() {
    tabs.innerHTML = '';
    FILTERS.forEach((f) => tabs.appendChild(el('button', { class: 'fx tab' + (filter === f[0] ? ' on' : ''), type: 'button', text: t(f[1]), onclick: () => { filter = f[0]; ls('chatFilter', filter); renderTabs(); render(); Nav.focus(tabs.querySelector('.on')); } })));
  }
  async function load() {
    info.textContent = t('loading');
    try { dialogs = await Service.dialogs(); renderTabs(); render(); if (!stack.length || stack[stack.length - 1] === s) Nav.focus(grid.querySelector('.fx') || Nav.first()); }
    catch (e) { info.textContent = errCode(e); }
  }
  renderTabs();
  s.onOpen = load;
  s.onResume = () => {};
  s.onBack = () => exitApp();
  s.destroy = () => { if (io) io.disconnect(); };
  return s;
}

/* ---------- media gallery of one chat ---------- */
const thumbQ = new Queue(4);
function mediaScreen(dlg) {
  const TABS = ['media', 'videos', 'photos', 'music', 'voice', 'files'];
  let filter = 'media', items = [], next = 0, loading = false, ended = false, gen = 0;
  const grid = el('div', { class: 'grid media' });
  const tabs = el('div', { class: 'tabs' });
  const info = el('div', { class: 'info' });
  const s = { el: el('div', { class: 'page' }, [el('div', { class: 'top' }, [btn('←', () => close(), 'icon'), el('h1', { text: dlg.title }), tabs]), info, grid]) };
  function cellFor(it, idx) {
    const kind = it.type;
    const c = el('button', { class: 'fx card cell ' + kind, type: 'button', onclick: () => open(viewerScreen(items, items.indexOf(it))) }, [
      el('div', { class: 'ph', text: kind === 'audio' ? '♪' : kind === 'file' ? '📄' : '' }),
      kind === 'audio' || kind === 'file' ? el('div', { class: 'fname', text: it.title || it.name || it.caption || '' }) : null,
      el('div', { class: 'tags' }, [kind === 'video' ? el('span', { class: 'tag', text: '▶ ' + (it.duration ? fmtDur(it.duration) : '') }) : null, it.size ? el('span', { class: 'tag', text: fmtSize(it.size) }) : null])
    ]);
    c.addEventListener('focus', () => { if (idx >= items.length - 10) more(); });
    if (kind === 'video' || kind === 'photo' || kind === 'image' || it.gif) {
      const myGen = gen;
      thumbQ.add(async () => {
        if (myGen !== gen || !c.isConnected) return;
        const b = await Service.thumb(it);
        if (b && c.isConnected) c.querySelector('.ph').style.backgroundImage = 'url(' + URL.createObjectURL(b) + ')';
      });
    }
    return c;
  }
  async function more() {
    if (loading || ended) return;
    loading = true; const my = gen;
    info.textContent = items.length ? t('loadMore') : t('loading');
    try {
      const r = await Service.mediaPage(dlg, filter, next);
      if (my !== gen) return;
      const base = items.length;
      r.items.forEach((it, i) => { items.push(it); grid.appendChild(cellFor(it, base + i)); });
      next = r.next; if (!r.next) ended = true;
      info.textContent = items.length ? '' : t('noMedia');
      if (base === 0 && my === gen) {
        const fc = grid.querySelector('.fx');
        if (fc && tabs.contains(document.activeElement)) { /* keep focus on the tabs while browsing them */ } else if (fc) Nav.focus(fc);
      }
      // if the page was mostly filtered out and the screen is not full, keep going
      if (!ended && grid.children.length < 12) { loading = false; return more(); }
    } catch (e) { if (my === gen) info.textContent = errCode(e) + ' — ' + t('retry'); }
    loading = false;
  }
  function reset() {
    gen++; items = []; next = 0; ended = false; loading = false; grid.innerHTML = ''; thumbQ.clear(); more();
  }
  function renderTabs() {
    tabs.innerHTML = '';
    TABS.forEach((f) => tabs.appendChild(el('button', { class: 'fx tab' + (filter === f ? ' on' : ''), type: 'button', text: t(f), onclick: () => { filter = f; renderTabs(); reset(); Nav.focus(tabs.querySelector('.on')); } })));
  }
  renderTabs();
  s.onOpen = () => reset();
  s.focusFirst = () => Nav.focus(tabs.querySelector('.on'));
  s.destroy = () => { gen++; thumbQ.clear(); };
  return s;
}

/* ---------- viewer ---------- */
function viewerScreen(list, startIdx) {
  let idx = startIdx, eng = null, hideT = null, objUrl = null, paused = false, lastSeekKey = 0, seekAcc = 0;
  const stage = el('div', { class: 'stage' });
  const title = el('div', { class: 'vtitle' });
  const status = el('div', { class: 'vstatus' });
  const bar = el('div', { class: 'vbar' }, [el('div', { class: 'vdl' }), el('div', { class: 'vpos' })]);
  const time = el('div', { class: 'vtime' });
  const ctl = el('div', { class: 'vctl' }, [title, el('div', { class: 'vbottom' }, [bar, time, el('div', { class: 'vhint', text: t('seekHint') })])]);
  const s = { el: el('div', { class: 'viewer' }, [stage, status, ctl]), noAutoFocus: true };
  const vEl = () => stage.querySelector('video,audio');
  function showCtl() { ctl.classList.add('on'); clearTimeout(hideT); hideT = setTimeout(() => { const v = vEl(); if (!v || !v.paused) ctl.classList.remove('on'); }, 4500); }
  function cleanup() {
    if (eng) { eng.stop(); eng = null; }
    if (objUrl) { try { URL.revokeObjectURL(objUrl); } catch (e) { /* ignore */ } objUrl = null; }
    stage.innerHTML = ''; status.textContent = ''; status.className = 'vstatus';
  }
  function say(text, cls) { status.textContent = text; status.className = 'vstatus on ' + (cls || ''); }
  function silent() { status.className = 'vstatus'; status.textContent = ''; }
  async function show(i) {
    cleanup();
    idx = (i + list.length) % list.length;
    const it = list[idx], myIdx = idx;
    title.textContent = (it.chat ? it.chat.title + ' · ' : '') + (it.title || it.name || it.caption || '') + (list.length > 1 ? '   ' + (idx + 1) + '/' + list.length : '');
    showCtl();
    if (it.type === 'photo' || it.type === 'image') {
      ctl.classList.add('photo'); bar.style.display = 'none'; time.style.display = 'none';
      say(t('loading'));
      try {
        const b = await Service.photo(it);
        if (myIdx !== idx) return;
        objUrl = URL.createObjectURL(b);
        stage.appendChild(el('img', { class: 'vimg', src: objUrl }));
        silent();
      } catch (e) { say(t('netErr') + ' ' + errCode(e), 'bad'); }
      return;
    }
    if (it.type !== 'video' && it.type !== 'audio') { say(t('notPlayable') + (it.name ? ': ' + it.name : ''), 'bad'); return; }
    ctl.classList.remove('photo'); bar.style.display = ''; time.style.display = '';
    const v = el(it.type === 'audio' ? 'audio' : 'video', { class: 'vmedia', playsinline: true, 'webkit-playsinline': true });
    if (it.type === 'audio') stage.appendChild(el('div', { class: 'vaudio', text: '♪' }));
    stage.appendChild(v);
    say(t('buffering'));
    if (it.size > 1.5e9) toast(t('tooBig'));
    v.addEventListener('playing', () => { silent(); });
    v.addEventListener('waiting', () => { if (eng && !eng.done) say(t('buffering') + ' ' + pct()); });
    v.addEventListener('error', () => { if (eng && eng.done && eng.swapped >= eng.loaded) say(t('notPlayable'), 'bad'); else if (eng) say(t('buffering') + ' ' + pct()); });
    v.addEventListener('timeupdate', paint);
    v.addEventListener('ended', () => { ctl.classList.add('on'); if (eng && !eng.done) say(t('buffering') + ' ' + pct()); });
    eng = new Progressive({ item: it, video: v, onState: (st) => {
      if (st.error) { say(t('netErr') + ' ' + errCode(st.error), 'bad'); return; }
      if (st.waitFull && !st.done) say(t('buffering') + ' ' + pct() + ' (' + fmtSize(st.loaded) + ' / ' + fmtSize(st.total) + ')');
      else if (!eng || !eng.started) say(t('buffering') + ' ' + pct());
      paint();
    } });
  }
  function pct() { return eng && eng.total ? Math.floor(eng.loaded / eng.total * 100) + '%' : ''; }
  function paint() {
    const v = vEl(); if (!v || !eng) return;
    const dur = v.duration;
    bar.firstChild.style.width = (eng.total ? Math.min(100, eng.loaded / eng.total * 100) : 0) + '%';
    bar.lastChild.style.width = (isFinite(dur) && dur > 0 ? Math.min(100, v.currentTime / dur * 100) : 0) + '%';
    time.textContent = fmtDur(v.currentTime) + ' / ' + (isFinite(dur) ? fmtDur(dur) : (list[idx].duration ? fmtDur(list[idx].duration) : '--:--')) + (eng.done ? '' : '   ⬇ ' + pct());
  }
  function toggle() { const v = vEl(); if (!v) return; if (eng) eng.userPaused = !v.paused; if (v.paused) { const p = v.play(); if (p && p.catch) p.catch(() => {}); } else v.pause(); showCtl(); }
  function seekBy(dir) {
    const v = vEl(); if (!v || !eng) return;
    const now = Date.now(); seekAcc = (now - lastSeekKey < 500) ? Math.min(seekAcc + 1, 12) : 0; lastSeekKey = now;
    const step = seekAcc > 8 ? 120 : seekAcc > 4 ? 60 : seekAcc > 1 ? 30 : 10;
    const target = (v.currentTime || 0) + dir * step;
    if (!eng.seek(target)) say(t('buffering') + ' ' + pct());
    showCtl(); paint();
  }
  s.onKey = (name) => {
    const it = list[idx], isImg = it && (it.type === 'photo' || it.type === 'image');
    if (name === 'BACK') { close(); return true; }
    if (name === 'CH_UP' || (isImg && name === 'RIGHT')) { show(idx + 1); return true; }
    if (name === 'CH_DOWN' || (isImg && name === 'LEFT')) { show(idx - 1); return true; }
    if (isImg) return name === 'UP' || name === 'DOWN' || name === 'OK';
    if (name === 'OK' || name === 'PLAYPAUSE') { toggle(); return true; }
    if (name === 'PLAY') { const v = vEl(); if (eng) eng.userPaused = false; if (v) v.play(); showCtl(); return true; }
    if (name === 'PAUSE') { const v = vEl(); if (eng) eng.userPaused = true; if (v) v.pause(); showCtl(); return true; }
    if (name === 'STOP') { close(); return true; }
    if (name === 'LEFT' || name === 'RW') { seekBy(-1); return true; }
    if (name === 'RIGHT' || name === 'FF') { seekBy(1); return true; }
    if (name === 'UP' || name === 'DOWN') { showCtl(); return true; }
    return false;
  };
  s.onOpen = () => show(idx);
  s.destroy = () => { cleanup(); clearTimeout(hideT); };
  return s;
}

/* ---------- settings ---------- */
function settingsScreen() {
  let sure = false;
  const who = el('p', { class: 'body', text: t('loading') });
  Service.me().then((m) => { who.textContent = m.name + (m.username ? '  @' + m.username : '') + (m.phone ? '  +' + m.phone : ''); }).catch(() => { who.textContent = ''; });
  const out = btn(t('logout'), () => {
    if (!sure) { sure = true; out.textContent = t('logoutSure'); setTimeout(() => { sure = false; out.textContent = t('logout'); }, 5000); return; }
    Service.logout().then(() => start());
  }, 'danger');
  const s = { el: el('div', { class: 'center-card' }, [
    el('h1', { text: t('settings') }), el('h2', { text: t('account') }), who,
    el('div', { class: 'col' }, [
      btn(t('language') + ': ' + (I18n.lang() === 'he' ? 'עברית → English' : 'English → עברית'), () => { I18n.set(I18n.lang() === 'he' ? 'en' : 'he'); start(); }),
      btn(t('clearCache'), () => { Object.keys(avatarCache).forEach((k) => { delete avatarCache[k]; }); toast(t('cleared')); }),
      btn(t('changeKeys'), () => open(setupScreen(true))),
      out, btn(t('back'), () => close())
    ])
  ]) };
  return s;
}

/* ---------- boot ---------- */
function showChats() { replaceAll(chatsScreen()); }
function errorScreen(text) {
  const s = { el: el('div', { class: 'center-card' }, [el('h1', { text: t('appName') }), el('p', { class: 'body err', text }), el('div', { class: 'row' }, [btn(t('retry'), () => start(), 'primary'), btn(t('changeKeys'), () => open(setupScreen(true))), langButton()])]) };
  s.onBack = () => exitApp();
  return s;
}
function loadingScreen() { return { el: el('div', { class: 'center-card' }, [el('h1', { text: t('appName') }), el('p', { class: 'body', text: t('conn') }), el('div', { class: 'spin' })]), noAutoFocus: true, onBack: () => exitApp() }; }

async function start() {
  I18n.apply();
  while (stack.length) close();
  if (!Service.keys()) { open(setupScreen(false)); return; }
  open(loadingScreen());
  try {
    const ok = await Service.init(t);
    if (ok) showChats(); else replaceAll(loginScreen());
  } catch (e) {
    const c = errCode(e);
    replaceAll(errorScreen(/TIMEOUT|network|WebSocket|Connection/i.test(c) ? t('connFail') + ' (' + c + ')' : c));
  }
}

window.addEventListener('DOMContentLoaded', () => {
  try { if (!Service.keys() && __TG_API_ID__ && __TG_API_HASH__) Service.saveKeys(__TG_API_ID__, __TG_API_HASH__); } catch (e) { /* ignore */ }
  I18n.apply(); Nav.init();
  window.addEventListener('error', (e) => { try { console.log('TeleTV error', e.message); } catch (x) { /* ignore */ } });
  start();
});
export { start };
