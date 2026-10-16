/* INDTV — navigation chrome (TopBar + SideRail) and tab router.
 * Primary destinations behave as tabs: focusing a TopBar/SideRail item switches immediately (no OK),
 * focus stays on the item, and history never grows Home→Live→Home… entries. */
(function (root) {
  'use strict';
  var INDTV = root.INDTV = root.INDTV || {};
  var U = INDTV.Util, t = function (k) { return INDTV.I18n.t(k); };

  var TOP_TABS = ['home', 'categories', 'catchup', 'favorites', 'recordings', 'settings'];
  var ALL_TABS = TOP_TABS.slice();

  var Router = {
    screens: {},
    current: null,
    playerOpen: false,
    _lastBackAt: 0,

    register: function (name, screen) { Router.screens[name] = screen; },

    buildChrome: function () {
      var top = document.getElementById('topbar');
      top.innerHTML = '';
      top.appendChild(U.el('div', { class: 'tb-brand', html: INDTV.wordmark() }));
      var nav = U.el('nav', { class: 'tb-nav', 'data-fgroup': 'topnav', 'data-faxis': 'h', 'aria-label': 'Primary' });
      TOP_TABS.forEach(function (tab) {
        nav.appendChild(U.el('button', { class: 'fx nav-item tb-item', type: 'button', dataset: { tab: tab, key: 'top:' + tab }, text: t(tab) }));
      });
      top.appendChild(nav);

      var tools = U.el('div', { class: 'tb-tools', 'data-fgroup': 'tools' });
      Router._clock = U.el('span', { class: 'tb-clock', 'aria-hidden': 'true' });
      Router._tickClock();
      var lang = U.el('button', { class: 'fx tb-lang', type: 'button', dataset: { key: 'tool:lang' }, 'aria-label': t('language') });
      lang.innerHTML = '<span class="lang-opt' + (INDTV.I18n.lang() === 'he' ? ' is-on' : '') + '" lang="he">עב</span><span class="lang-sep"></span><span class="lang-opt' + (INDTV.I18n.lang() === 'en' ? ' is-on' : '') + '">EN</span>';
      lang.addEventListener('click', function () { INDTV.I18n.setLang(INDTV.I18n.lang() === 'en' ? 'he' : 'en'); });
      var me = INDTV.Profiles && INDTV.Profiles.current();
      var profile = U.el('button', { class: 'fx tb-tool tb-profile' + (me ? ' has-avatar' : ''), type: 'button',
        'aria-label': me ? me.name + ' \u2014 ' + t('pfSwitch') : t('profile'), dataset: { key: 'tool:profile' },
        html: me ? INDTV.Avatars.render(me.avatar, 'tb-av') : INDTV.icon('user') });
      profile.addEventListener('click', function () { if (me) INDTV.Profiles.switchProfile(); });
      tools.appendChild(Router._clock); tools.appendChild(lang); tools.appendChild(profile);
      top.appendChild(tools);

      if (Router._chromeBound) { Router.markActive(); return; }
      Router._chromeBound = true;
      setInterval(Router._tickClock, 15000);
      // Moving over a tab only highlights it; OK (or a click) opens it.
      top.addEventListener('click', function (e) {
        var item = e.target.closest ? e.target.closest('.nav-item') : null;
        if (item && item.dataset.tab) Router.go(item.dataset.tab, { focusContent: true, animate: true });
      });
      Router.markActive();
    },
    _tickClock: function () {
      if (Router._clock) Router._clock.textContent = U.formatTime(Date.now(), INDTV.I18n.lang());
    },

    markActive: function () {
      var items = document.querySelectorAll('.nav-item');
      for (var i = 0; i < items.length; i++) {
        var on = items[i].dataset.tab === Router.current;
        items[i].classList.toggle('is-active', on);
        if (on) items[i].setAttribute('aria-current', 'page'); else items[i].removeAttribute('aria-current');
      }
    },

    /**
     * Switch tab (opened with OK from TopBar / SideRail). Restores the screen's own scroll/focus state because screens are kept mounted.
     * opts.fromFocus: keep focus on the navigation item. opts.focusContent: move focus into the screen.
     */
    go: function (tab, opts) {
      opts = opts || {};
      if (ALL_TABS.indexOf(tab) < 0) tab = 'home';
      if (tab !== Router.current) {
        var prev = Router.screens[Router.current];
        if (prev && prev.onHide) prev.onHide();
        Object.keys(Router.screens).forEach(function (k) {
          var s = Router.screens[k];
          if (s.el) s.el.hidden = k !== tab;
        });
        var scr = Router.screens[tab];
        if (scr && !scr.mounted) { scr.mount(); scr.mounted = true; }
        Router.current = tab;
        if (opts.animate && scr && scr.el) {
          scr.el.classList.remove('is-entering');
          void scr.el.offsetWidth;
          scr.el.classList.add('is-entering');
          setTimeout(function () { scr.el.classList.remove('is-entering'); }, 320);
        }
        document.documentElement.setAttribute('data-tab', tab);
        if (scr && scr.onShow) scr.onShow(opts);
        try { root.history.replaceState({ tab: tab }, '', '#' + tab); } catch (e) { /* file:// */ }
        Router.markActive();
        INDTV.Bus.emit('tab', tab);
      }
      if (opts.focusContent) {
        var s2 = Router.screens[tab];
        var target = s2 && s2.firstFocus ? s2.firstFocus() : null;
        if (target) INDTV.Focus.focus(target);
      }
    },

    focusNav: function (tab) {
      var el = document.querySelector('.tb-item[data-tab="' + tab + '"]');
      if (el) INDTV.Focus.focus(el);
    },

    openPlayer: function (ref, ctx) {
      var wasOpen = Router.playerOpen && INDTV.PlayerScreen.isOpen();
      var returnFocus = wasOpen ? null : document.activeElement;
      if (!wasOpen) {
        try { root.history.pushState({ tab: Router.current, player: true }, '', '#' + Router.current + '/watch'); } catch (e) { /* ignore */ }
      }
      Router.playerOpen = true;
      INDTV.PlayerScreen.open(ref, ctx, returnFocus);
    },

    /** Called by PlayerScreen when it closes itself. */
    playerClosed: function () {
      if (!Router.playerOpen) return;
      Router.playerOpen = false;
      try {
        if (root.history.state && root.history.state.player) root.history.back();
      } catch (e) { /* ignore */ }
    },

    /** Back for screens (Player and modals register their own handlers first). */
    back: function () {
      var scr = Router.screens[Router.current];
      if (scr && scr.onBack && scr.onBack() === true) return;
      var cur = INDTV.Focus.current();
      var inNav = cur && cur.closest && cur.closest('#topbar');
      if (Router.current !== 'home') {
        Router.go('home', { animate: true });
        Router.focusNav('home');
        return;
      }
      if (!inNav) { Router.focusNav('home'); return; }
      var now = Date.now();
      if (now - Router._lastBackAt < 2200) {
        if (root.INDTVNative && root.INDTVNative.exitApp) { root.INDTVNative.exitApp(); return; }
        if (root.tizen && root.tizen.application) { try { root.tizen.application.getCurrentApplication().exit(); } catch (e) { /* ignore */ } }
        try { root.history.back(); } catch (e) { /* ignore */ }
        return;
      }
      Router._lastBackAt = now;
      INDTV.UI.toast(t('pressBackAgain'));
    },

    start: function () {
      root.addEventListener('popstate', function (e) {
        if (Router.playerOpen && INDTV.PlayerScreen.isOpen()) {
          Router.playerOpen = false;
          INDTV.PlayerScreen.close({ fromHistory: true });
        }
        var st = e.state;
        if (st && st.tab && st.tab !== Router.current) Router.go(st.tab);
      });
    },

    initialTab: function () {
      var h = (root.location.hash || '').replace('#', '').split('/')[0];
      return ALL_TABS.indexOf(h) >= 0 ? h : 'home';
    }
  };

  INDTV.Router = Router;
})(typeof window !== 'undefined' ? window : globalThis);
