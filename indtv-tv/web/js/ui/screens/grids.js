/* INDTV — channel grid screens (Kids, News, Favorites) and VOD screens (Movies, TV Shows). */
(function (root) {
  'use strict';
  var INDTV = root.INDTV = root.INDTV || {};
  var U = INDTV.Util, UI = INDTV.UI, t = function (k) { return INDTV.I18n.t(k); };
  var CR = INDTV.ChannelRepository;

  /** Generic channel grid driven by a selector over the real catalog. */
  function ChannelGrid(opts) {
    var self = {
      el: null, mounted: false, _renderedAt: -1,
      mount: function () {
        self.el = document.getElementById(opts.elId);
        self.scroller = U.el('div', { class: 'vscroll grid-scroll', 'data-top-offset': '7' });
        self.el.appendChild(self.scroller);
        self.render();
        var rr = U.debounce(function () { self.render(); }, 250);
        (opts.events || ['catalog', 'lang', 'favorites']).forEach(function (e) { INDTV.Bus.on(e, rr); });
      },
      onShow: function () {},
      firstFocus: function () { return self.el.querySelector('.grid .fx, .empty .fx'); },
      render: function () {
        var activeKey = document.activeElement && self.el.contains(document.activeElement) ? document.activeElement.getAttribute('data-key') : null;
        var list = opts.select();
        var ids = list.map(function (c) { return c.id; });
        self.scroller.innerHTML = '';
        self.scroller.appendChild(U.el('div', { class: 'screen-head', 'data-row': '' }, [
          U.el('h1', { class: 'screen-title', text: t(opts.titleKey) }),
          list.length ? U.el('span', { class: 'screen-sub', text: list.length + ' ' + t('channels') }) : null
        ]));
        if (opts.extraTop) { var x = opts.extraTop(); if (x) self.scroller.appendChild(x); }
        if (!list.length) {
          var st = CR.state.get();
          self.scroller.appendChild(UI.emptyState(opts.empty(st)));
        } else {
          var grid = U.el('div', { class: 'grid', 'data-fgroup': opts.elId + '-grid', 'data-fmemory': '' });
          var batch = 48, rendered = 0;
          var more = function () {
            var end = Math.min(list.length, rendered + batch);
            for (var i = rendered; i < end; i++) {
              var card = UI.channelCard(list[i], ids, { variant: 'grid', keyPrefix: opts.elId, showName: true });
              card.setAttribute('data-row', '');
              grid.appendChild(card);
            }
            rendered = end;
          };
          more();
          grid.addEventListener('focusin', function (e) {
            var idx = Array.prototype.indexOf.call(grid.children, e.target);
            if (idx >= rendered - 10 && rendered < list.length) more();
          });
          self.scroller.appendChild(grid);
        }
        if (activeKey) INDTV.Focus.restore(activeKey, self.el);
      }
    };
    return self;
  }

  INDTV.KidsScreen = ChannelGrid({
    elId: 'screen-kids', titleKey: 'kids',
    select: function () { return CR.matchingGroups(/kids|animation|children|cartoon/i); },
    empty: function (st) {
      return { icon: 'kids', title: st.status === 'loading' ? t('loadingCatalog') : t('emptyCatalogTitle'), body: st.status === 'loading' ? null : t('emptyCatalogBody') };
    }
  });

  INDTV.NewsScreen = ChannelGrid({
    elId: 'screen-news', titleKey: 'news',
    select: function () { return CR.matchingGroups(/news|business/i); },
    empty: function (st) {
      return { icon: 'news', title: st.status === 'loading' ? t('loadingCatalog') : t('emptyCatalogTitle'), body: st.status === 'loading' ? null : t('emptyCatalogBody') };
    }
  });

  INDTV.FavoritesScreen = ChannelGrid({
    elId: 'screen-favorites', titleKey: 'favorites', events: ['catalog', 'lang', 'favorites', 'recent'],
    select: function () { return INDTV.FavoritesRepository.channels(); },
    empty: function () {
      return {
        icon: 'heart', title: t('emptyFavoritesTitle'), body: t('emptyFavoritesBody'),
        actions: [UI.button(t('live'), 'live', function () { INDTV.Router.go('live', { focusContent: true }); }, { cls: 'btn-primary', key: 'fav:golive' })]
      };
    },
    extraTop: function () {
      var recent = INDTV.RecentRepository.channels();
      if (!recent.length) return null;
      var ids = recent.map(function (c) { return c.id; });
      return UI.rail({
        title: t('recentlyWatched'), group: 'fav-recent', items: recent,
        render: function (c) { return UI.channelCard(c, ids, { variant: 'pop', keyPrefix: 'favrec' }); }
      });
    }
  });

  /* ---------- VOD screens ---------- */
  function vodCard(item, onClick) {
    var prog = INDTV.VodRepository.progressFor(item.id);
    var card = U.el('button', { class: 'fx card card-poster card-vod', type: 'button', dataset: { key: 'vod:' + item.id }, 'aria-label': item.title, 'data-row': '' });
    card.appendChild(UI.logo({ name: item.title, poster: item.poster }, { cls: 'card-logo vod-art', showName: true }));
    card.appendChild(U.el('span', { class: 'card-meta' }, [U.el('span', { class: 'card-name', text: item.title })]));
    if (prog) card.appendChild(U.el('span', { class: 'progress progress-card' }, [U.el('span', { class: 'progress-fill', style: 'width:' + Math.round(prog.position / prog.duration * 100) + '%' })]));
    card.addEventListener('click', onClick);
    return card;
  }

  function comingSoon(titleKey, bodyKey, icon) {
    return UI.emptyState({
      cls: 'empty-soon', icon: icon, title: t(titleKey), body: t(bodyKey),
      actions: [UI.button(t('openSources'), 'settings', function () { INDTV.Router.go('settings', { focusContent: true }); }, { cls: 'btn-primary', key: 'soon:' + titleKey })]
    });
  }

  INDTV.MoviesScreen = {
    el: null, mounted: false,
    mount: function () {
      var self = INDTV.MoviesScreen;
      self.el = document.getElementById('screen-movies');
      self.scroller = U.el('div', { class: 'vscroll grid-scroll', 'data-top-offset': '7' });
      self.el.appendChild(self.scroller);
      self.render();
      var rr = U.debounce(function () { self.render(); }, 250);
      ['vod', 'vod-progress', 'lang'].forEach(function (e) { INDTV.Bus.on(e, rr); });
    },
    firstFocus: function () { return INDTV.MoviesScreen.el.querySelector('.fx'); },
    render: function () {
      var self = INDTV.MoviesScreen;
      var st = INDTV.VodRepository.state.get();
      self.scroller.innerHTML = '';
      self.scroller.appendChild(U.el('div', { class: 'screen-head', 'data-row': '' }, [U.el('h1', { class: 'screen-title', text: t('movies') })]));
      if (!st.movies.length) { self.scroller.appendChild(comingSoon('moviesSoonTitle', 'moviesSoonBody', 'movies')); return; }
      var cw = INDTV.VodRepository.continueWatching().filter(function (x) { return x.item.kind === 'movie'; });
      if (cw.length) {
        self.scroller.appendChild(UI.rail({
          title: t('continueWatching'), group: 'mov-cw', items: cw, cls: 'rail-poster',
          render: function (x) { return vodCard(x.item, function () { INDTV.Router.openPlayer({ kind: 'vod', id: x.item.id }); }); }
        }));
      }
      var grid = U.el('div', { class: 'grid grid-poster', 'data-fgroup': 'movies-grid', 'data-fmemory': '' });
      st.movies.slice(0, 600).forEach(function (m) {
        grid.appendChild(vodCard(m, function () { INDTV.Router.openPlayer({ kind: 'vod', id: m.id }); }));
      });
      self.scroller.appendChild(grid);
    }
  };

  INDTV.ShowsScreen = {
    el: null, mounted: false, openShow: null,
    mount: function () {
      var self = INDTV.ShowsScreen;
      self.el = document.getElementById('screen-shows');
      self.scroller = U.el('div', { class: 'vscroll grid-scroll', 'data-top-offset': '7' });
      self.el.appendChild(self.scroller);
      self.render();
      var rr = U.debounce(function () { self.render(); }, 250);
      ['vod', 'vod-progress', 'lang'].forEach(function (e) { INDTV.Bus.on(e, rr); });
    },
    firstFocus: function () { return INDTV.ShowsScreen.el.querySelector('.fx'); },
    onBack: function () {
      var self = INDTV.ShowsScreen;
      if (self.openShow) { var id = self.openShow; self.openShow = null; self.render(); INDTV.Focus.restore('show:' + id, self.el); return true; }
      return false;
    },
    render: function () {
      var self = INDTV.ShowsScreen;
      var st = INDTV.VodRepository.state.get();
      self.scroller.innerHTML = '';
      if (!st.shows.length) {
        self.scroller.appendChild(U.el('div', { class: 'screen-head', 'data-row': '' }, [U.el('h1', { class: 'screen-title', text: t('shows') })]));
        self.scroller.appendChild(comingSoon('showsSoonTitle', 'showsSoonBody', 'shows'));
        return;
      }
      var show = self.openShow ? st.shows.filter(function (s) { return s.id === self.openShow; })[0] : null;
      if (show) {
        self.scroller.appendChild(U.el('div', { class: 'screen-head', 'data-row': '' }, [U.el('h1', { class: 'screen-title', text: show.title })]));
        show.seasonList.forEach(function (season) {
          self.scroller.appendChild(UI.rail({
            title: (INDTV.I18n.lang() === 'he' ? 'עונה ' : 'Season ') + season.number, group: 'season-' + season.number,
            items: season.episodes, cls: 'rail-poster',
            render: function (ep) {
              var c = vodCard(ep, function () { INDTV.Router.openPlayer({ kind: 'vod', id: ep.id }, { list: season.episodes.map(function (e) { return e.id; }) }); });
              c.querySelector('.card-name').textContent = 'E' + ep.episode + ' · ' + ep.title;
              return c;
            }
          }));
        });
        return;
      }
      self.scroller.appendChild(U.el('div', { class: 'screen-head', 'data-row': '' }, [U.el('h1', { class: 'screen-title', text: t('shows') })]));
      var grid = U.el('div', { class: 'grid grid-poster', 'data-fgroup': 'shows-grid', 'data-fmemory': '' });
      st.shows.forEach(function (s) {
        var card = vodCard({ id: s.id, title: s.title, poster: s.poster }, function () {
          self.openShow = s.id; self.render();
          var f = self.el.querySelector('.fx'); if (f) INDTV.Focus.focus(f);
        });
        card.setAttribute('data-key', 'show:' + s.id);
        grid.appendChild(card);
      });
      self.scroller.appendChild(grid);
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
