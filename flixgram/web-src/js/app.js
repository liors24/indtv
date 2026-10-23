import { h, store, pad2, $ } from './util.js';
import * as preview from './preview.js';
import * as td from './td.js';
import { state, loadChats, chats } from './state.js';
import { move, select, focus, focused, setRootScope, focusFirst, scope } from './focus.js';
import { mountAmbient, clearAmbient } from './ambient.js';
import { toast, closeModal, modalOpen } from './ui.js';
import { playerActive, playerKey, viewerActive, viewerKey, closePlayer, closeViewer } from './player.js';
import { renderSetup, renderLogin, requestQr, errText, authFlags } from './screens/auth.js';
import { homeScreen } from './screens/home.js';
import { libraryScreen } from './screens/library.js';
import { chatsScreen } from './screens/chats.js';
import { searchScreen } from './screens/search.js';
import { settingsScreen } from './screens/settings.js';

const TABS = [
  { id: 'home', label: 'בית' },
  { id: 'library', label: 'ספרייה' },
  { id: 'search', label: 'חיפוש' },
  { id: 'settings', label: 'הגדרות' },
];

const appEl = $('#app');
const gate = $('#gate');
const shell = $('#shell');
const stage = $('#stage');
const nav = $('#nav');
const clock = $('#clock');
mountAmbient($('#ambient'));

const stale = {};
const app = {
  current: null,
  screens: {},
  go(id, params) {
    preview.stop();
    const prev = this.screens[this.current];
    if (prev && this.current !== id) {
      prev.el.classList.remove('on');
      if (prev.hide) prev.hide();
    }
    this.current = id;
    let s = this.screens[id];
    if (!s) {
      const make = { home: homeScreen, library: libraryScreen, chats: chatsScreen, search: searchScreen, settings: settingsScreen }[id];
      s = this.screens[id] = make(app);
      stage.appendChild(s.el);
    }
    Array.prototype.forEach.call(nav.children, (b) => b.classList.toggle('sel', b.dataset.tab === id));
    s.el.classList.add('on');
    shell.dataset.screen = id;
    if (id !== 'home' && id !== 'library' && id !== 'search') clearAmbient();
    if (s.show) s.show(params || {});
    if (params && params.enter !== false && !this.navFocused()) setTimeout(() => s.focusContent && s.focusContent(), 30);
  },
  navFocused() {
    const f = focused();
    return !!(f && nav.contains(f));
  },
  isStale(id) {
    const v = stale[id];
    stale[id] = false;
    return v;
  },
  markStale(id) {
    stale[id] = true;
  },
};

// ------------------------------------------------------------------ top navigation

let navTimer = 0;
TABS.forEach((t) => {
  const b = h('div.nav-item.fx', { data: { tab: t.id } }, h('span', { text: t.label }));
  b._onfocus = () => {
    clearTimeout(navTimer);
    navTimer = setTimeout(() => { if (focused() === b && app.current !== t.id) app.go(t.id, { enter: false }); }, 380);
  };
  b._onselect = () => {
    if (app.current !== t.id) app.go(t.id, { enter: false });
    const s = app.screens[t.id];
    if (s && s.focusContent) s.focusContent();
  };
  b._onkey = (dir) => {
    if (dir === 'down') {
      if (app.current !== t.id) app.go(t.id, { enter: false });
      const s = app.screens[t.id];
      if (s && s.focusContent) s.focusContent();
      return true;
    }
    return false;
  };
  nav.appendChild(b);
});

function tickClock() {
  const d = new Date();
  clock.textContent = pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}
tickClock();
setInterval(tickClock, 15000);

// ------------------------------------------------------------------ keys

let lastMove = 0;
let fastMode = false;
document.addEventListener('keyup', () => {
  if (!fastMode) return;
  fastMode = false;
  setTimeout(() => { if (!fastMode) document.documentElement.classList.remove('fast'); }, 220);
}, true);
const KEYS = { 37: 'left', 38: 'up', 39: 'right', 40: 'down', 13: 'enter', 23: 'enter', 66: 'enter' };

document.addEventListener('keydown', (e) => {
  const name = KEYS[e.keyCode];
  const active = document.activeElement;
  const typing = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');
  if (typing) {
    // let the on-screen keyboard work; up/down leave the field
    if (name === 'up' || name === 'down') { active.blur(); e.preventDefault(); move(name); }
    return;
  }
  if (!name) return;
  e.preventDefault();
  if (e.repeat && name === 'enter') return; // holding OK must not fire twice (it used to pause a fresh video)
  if (e.repeat) {
    const now = Date.now();
    if (now - lastMove < 70) return;
    lastMove = now;
    // holding a direction: switch to short transitions so scrolling keeps up with the key
    if (!fastMode) { fastMode = true; document.documentElement.classList.add('fast'); }
  }
  if (playerActive() && playerKey(name)) return;
  if (name === 'enter') { select(); return; }
  if (!move(name) && name === 'up' && !modalOpen() && !playerActive() && !viewerActive() && shell.contains(focused())) {
    // top edge of a screen: hop to the navigation bar
    const tab = nav.querySelector('.sel') || nav.firstElementChild;
    if (tab) focus(tab);
  }
}, true);

let backArmed = 0;
window.NOVA = {
  back() {
    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) { active.blur(); return true; }
    if (modalOpen()) { closeModal(); return true; }
    if (viewerActive()) return viewerKey('back');
    if (playerActive()) return playerKey('back');
    if (!state.ready) return quitOnSecondPress();
    if (!app.navFocused()) {
      const tab = nav.querySelector('.sel');
      if (tab) { focus(tab); return true; }
    }
    if (app.current !== 'home') { app.go('home', { enter: false }); focus(nav.querySelector('[data-tab="home"]')); return true; }
    return quitOnSecondPress();
  },
  key(name) {
    if (viewerActive() && viewerKey(name)) return;
    if (playerActive()) { playerKey(name); return; }
    if (name === 'search' && state.ready) { app.go('search', {}); }
    if (name === 'playpause' || name === 'play') select();
  },
  lifecycle(s) {
    if (s === 'resume') tickClock();
  },
};

function quitOnSecondPress() {
  const now = Date.now();
  if (now - backArmed < 2200) { td.exitApp(); return true; }
  backArmed = now;
  toast('לחצו שוב על חזרה כדי לצאת');
  return true;
}

// ------------------------------------------------------------------ auth flow

function showGate() {
  appEl.dataset.mode = 'gate';
}

function showShell() {
  appEl.dataset.mode = 'shell';
}

function sendParameters() {
  const api = store.get('api', null);
  if (!api) {
    showGate();
    renderSetup(gate, sendParameters);
    return;
  }
  td.send({
    '@type': 'setTdlibParameters', use_test_dc: false, database_directory: td.info.db, files_directory: td.info.files,
    database_encryption_key: '', use_file_database: true, use_chat_info_database: true, use_message_database: true,
    use_secret_chats: false, api_id: api.id, api_hash: api.hash, system_language_code: td.info.lang || 'he',
    device_model: td.info.model || 'Android TV', system_version: td.info.system || 'Android', application_version: 'Flixgram ' + (td.info.version || '1.0'),
  }).catch((e) => {
    toast(errText(e));
    store.del('api');
    renderSetup(gate, sendParameters);
  });
}

let readyOnce = false;
td.on('updateAuthorizationState', (u) => {
  const s = u.authorization_state;
  state.auth = s;
  const t = s['@type'];
  state.ready = t === 'authorizationStateReady';
  intro.done();
  switch (t) {
    case 'authorizationStateWaitTdlibParameters':
      sendParameters();
      break;
    case 'authorizationStateWaitPhoneNumber':
      showGate();
      if (authFlags.pendingPhone) {
        const num = authFlags.pendingPhone;
        authFlags.pendingPhone = null;
        renderLogin(gate, { '@type': 'phone-form' });
        td.send({ '@type': 'setAuthenticationPhoneNumber', phone_number: num, settings: null }).catch((e) => toast(errText(e)));
      } else {
        renderLogin(gate, { '@type': 'qr-pending' });
        requestQr();
      }
      break;
    case 'authorizationStateWaitOtherDeviceConfirmation':
    case 'authorizationStateWaitCode':
    case 'authorizationStateWaitPassword':
    case 'authorizationStateWaitRegistration':
      showGate();
      renderLogin(gate, s);
      break;
    case 'authorizationStateReady':
      onReady();
      break;
    case 'authorizationStateLoggingOut':
      if (!authFlags.pendingPhone) toast('מתנתקים…');
      break;
    case 'authorizationStateClosed':
      // TDLib instance is finished (after log out): start a fresh one
      if (playerActive()) closePlayer();
      closeViewer();
      readyOnce = false;
      chats.clear();
      state.me = null;
      app.markStale('home');
      window.NovaHost.restart();
      break;
    default:
      break;
  }
});

td.on('error', (e) => console.warn('td error', JSON.stringify(e)));

async function onReady() {
  showShell();
  if (!readyOnce) {
    readyOnce = true;
    try { state.me = await td.send({ '@type': 'getMe' }); } catch (e) { /* offline */ }
    loadChats(200);
    // anything left over from a crash mid-stream: delete it
    td.fire({ '@type': 'optimizeStorage', size: 0, ttl: 0, count: 0, immunity_delay: 0,
      file_types: [{ '@type': 'fileTypeVideo' }, { '@type': 'fileTypeDocument' }, { '@type': 'fileTypeAudio' }, { '@type': 'fileTypeAnimation' }],
      chat_ids: [], exclude_chat_ids: [], return_deleted_file_statistics: false, chat_limit: 0 });
  }
  setRootScope(appEl, null, true);
  app.go(app.current || 'home', {});
  setTimeout(() => { if (!focused() || !document.body.contains(focused())) focusFirst(stage); }, 4000);
}

window.addEventListener('nova:playerclosed', () => {
  if (scope() !== appEl) return;
  if (app.current === 'home') app.markStale('home');
});

// ------------------------------------------------------------------ intro

const intro = (() => {
  const el = $('#intro');
  let finished = false;
  const minEnd = Date.now() + 1500;
  return {
    done() {
      if (finished) return;
      finished = true;
      setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 700); }, Math.max(0, minEnd - Date.now()));
    },
  };
})();

td.ready();
