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

/* ---------- shared bits ---------- */
const avatarQ = new Queue(3);
const avatarCache = {};
function avatarNode(dlg) {
  const n = el('div', { class: 'avatar', style: { background: colorFor(dlg.key) }, text: initials(dlg.title) });
  if (avatarCache[dlg.key]) { n.textContent = ''; n.style.backgroundImage = 'url(' + avatarCache[dlg.key] + ')'; }
  return n;
}
function fillAvatar(node, dlg) {
  if (avatarCache[dlg.key]) { node.textContent = ''; node.style.backgroundImage = 'url(' + avatarCache[dlg.key] + ')'; return; }
  avatarQ.add(async () => {
    if (!node.isConnected) return;
    let url = avatarCache[dlg.key];
    if (!url) { const b = await Service.avatar(dlg); if (b) { url = URL.createObjectURL(b); avatarCache[dlg.key] = url; } }
    if (url && node.isConnected) { node.textContent = ''; node.style.backgroundImage = 'url(' + url + ')'; }
  });
}
const state = { dialogs: null, archived: null, chat: null, tab: 'chats', go: null, focusGrid: false };
async function ensureDialogs(force) {
  if (!state.dialogs || force) state.dialogs = await Service.dialogs(0);
  return state.dialogs;
}
/** A dialog box over the current screen; Back closes it. */
function openModal(node) {
  const host = stack[stack.length - 1].el;
  const back = el('div', { class: 'modal-back' }, [node]);
  host.appendChild(back);
  const prevScope = host, prevFocus = document.activeElement;
  const h = { onKey: (name) => { if (name === 'BACK') { api.close(); return true; } return false; } };
  const api = { el: back, close() { Nav.pop(h); if (back.parentNode) back.parentNode.removeChild(back); Nav.setScope(prevScope); if (prevFocus && prevFocus.isConnected) Nav.focus(prevFocus); } };
  Nav.push(h); Nav.setScope(back);
  setTimeout(() => { Nav.focus(back.querySelector('.fx')); }, 30);
  return api;
}

/* ---------- Chats tab ---------- */
function chatsView() {
  let filter = ls('chatFilter') || 'all';
  const grid = el('div', { class: 'grid chats' });
  const tabs = el('div', { class: 'chips' });
  const info = el('div', { class: 'info' });
  const FILTERS = [['all', 'all'], ['user', 'users'], ['group', 'groups'], ['channel', 'channels'], ['bot', 'bots']];
  const v = { el: el('div', { class: 'view' }, [tabs, info, grid]) };
  let io = null, loaded = false;
  function render() {
    grid.innerHTML = '';
    const list = (state.dialogs || []).filter((d) => filter === 'all' || d.kind === filter);
    info.textContent = list.length ? '' : t('noChats');
    if (io) io.disconnect();
    io = ('IntersectionObserver' in window) ? new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { fillAvatar(e.target.querySelector('.avatar'), e.target._dlg); io.unobserve(e.target); } }), { rootMargin: '300px' }) : null;
    list.forEach((d) => {
      const card = el('button', { class: 'fx card chat', type: 'button', onclick: () => { state.chat = d; ls('lastChat', d.key); state.focusGrid = true; state.go('media'); } }, [
        avatarNode(d),
        el('div', { class: 'meta' }, [el('div', { class: 'title', text: d.title }), el('div', { class: 'sub', text: d.last })]),
        d.unread ? el('span', { class: 'badge', text: String(d.unread > 99 ? '99+' : d.unread) }) : null
      ]);
      card._dlg = d;
      if (io && !avatarCache[d.key]) io.observe(card); else fillAvatar(card.querySelector('.avatar'), d);
      grid.appendChild(card);
    });
  }
  function renderTabs() {
    tabs.innerHTML = '';
    FILTERS.forEach((f) => tabs.appendChild(el('button', { class: 'fx tab' + (filter === f[0] ? ' on' : ''), type: 'button', text: t(f[1]), onclick: () => { filter = f[0]; ls('chatFilter', filter); renderTabs(); render(); Nav.focus(tabs.querySelector('.on')); } })));
  }
  v.activate = async () => {
    renderTabs();
    if (loaded) return;
    info.textContent = t('loading');
    try { await ensureDialogs(); loaded = true; render(); } catch (e) { info.textContent = errCode(e); }
  };
  v.destroy = () => { if (io) io.disconnect(); };
  return v;
}

/* ---------- Media tab ---------- */
const thumbQ = new Queue(4);
const FILTER_LIST = ['media', 'videos', 'photos', 'music', 'voice', 'files'];
function mediaView() {
  let fi = 0, items = [], next = 0, loading = false, ended = false, gen = 0, query = '', shown = null;
  const grid = el('div', { class: 'grid media' });
  const info = el('div', { class: 'info' });
  const filterBtn = el('button', { class: 'fx pill primary', type: 'button', onclick: () => { fi = (fi + 1) % FILTER_LIST.length; renderBar(); reset(); Nav.focus(filterBtn); } });
  const chatLabel = el('span', { class: 'chatname' });
  const chatAv = el('span', { class: 'avatar sm' });
  const chatBtn = el('button', { class: 'fx pill chatsel', type: 'button', onclick: () => chatModal() }, [chatLabel, chatAv, el('span', { class: 'caret', text: '▾' })]);
  const searchBtn = el('button', { class: 'fx pill round', type: 'button', text: '🔍', onclick: () => searchModal() });
  const bar = el('div', { class: 'toolbar' }, [filterBtn, chatBtn, searchBtn]);
  const v = { el: el('div', { class: 'view' }, [bar, info, grid]) };
  function renderBar() {
    filterBtn.textContent = t('f_' + FILTER_LIST[fi]) + '  →';
    const c = state.chat;
    chatLabel.textContent = (c ? c.title : '…') + (query ? '  🔍 ' + query : '');
    chatAv.textContent = c ? initials(c.title) : ''; chatAv.style.backgroundImage = ''; chatAv.style.background = c ? colorFor(c.key) : '#333';
    if (c) fillAvatar(chatAv, c);
  }
  function cellFor(it, idx) {
    const kind = it.type, cap = (it.caption || '').split('\n');
    const label = it.title || cap[0] || it.name || '';
    const c = el('button', { class: 'fx card cell ' + kind, type: 'button', onclick: () => open(viewerScreen(items, items.indexOf(it))) }, [
      el('div', { class: 'ph', text: kind === 'audio' ? '♪' : kind === 'file' ? '📄' : '' }),
      kind === 'video' && it.duration ? el('span', { class: 'dur', text: fmtDur(it.duration) }) : null,
      el('div', { class: 'cap' }, [el('div', { class: 'c1', text: label }), el('div', { class: 'c2', text: (cap[1] || (it.size ? fmtSize(it.size) : '')) })])
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
    if (loading || ended || !state.chat) return;
    loading = true; const my = gen;
    info.textContent = items.length ? t('loadMore') : t('loading');
    try {
      const r = await Service.mediaPage(state.chat, FILTER_LIST[fi], next, query);
      if (my !== gen) return;
      const base = items.length;
      r.items.forEach((it, i) => { items.push(it); grid.appendChild(cellFor(it, base + i)); });
      next = r.next; if (!r.next) ended = true;
      info.textContent = items.length ? '' : t('noMedia');
      if (base === 0 && state.focusGrid) { state.focusGrid = false; Nav.focus(grid.querySelector('.fx')); }
      if (!ended && grid.children.length < 12) { loading = false; return more(); }
    } catch (e) { if (my === gen) info.textContent = errCode(e); }
    loading = false;
  }
  function reset() { gen++; items = []; next = 0; ended = false; loading = false; grid.innerHTML = ''; thumbQ.clear(); more(); }
  function chatModal() {
    const list = el('div', { class: 'mlist' });
    let showArchive = false, m;
    const render = async () => {
      list.innerHTML = '';
      let src = state.dialogs || [];
      if (showArchive) {
        if (!state.archived) { list.appendChild(el('div', { class: 'info', text: t('loading') })); try { state.archived = await Service.dialogs(1); } catch (e) { state.archived = []; } list.innerHTML = ''; }
        src = state.archived;
      }
      list.appendChild(el('button', { class: 'fx mrow all', type: 'button', onclick: () => { showArchive = !showArchive; render(); } }, [el('span', { class: 'mt', text: showArchive ? t('allChats') : t('archive') }), el('span', { class: 'mi', text: '🗀' })]));
      src.forEach((d) => {
        const av = avatarNode(d); fillAvatar(av, d);
        list.appendChild(el('button', { class: 'fx mrow', type: 'button', onclick: () => { state.chat = d; ls('lastChat', d.key); query = ''; m.close(); renderBar(); reset(); } }, [el('span', { class: 'mt', text: d.title }), av]));
      });
      setTimeout(() => Nav.focus(list.querySelector('.fx')), 20);
    };
    m = openModal(el('div', { class: 'modal' }, [el('h2', { text: t('convSel') }), list]));
    render();
  }
  function searchModal() {
    const f = field(t('searchPh'), { type: 'text', value: query });
    let m;
    const go = () => { query = f.input.value.trim(); m.close(); renderBar(); reset(); };
    m = openModal(el('div', { class: 'modal' }, [el('h2', { text: t('search') }), f.row, el('div', { class: 'row' }, [btn(t('search'), go, 'primary'), btn(t('cancel'), () => m.close())])]));
    setTimeout(() => Nav.focus(f.input), 60);
  }
  v.activate = async () => {
    try {
      const list = await ensureDialogs();
      if (!state.chat) { const last = ls('lastChat'); state.chat = list.filter((d) => d.key === last)[0] || list[0] || null; }
    } catch (e) { info.textContent = errCode(e); return; }
    renderBar();
    if (state.chat !== shown) { shown = state.chat; query = ''; renderBar(); reset(); }
  };
  v.destroy = () => { gen++; thumbQ.clear(); };
  return v;
}

/* ---------- Settings tab ---------- */
function settingsView() {
  let sure = false;
  const who = el('p', { class: 'body', text: '' });
  const out = btn(t('logout'), () => {
    if (!sure) { sure = true; out.textContent = t('logoutSure'); setTimeout(() => { sure = false; out.textContent = t('logout'); }, 5000); return; }
    Service.logout().then(() => start());
  }, 'danger');
  const v = { el: el('div', { class: 'view narrow' }, [
    el('h2', { text: t('account') }), who,
    el('div', { class: 'col' }, [
      btn(t('language') + ': ' + (I18n.lang() === 'he' ? 'עברית → English' : 'English → עברית'), () => { I18n.set(I18n.lang() === 'he' ? 'en' : 'he'); start(); }),
      btn(t('clearCache'), () => { Object.keys(avatarCache).forEach((k) => { delete avatarCache[k]; }); toast(t('cleared')); }),
      btn(t('changeKeys'), () => open(setupScreen(true))),
      out
    ])
  ]) };
  v.activate = () => { Service.me().then((m) => { who.textContent = m.name + (m.username ? '  @' + m.username : '') + (m.phone ? '  +' + m.phone : ''); }).catch(() => { who.textContent = ''; }); };
  return v;
}

/* ---------- shell: Settings | Chats | Media ---------- */
function shellScreen() {
  const nav = el('div', { class: 'topnav' });
  const content = el('div', { class: 'content' });
  const views = { settings: settingsView(), chats: chatsView(), media: mediaView() };
  const names = [['settings', 'tabSettings'], ['chats', 'tabChats'], ['media', 'tabMedia']];
  Object.keys(views).forEach((k) => { views[k].el.hidden = true; content.appendChild(views[k].el); });
  const s = { el: el('div', { class: 'shell' }, [nav, content]), noAutoFocus: true };
  function renderNav() {
    nav.innerHTML = '';
    names.forEach((n) => nav.appendChild(el('button', { class: 'fx navtab' + (state.tab === n[0] ? ' on' : ''), type: 'button', text: t(n[1]), onclick: () => go(n[0]) })));
  }
  function go(tab) {
    state.tab = tab;
    Object.keys(views).forEach((k) => { views[k].el.hidden = k !== tab; });
    renderNav();
    if (views[tab].activate) views[tab].activate();
    if (!state.focusGrid) Nav.focus(nav.querySelector('.on'));
  }
  state.go = go;
  s.onOpen = () => { ensureDialogs().catch(() => {}); go(state.tab); };
  s.onBack = () => { if (state.tab !== 'chats') go('chats'); else exitApp(); };
  s.focusFirst = () => Nav.focus(nav.querySelector('.on'));
  s.destroy = () => { Object.keys(views).forEach((k) => { if (views[k].destroy) views[k].destroy(); }); };
  return s;
}

/* ---------- viewer ---------- */
function viewerScreen(list, startIdx) {
  let idx = startIdx, eng = null, hideT = null, objUrl = null, lastSeekKey = 0, seekAcc = 0, speedI = 0, loop = false;
  const SPEEDS = [1, 1.25, 1.5, 2, 0.75];
  const stage = el('div', { class: 'stage' });
  const title = el('div', { class: 'vtitle' });
  const status = el('div', { class: 'vstatus' });
  const bar = el('div', { class: 'vbar' }, [el('div', { class: 'vdl' }), el('div', { class: 'vpos' }), el('div', { class: 'vknob' })]);
  const tL = el('span', { class: 'tl' }), tR = el('span', { class: 'tr' });
  const trow = el('div', { class: 'vtimes' }, [tL, tR]);
  const vname = el('div', { class: 'vname' });
  const bPlay = el('button', { class: 'fx vbtn big', type: 'button', text: '❚❚', onclick: () => toggle() });
  const bRw = el('button', { class: 'fx vbtn', type: 'button', text: '◀◀', onclick: () => seekBy(-1) });
  const bFf = el('button', { class: 'fx vbtn', type: 'button', text: '▶▶', onclick: () => seekBy(1) });
  const bSp = el('button', { class: 'fx vbtn', type: 'button', text: '1.0x', onclick: () => { speedI = (speedI + 1) % SPEEDS.length; applySpeed(); } });
  const bLoop = el('button', { class: 'fx vbtn', type: 'button', text: '⟲', onclick: () => { loop = !loop; bLoop.classList.toggle('on', loop); const v = vEl(); if (v) v.loop = loop; } });
  const btns = el('div', { class: 'vbtns' }, [bLoop, bSp, bRw, bFf, bPlay]);
  const bottom = el('div', { class: 'vbottom' }, [vname, bar, trow, btns]);
  const ctl = el('div', { class: 'vctl' }, [title, bottom]);
  const s = { el: el('div', { class: 'viewer' }, [stage, status, ctl]), noAutoFocus: true };
  const vEl = () => stage.querySelector('video,audio');
  const inCtl = () => { const a = document.activeElement; return !!(a && a.classList && a.classList.contains('vbtn')); };
  function applySpeed() { const v = vEl(); const sp = SPEEDS[speedI]; if (v) { v.defaultPlaybackRate = sp; v.playbackRate = sp; } bSp.textContent = (sp % 1 ? String(sp) : sp.toFixed(1)) + 'x'; }
  function showCtl() { ctl.classList.add('on'); clearTimeout(hideT); hideT = setTimeout(() => { const v = vEl(); if (inCtl()) { showCtl(); return; } if (!v || !v.paused) ctl.classList.remove('on'); }, 4500); }
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
    const nm = it.name || it.title || (it.caption || '').split('\n')[0] || '';
    title.textContent = (it.chat ? it.chat.title : '') + (list.length > 1 ? '   ' + (idx + 1) + '/' + list.length : '');
    vname.textContent = nm;
    showCtl();
    if (it.type === 'photo' || it.type === 'image') {
      ctl.classList.add('photo');
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
    ctl.classList.remove('photo');
    const v = el(it.type === 'audio' ? 'audio' : 'video', { class: 'vmedia', playsinline: true, 'webkit-playsinline': true });
    v.loop = loop;
    if (it.type === 'audio') stage.appendChild(el('div', { class: 'vaudio', text: '♪' }));
    stage.appendChild(v);
    say(t('buffering'));
    if (it.size > 1.5e9) toast(t('tooBig'));
    v.addEventListener('playing', () => { silent(); bPlay.textContent = '❚❚'; applySpeed(); });
    v.addEventListener('play', () => { bPlay.textContent = '❚❚'; });
    v.addEventListener('pause', () => { bPlay.textContent = '▶'; });
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
    const dur = isFinite(v.duration) && v.duration > 0 ? v.duration : (list[idx].duration || 0);
    bar.querySelector('.vdl').style.width = (eng.total ? Math.min(100, eng.loaded / eng.total * 100) : 0) + '%';
    const f = dur ? Math.min(100, v.currentTime / dur * 100) : 0;
    bar.querySelector('.vpos').style.width = f + '%'; bar.querySelector('.vknob').style.left = f + '%';
    tL.textContent = fmtDur(v.currentTime) + (eng.done ? '' : '   ⬇ ' + pct());
    tR.textContent = dur ? fmtDur(Math.max(0, dur - v.currentTime)) : '--:--';
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
    if (name === 'BACK') { if (inCtl()) { document.activeElement.blur(); showCtl(); return true; } close(); return true; }
    if (name === 'CH_UP' || (isImg && name === 'RIGHT')) { show(idx + 1); return true; }
    if (name === 'CH_DOWN' || (isImg && name === 'LEFT')) { show(idx - 1); return true; }
    if (isImg) return name === 'UP' || name === 'DOWN' || name === 'OK';
    if (inCtl()) {
      showCtl();
      if (name === 'DOWN') { document.activeElement.blur(); return true; }
      if (name === 'OK' || name === 'LEFT' || name === 'RIGHT' || name === 'UP') return false;   // default navigation between the buttons
    }
    if (name === 'UP' || name === 'DOWN') { showCtl(); Nav.focus(bPlay); return true; }
    if (name === 'OK' || name === 'PLAYPAUSE') { toggle(); return true; }
    if (name === 'PLAY') { const v = vEl(); if (eng) eng.userPaused = false; if (v) v.play(); showCtl(); return true; }
    if (name === 'PAUSE') { const v = vEl(); if (eng) eng.userPaused = true; if (v) v.pause(); showCtl(); return true; }
    if (name === 'STOP') { close(); return true; }
    if (name === 'LEFT' || name === 'RW') { seekBy(-1); return true; }
    if (name === 'RIGHT' || name === 'FF') { seekBy(1); return true; }
    return false;
  };
  s.onOpen = () => show(idx);
  s.destroy = () => { cleanup(); clearTimeout(hideT); };
  return s;
}

/* ---------- boot ---------- */
function showChats() { replaceAll(shellScreen()); }
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
