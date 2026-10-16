/* INDTV — Home. A projection-room hero that follows the highlighted channel, then rows of round channel
 * logos: continue watching, favourites, and every category — ordered by what this profile watches and
 * browses most, so the rows you use float to the top. */
(function (root) {
  'use strict';
  var INDTV = root.INDTV = root.INDTV || {};
  var U = INDTV.Util, UI = INDTV.UI, t = function (k) { return INDTV.I18n.t(k); };
  var CR = INDTV.ChannelRepository, Cat = INDTV.Categories;

  function catLine(ch) {
    return Cat.of(ch).map(function (id) { return Cat.name(id); }).join(' · ');
  }

  var Home = {
    el: null, mounted: false,

    mount: function () {
      Home.el = document.getElementById('screen-home');
      Home.el.innerHTML = '';
      Home.hero = U.el('div', { class: 'hero' });
      Home.scroller = U.el('div', { class: 'vscroll home-rows', 'data-top-offset': '0' });
      Home.el.appendChild(Home.hero);
      Home.el.appendChild(Home.scroller);
      Home.render();
      var rerender = U.debounce(function () { if (Home.mounted) Home.render(); }, 250);
      ['catalog', 'favorites', 'lang', 'shows'].forEach(function (evt) { INDTV.Bus.on(evt, rerender); });
      INDTV.Bus.on('catalog-status', function () { if (!CR.all().length) rerender(); });
      // The row order follows usage; rebuild while the player covers Home, never under the user's focus.
      INDTV.Bus.on('player-closed', rerender);
      INDTV.Bus.on('epg', function () { if (Home._heroCh) Home.setHero(Home._heroCh); });
    },

    onShow: function () { if (Home._heroCh) INDTV.Ambient.channel(Home._heroCh); },
    firstFocus: function () { return Home.scroller.querySelector('.tile'); },

    setHero: function (ch) {
      Home._heroCh = ch;
      var e = INDTV.EpgRepository.nowNext(ch);
      var lang = INDTV.I18n.lang();
      var meta = [];
      if (e && e.now) meta.push(U.el('span', { class: 'hero-now', dir: 'auto', text: e.now.title }), U.el('span', { text: '\u2066' + U._formatTime(e.now.start, lang) + '–' + U._formatTime(e.now.stop, lang) + '\u2069' }));
      else meta.push(U.el('span', { text: t('liveBroadcast') }));
      if (INDTV.FavoritesRepository.has(ch.id)) meta.push(U.el('span', { class: 'hero-fav', html: INDTV.icon('heartFill') + U.escapeHtml(t('inFavorites')) }));
      var title = U.el('h1', { class: 'hero-title' + (ch.name.length > 18 ? ' long' : ''), dir: 'auto', text: ch.name });
      var box = U.el('div', { class: 'hero-text' }, [
        U.el('div', { class: 'hero-sub', text: catLine(ch) }),
        title,
        U.el('div', { class: 'hero-meta' }, meta)
      ]);
      Home.hero.innerHTML = '';
      Home.hero.appendChild(box);
      requestAnimationFrame(function () { box.classList.add('in'); });
    },

    _row: function (title, meta, items, group, opts) {
      opts = opts || {};
      var ids = items.map(function (c) { return c.id; });
      var bumpT = 0;
      var row = UI.rail({
        title: title, meta: meta, group: group, items: items, cls: 'rail-tiles', batch: 14,
        render: function (c) {
          return UI.channelTile(c, ids, {
            keyPrefix: group, onFocus: function (ch) {
              Home.setHero(ch);
              if (opts.cat) {   // scrolling through a category row counts a little toward its rank
                var now = Date.now();
                if (now - bumpT > 2500) { bumpT = now; Cat.bump(opts.cat, 0.15); }
              }
            }
          });
        }
      });
      if (opts.cat) {
        var dot = U.el('span', { class: 'rail-dot', style: 'background:' + Cat.color(opts.cat) });
        var head = row.querySelector('.rail-head');
        head.insertBefore(dot, head.firstChild);
        var all = U.el('button', { class: 'fx rail-more', type: 'button', dataset: { key: group + ':more' }, text: t('seeAll') });
        all.addEventListener('click', function () { INDTV.CategoriesScreen.open(opts.cat); });
        head.appendChild(all);
      }
      return row;
    },

    render: function () {
      var active = document.activeElement;
      var activeKey = active && Home.el.contains(active) ? active.getAttribute('data-key') : null;
      var state = CR.state.get();
      Home.scroller.innerHTML = '';
      if (!state.channels.length) {
        Home.hero.innerHTML = '';
        Home.scroller.appendChild(Home._stateView(state));
        return;
      }
      if (state.error) {
        Home.scroller.appendChild(U.el('div', { class: 'notice', 'data-row': '' }, [
          U.el('span', { html: INDTV.icon(state.error === 'offline' ? 'offline' : 'alert') }),
          U.el('span', { text: (state.error === 'offline' ? t('noConnection') : t('playlistUnavailable')) + ' · ' + t('showingCached') })
        ]));
      }
      var first = null;
      var recent = INDTV.RecentRepository.channels();
      if (recent.length) { Home.scroller.appendChild(Home._row(t('continueWatching'), '', recent.slice(0, 20), 'h-recent')); first = first || recent[0]; }
      var favs = INDTV.FavoritesRepository.channels();
      if (favs.length) { Home.scroller.appendChild(Home._row(t('yourFavorites'), U.count(favs.length, 'channel', 'channels'), favs, 'h-favs')); first = first || favs[0]; }
      if (!recent.length && !favs.length) {
        var pop = INDTV.popularChannels(18);
        Home.scroller.appendChild(Home._row(t('popularChannels'), '', pop, 'h-pop'));
        first = first || pop[0];
      }
      // Category rows are built a few at a time as you move down: Home opens instantly even with 30 categories.
      var cats = Cat.ranked(), built = 0;
      first = first || (cats[0] && cats[0].channels[0]);
      var more = function (n) {
        var end = Math.min(cats.length, built + n);
        for (var i = built; i < end; i++) {
          var c = cats[i];
          var row = Home._row(Cat.name(c.id), U.count(c.count, 'channel', 'channels'), INDTV.StreamScan.sort(c.channels), 'h-c-' + U.hash(c.id), { cat: c.id });
          row.setAttribute('data-cat-row', String(i));
          Home.scroller.appendChild(row);
        }
        built = end;
      };
      more(5);
      Home.scroller.onfocusin = function (e) {
        var row = e.target.closest && e.target.closest('[data-cat-row]');
        if (row && +row.getAttribute('data-cat-row') >= built - 2 && built < cats.length) more(4);
      };
      if (activeKey && /^h-c-/.test(activeKey)) more(cats.length);   // restoring focus deep in the list
      if (!Home._heroCh || !CR.get(Home._heroCh.id)) Home.setHero(first);
      else Home.setHero(CR.get(Home._heroCh.id));
      if (activeKey) INDTV.Focus.restore(activeKey, Home.el);
    },

    _stateView: function (state) {
      var wrap = U.el('div', { class: 'home-state' });
      if (state.status === 'loading' || state.refreshing) {
        wrap.appendChild(U.el('div', { class: 'loading-block' }, [
          U.el('div', { class: 'loading-word', html: INDTV.wordmark('wm-xl') }),
          U.el('div', { class: 'loading-bar' }, [U.el('span')]),
          U.el('p', { text: t('loadingCatalog') })
        ]));
        return wrap;
      }
      var offline = state.error === 'offline';
      wrap.appendChild(UI.emptyState({
        icon: offline ? 'offline' : 'alert',
        title: offline ? t('noConnection') : (state.error ? t('playlistUnavailable') : t('emptyCatalogTitle')),
        body: t('emptyCatalogBody'),
        actions: [UI.button(t('tryAgain'), 'refresh', function () { INDTV.PlaylistRepository.refresh(); }, { cls: 'btn-primary', key: 'home:retry' })]
      }));
      return wrap;
    }
  };

  INDTV.HomeScreen = Home;
})(typeof window !== 'undefined' ? window : globalThis);
