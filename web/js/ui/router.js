/* INDTV — navigation chrome (TopBar + SideRail) and tab router.
 * Primary destinations behave as tabs: focusing a TopBar/SideRail item switches immediately (no OK),
 * focus stays on the item, and history never grows Home→Live→Home… entries. */
(function (root) {
  'use strict';
  var INDTV = root.INDTV = root.INDTV || {};
  var U = INDTV.Util, t = function (k) { return INDTV.I18n.t(k); };

  var TOP_TABS = ['home', 'live', 'movies', 'shows', 'kids', 'news'];
  var SIDE_TABS = [
    { tab: 'home', icon: 'home' }, { tab: 'live', icon: 'live' }, { tab: 'movies', icon: 'movies' },
    { tab: 'shows', icon: 'shows' }, { tab: 'favorites', icon: 'heart' }, { tab: 'news', icon: 'news' },
    { tab: 'settings', icon: 'settings' }
  ];
  var ALL_TABS = ['home', 'live', 'movies', 'shows', 'kids', 'news', 'favorites', 'settings', 'search'];

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
      var nav = U.el('nav', { class: 'tb-nav', 'data-fgroup': 'topnav', 'aria-label': 'Primary' });
      TOP_TABS.forEach(function (tab) {
        var b = U.el('button', { class: 'fx nav-item tb-item', type: 'button', dataset: { tab: tab, key: 'top:' + tab }, text: t(tab) });
        nav.appendChild(b);
      });
      top.appendChild(nav);

      var tools = U.el('div', { class: 'tb-tools', 'data-fgroup': 'tools' });
      var search = U.el('button', { class: 'fx tb-tool', type: 'button', 'aria-label': t('search'), dataset: { key: 'tool:search' }, html: INDTV.icon('search') });
      search.addEventListener('click', function () { Router.go('search', { focusContent: true }); });
      var lang = U.el('button', { class: 'fx tb-lang', type: 'button', dataset: { key: 'tool:lang' }, 'aria-label': t('language') });
      lang.innerHTML = '<span class="lang-opt' + (INDTV.I18n.lang() === 'en' ? ' is-on' : '') + '">EN</span><span class="lang-sep">|</span><span class="lang-opt' + (INDTV.I18n.lang() === 'he' ? ' is-on' : '') + '" lang="he">עברית</span>';
      lang.addEventListener('click', function () { INDTV.I18n.setLang(INDTV.I18n.lang() === 'en' ? 'he' : 'en'); });
      var profile = U.el('button', { class: 'fx tb-tool tb-profile', type: 'button', 'aria-label': t('profile'), dataset: { key: 'tool:profile' }, html: INDTV.icon('user') });
      profile.addEventListener('click', function () { Router.go('settings', { focusContent: true }); });
      tools.appendChild(search); tools.appendChild(lang); tools.appendChild(profile);
      top.appendChild(tools);

      var side = document.getElementById('siderail');
      side.innerHTML = '';
      var list = U.el('div', { class: 'sr-list', 'data-fgroup': 'sidenav', 'data-faxis': 'v', 'data-flock': '' });
      SIDE_TABS.forEach(function (it) {
        var b = U.el('button', { class: 'fx nav-item sr-item', type: 'button', dataset: { tab: it.tab, key: 'side:' + it.tab } });
        b.innerHTML = '<span class="sr-icon">' + INDTV.icon(it.icon) + '</span><span class="sr-label">' + U.escapeHtml(t(it.tab)) + '</span>';
        list.appendChild(b);
      });
      side.appendChild(list);

      // Focus = Navigate (primary navigation only). Containers persist across rebuilds: bind once.
      if (Router._chromeBound) { Router.markActive(); return; }
      Router._chromeBound = true;
      [top, side].forEach(function (container) {
        container.addEventListener('focusin', function (e) {
          var item = e.target.closest ? e.target.closest('.nav-item') : null;
          if (item && item.dataset.tab) Router.go(item.dataset.tab, { fromFocus: true });
        });
        container.addEventListener('click', function (e) {
          var item = e.target.closest ? e.target.closest('.nav-item') : null;
          if (item && item.dataset.tab) Router.go(item.dataset.tab, { focusContent: true });
        });
      });
      Router.markActive();
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
     * Switch tab. Restores the screen's own scroll/focus state because screens are kept mounted.
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
      var el = document.querySelector('.tb-item[data-tab="' + tab + '"]') || document.querySelector('.sr-item[data-tab="' + tab + '"]');
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
      var inNav = cur && cur.closest && cur.closest('#topbar, #siderail');
      if (Router.current !== 'home') {
        Router.go('home');
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
