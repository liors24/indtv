/* INDTV — Favorites: your channels (round logos), your programmes ("My shows": where and when they air)
 * and what you watched lately. Everything here belongs to the active profile. */
(function (root) {
  'use strict';
  var INDTV = root.INDTV = root.INDTV || {};
  var U = INDTV.Util, UI = INDTV.UI, t = function (k) { return INDTV.I18n.t(k); };

  var Fav = {
    el: null, mounted: false,
    mount: function () {
      Fav.el = document.getElementById('screen-favorites');
      Fav.scroller = U.el('div', { class: 'vscroll page-scroll', 'data-top-offset': '0' });
      Fav.el.appendChild(Fav.scroller);
      Fav.render();
      var rr = U.debounce(function () { Fav.render(); }, 250);
      ['catalog', 'lang', 'favorites', 'shows', 'epg', 'player-closed'].forEach(function (e) { INDTV.Bus.on(e, rr); });
    },
    firstFocus: function () { return Fav.el.querySelector('.tile, .fx'); },
    render: function () {
      var activeKey = document.activeElement && Fav.el.contains(document.activeElement) ? document.activeElement.getAttribute('data-key') : null;
      var favs = INDTV.FavoritesRepository.channels();
      var shows = INDTV.ShowFavorites.all();
      Fav.scroller.innerHTML = '';
      Fav.scroller.appendChild(U.el('div', { class: 'page-head', 'data-row': '' }, [
        U.el('h1', { class: 'page-title', text: t('favorites') }),
        U.el('p', { class: 'page-sub', text: U.count(favs.length, 'channel', 'channels') + ' · ' + shows.length + ' ' + t('programmes') })
      ]));

      Fav.scroller.appendChild(U.el('h2', { class: 'section-title', 'data-row': '', text: t('favChannels') }));
      if (!favs.length) {
        Fav.scroller.appendChild(U.el('p', { class: 'section-empty', text: t('emptyFavoritesBody') }));
      } else {
        var ids = favs.map(function (c) { return c.id; });
        var grid = U.el('div', { class: 'tile-grid', 'data-fgroup': 'fav-grid', 'data-fmemory': '' });
        favs.forEach(function (c) { var tl = UI.channelTile(c, ids, { keyPrefix: 'fav' }); tl.setAttribute('data-row', ''); grid.appendChild(tl); });
        Fav.scroller.appendChild(grid);
      }

      Fav.scroller.appendChild(U.el('h2', { class: 'section-title', 'data-row': '', text: t('myShows') }));
      if (!shows.length) {
        Fav.scroller.appendChild(U.el('p', { class: 'section-empty', text: t('noShowsBody') }));
      } else {
        var list = U.el('div', { class: 'show-list', 'data-fgroup': 'fav-shows', 'data-fmemory': '' });
        shows.forEach(function (f) {
          list.appendChild(U.el('div', { class: 'show-row', 'data-row': '' }, [
            UI.showCard(f, { keyPrefix: 'fshow' }),
            UI.button(t('removeShow'), 'trash', function () { INDTV.ShowFavorites.remove(f.key); UI.toast(t('showRemoved')); }, { cls: 'btn-ghost btn-danger', key: 'fshow-rm:' + f.key })
          ]));
        });
        Fav.scroller.appendChild(list);
      }

      var recent = INDTV.RecentRepository.channels();
      if (recent.length) {
        var rIds = recent.map(function (c) { return c.id; });
        Fav.scroller.appendChild(UI.rail({
          title: t('recentlyWatched'), group: 'fav-recent', items: recent, cls: 'rail-tiles',
          render: function (c) { return UI.channelTile(c, rIds, { keyPrefix: 'favrec' }); }
        }));
      }
      if (activeKey) INDTV.Focus.restore(activeKey, Fav.el);
    }
  };

  INDTV.FavoritesScreen = Fav;
})(typeof window !== 'undefined' ? window : globalThis);
