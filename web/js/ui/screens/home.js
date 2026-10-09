/* INDTV — Home: cinematic hero + content rails + promo banner, all from the parsed playlist. */
(function (root) {
  'use strict';
  var INDTV = root.INDTV = root.INDTV || {};
  var U = INDTV.Util, UI = INDTV.UI, t = function (k) { return INDTV.I18n.t(k); };
  var CR = INDTV.ChannelRepository;

  var Home = {
    el: null, mounted: false,
    _heroItems: [], _heroIndex: 0, _heroTimer: null,

    mount: function () {
      Home.el = document.getElementById('screen-home');
      Home.el.innerHTML = '';
      Home.scroller = U.el('div', { class: 'vscroll home-scroll', 'data-top-offset': '6.2' });
      Home.el.appendChild(Home.scroller);
      Home.render();
      var rerender = U.debounce(function () { if (Home.mounted) Home.render(); }, 250);
      ['catalog', 'favorites', 'recent', 'epg', 'vod', 'vod-progress', 'lang', 'shows'].forEach(function (evt) { INDTV.Bus.on(evt, rerender); });
      INDTV.Bus.on('catalog-status', function () { if (!CR.all().length) rerender(); });
      // Rails reorder as Recently Watched changes; do that while the player covers Home, not under the user's focus.
      INDTV.Bus.off('recent', rerender);
      INDTV.Bus.on('player-closed', rerender);
    },

    onShow: function () { Home._startHeroTimer(); },
    onHide: function () { clearInterval(Home._heroTimer); },

    firstFocus: function () {
      return Home.el.querySelector('.hero .btn-primary') || Home.el.querySelector('.fx');
    },

    render: function () {
      var active = document.activeElement;
      var activeKey = active && Home.el.contains(active) ? active.getAttribute('data-key') : null;
      var scrollTop = Home.scroller.scrollTop;
      var trackScroll = {};
      Home.scroller.querySelectorAll('.rail-track').forEach(function (tr) { trackScroll[tr.getAttribute('data-fgroup')] = tr.scrollLeft; });

      var state = CR.state.get();
      Home.scroller.innerHTML = '';
      if (!state.channels.length) {
        Home.scroller.appendChild(Home._stateView(state));
        return;
      }

      var popular = INDTV.popularChannels(16);
      Home._heroItems = popular.filter(function (c) { return c.logoUrl; }).slice(0, 5);
      if (!Home._heroItems.length) Home._heroItems = popular.slice(0, 5);
      if (Home._heroIndex >= Home._heroItems.length) Home._heroIndex = 0;
      Home.scroller.appendChild(Home._hero());

      if (state.error && state.channels.length) {
        Home.scroller.appendChild(U.el('div', { class: 'notice', 'data-row': '' }, [
          U.el('span', { html: INDTV.icon(state.error === 'offline' ? 'offline' : 'alert') }),
          U.el('span', { text: (state.error === 'offline' ? t('noConnection') : t('playlistUnavailable')) + ' · ' + t('showingCached') })
        ]));
      }

      var used = {};
      popular.forEach(function (c) { used[c.id] = true; });
      var popIds = popular.map(function (c) { return c.id; });

      Home.scroller.appendChild(UI.rail({
        title: t('popularChannels'), group: 'home-popular', items: popular, cls: 'rail-pop',
        render: function (c) { return UI.channelCard(c, popIds, { variant: 'pop', keyPrefix: 'pop' }); }
      }));

      // My Shows: favorite programmes, where and when they are on (from the guide)
      var shows = INDTV.ShowFavorites.all();
      if (shows.length) {
        var sorted = shows.map(function (f) { return { f: f, st: INDTV.ShowFavorites.status(f) }; })
          .sort(function (a, b) { return (b.st && b.st.live ? 1 : 0) - (a.st && a.st.live ? 1 : 0) || ((a.st ? a.st.programme.start : 9e15) - (b.st ? b.st.programme.start : 9e15)); });
        Home.scroller.appendChild(UI.rail({
          title: t('myShows'), group: 'home-shows', items: sorted, cls: 'rail-wide',
          render: function (x) { return UI.showCard(x.f, { keyPrefix: 'hshow' }); }
        }));
      }

      // Movies: user VOD first (if any), then live movie channels from the playlist's own "Movies" group.
      var vod = INDTV.VodRepository.state.get();
      var movieChannels = CR.matchingGroups(/^movies?$/i);
      var movieItems = vod.movies.slice(0, 30).map(function (m) { return { vod: m }; })
        .concat(movieChannels.map(function (c) { return { ch: c }; }));
      if (movieItems.length) {
        var movieIds = movieChannels.map(function (c) { return c.id; });
        Home.scroller.appendChild(UI.rail({
          title: t('movies'), group: 'home-movies', items: movieItems, cls: 'rail-poster',
          render: function (it) { return it.vod ? Home._vodCard(it.vod) : Home._posterChannel(it.ch, movieIds); }
        }));
      } else {
        Home.scroller.appendChild(Home._moviesSoon());
      }

      var cw = INDTV.VodRepository.continueWatching();
      if (cw.length) {
        Home.scroller.appendChild(UI.rail({
          title: t('continueWatching'), group: 'home-cw', items: cw, cls: 'rail-poster',
          render: function (x) { return Home._vodCard(x.item, x.progress); }
        }));
      }

      var recent = INDTV.RecentRepository.channels();
      if (recent.length) {
        var rIds = recent.map(function (c) { return c.id; });
        Home.scroller.appendChild(UI.rail({
          title: t('recentlyWatched'), group: 'home-recent', items: recent,
          render: function (c) { return UI.channelCard(c, rIds, { variant: 'pop', keyPrefix: 'rec' }); }
        }));
      }

      // Live Now: channels not already shown above, mixed across categories, with guide info when available.
      var liveNow = Home._diverse(state.channels.filter(function (c) { return !used[c.id]; }), 20);
      liveNow.forEach(function (c) { used[c.id] = true; });
      var lnIds = liveNow.map(function (c) { return c.id; });
      Home.scroller.appendChild(UI.rail({
        title: t('liveNow'), group: 'home-livenow', items: liveNow, cls: 'rail-wide',
        render: function (c) { return Home._wideCard(c, lnIds); }
      }));

      var favs = INDTV.FavoritesRepository.channels();
      if (favs.length) {
        var fIds = favs.map(function (c) { return c.id; });
        Home.scroller.appendChild(UI.rail({
          title: t('favorites'), group: 'home-favs', items: favs,
          render: function (c) { return UI.channelCard(c, fIds, { variant: 'pop', keyPrefix: 'fav' }); }
        }));
      }

      // Category rails come straight from group-title values in the playlist.
      state.groups.filter(function (g) { return !/^movies?$/i.test(g.name) && g.count >= 3; }).slice(0, 5).forEach(function (g) {
        var list = CR.inGroup(g.name);
        var ids = list.map(function (c) { return c.id; });
        Home.scroller.appendChild(UI.rail({
          title: g.name, meta: g.count + ' ' + t('channels'), group: 'home-g-' + U.hash(g.name), items: list,
          render: function (c) { return UI.channelCard(c, ids, { variant: 'std', keyPrefix: 'g' + U.hash(g.name), glow: false, showName: true }); }
        }));
      });

      Home.scroller.appendChild(Home._promo(state.channels));

      // restore positions
      Home.scroller.scrollTop = scrollTop;
      Home.scroller.querySelectorAll('.rail-track').forEach(function (tr) {
        var g = tr.getAttribute('data-fgroup');
        if (trackScroll[g]) tr.scrollLeft = trackScroll[g];
      });
      if (activeKey) INDTV.Focus.restore(activeKey, Home.el);
      Home._startHeroTimer();
    },

    _diverse: function (list, n) {
      var buckets = {}, order = [];
      list.forEach(function (c) {
        var g = c.groupName || 'Other';
        if (!buckets[g]) { buckets[g] = []; order.push(g); }
        buckets[g].push(c);
      });
      var out = [];
      while (out.length < n) {
        var added = false;
        for (var i = 0; i < order.length && out.length < n; i++) {
          var b = buckets[order[i]];
          var pick = null;
          for (var j = 0; j < b.length; j++) { if (b[j].logoUrl) { pick = b.splice(j, 1)[0]; break; } }
          if (!pick && b.length) pick = b.shift();
          if (pick) { out.push(pick); added = true; }
        }
        if (!added) break;
      }
      return out;
    },

    /* ---------- Hero ---------- */
    _hero: function () {
      var hero = U.el('section', { class: 'hero', 'data-row': '', 'data-row-top': '', 'aria-roledescription': 'carousel' });
      hero.appendChild(U.el('div', { class: 'hero-bg', 'aria-hidden': 'true' }, [
        U.el('span', { class: 'hero-bg-logo' }),
        U.el('span', { class: 'hero-bokeh' }),
        U.el('span', { class: 'hero-art-img' }),
        U.el('span', { class: 'hero-shade' })
      ]));
      hero.appendChild(U.el('div', { class: 'hero-art' }));
      var copy = U.el('div', { class: 'hero-copy' });
      hero.appendChild(copy);
      var dots = U.el('div', { class: 'hero-dots', 'aria-hidden': 'true' });
      Home._heroItems.forEach(function (_, i) { dots.appendChild(U.el('span', { class: 'dot' + (i === Home._heroIndex ? ' is-on' : '') })); });
      hero.appendChild(dots);
      hero.addEventListener('focusin', function () { clearInterval(Home._heroTimer); });
      hero.addEventListener('focusout', function () { Home._startHeroTimer(); });
      Home._fillHero(hero, false);
      return hero;
    },

    _fillHero: function (hero, animate) {
      var ch = Home._heroItems[Home._heroIndex];
      if (!ch) return;
      var epg = INDTV.EpgRepository.nowNext(ch);
      var art = INDTV.artworkFor(ch, epg);
      var bgLogo = hero.querySelector('.hero-bg-logo');
      bgLogo.style.backgroundImage = ch.logoUrl ? 'url("' + encodeURI(ch.logoUrl).replace(/"/g, '%22') + '")' : 'none';
      var artImg = hero.querySelector('.hero-art-img');
      artImg.style.backgroundImage = art.kind === 'programme' ? 'url("' + encodeURI(art.url).replace(/"/g, '%22') + '")' : 'none';
      hero.classList.toggle('has-programme-art', art.kind === 'programme');

      var artBox = hero.querySelector('.hero-art');
      artBox.innerHTML = '';
      artBox.appendChild(U.el('div', { class: 'hero-logo-panel' }, [UI.logo(ch, { cls: 'hero-logo', eager: true, showName: true })]));

      var copy = hero.querySelector('.hero-copy');
      var focusedInHero = copy.contains(document.activeElement);
      var focusKey = focusedInHero ? document.activeElement.getAttribute('data-key') : null;
      copy.innerHTML = '';
      if (animate) { copy.classList.remove('is-in'); void copy.offsetWidth; copy.classList.add('is-in'); }

      var metaBits = [];
      if (ch.language) metaBits.push(ch.language.split(';')[0]);
      if (ch.quality) metaBits.push(ch.quality);
      metaBits.push(ch.sources.length + ' ' + (ch.sources.length === 1 ? t('streamSource') : t('streamSources')));

      copy.appendChild(U.el('div', { class: 'hero-eyebrow' }, [UI.liveBadge('badge-lg')]));
      copy.appendChild(U.el('h1', { class: 'hero-title', text: ch.name }));
      copy.appendChild(U.el('p', { class: 'hero-meta' }, [
        ch.groupName ? U.el('span', { class: 'hero-cat', text: ch.groupName }) : null,
        ch.groupName ? U.el('span', { class: 'hero-sep', text: '•' }) : null,
        U.el('span', { class: 'hero-livenow', text: INDTV.I18n.lang() === 'he' ? 'משודר עכשיו' : 'Live Now' })
      ]));
      if (epg && epg.now) {
        copy.appendChild(U.el('p', { class: 'hero-program' }, [
          U.el('span', { class: 'hero-program-title', text: epg.now.title }),
          U.el('span', { class: 'hero-program-time', text: '\u2066' + U._formatTime(epg.now.start, INDTV.I18n.lang()) + '–' + U._formatTime(epg.now.stop, INDTV.I18n.lang()) + '\u2069' })
        ]));
        if (epg.now.desc) copy.appendChild(U.el('p', { class: 'hero-desc', text: epg.now.desc }));
      } else {
        copy.appendChild(U.el('p', { class: 'hero-desc', text: metaBits.join('  ·  ') }));
      }
      var ids = Home._heroItems.map(function (c) { return c.id; });
      var watch = UI.button(t('watchLive'), 'play', function () {
        INDTV.Router.openPlayer({ kind: 'channel', id: ch.id }, { list: ids });
      }, { cls: 'btn-primary', key: 'hero:watch' });
      var fav = INDTV.FavoritesRepository.has(ch.id);
      var favBtn = UI.button(fav ? t('removeFavorite') : t('addFavorite'), fav ? 'heartFill' : 'heart', function () {
        var added = INDTV.FavoritesRepository.toggle(ch.id);
        UI.toast(added ? t('favAdded') : t('favRemoved'));
      }, { cls: 'btn-ghost btn-icon-only', key: 'hero:fav', aria: fav ? t('removeFavorite') : t('addFavorite') });
      // manual carousel controls: browse the featured channels with the remote
      var pager = null;
      if (Home._heroItems.length > 1) {
        var prev = UI.button(t('prevChannel'), 'chevron', function () { Home._heroStep(-1); }, { cls: 'btn-ghost btn-icon-only hero-prev', key: 'hero:prev', aria: t('prevChannel') });
        var next = UI.button(t('nextChannel'), 'chevron', function () { Home._heroStep(1); }, { cls: 'btn-ghost btn-icon-only hero-next', key: 'hero:next', aria: t('nextChannel') });
        pager = U.el('div', { class: 'hero-pager' }, [prev,
          U.el('span', { class: 'hero-count', text: (Home._heroIndex + 1) + ' / ' + Home._heroItems.length }), next]);
      }
      copy.appendChild(U.el('div', { class: 'hero-actions' }, [watch, favBtn, pager]));
      if (focusKey) INDTV.Focus.restore(focusKey, copy);

      var dots = hero.querySelectorAll('.hero-dots .dot');
      for (var i = 0; i < dots.length; i++) dots[i].classList.toggle('is-on', i === Home._heroIndex);
    },

    _heroStep: function (delta) {
      var hero = Home.el && Home.el.querySelector('.hero');
      if (!hero || !Home._heroItems.length) return;
      Home._heroIndex = (Home._heroIndex + delta + Home._heroItems.length) % Home._heroItems.length;
      Home._fillHero(hero, true);
    },

    _startHeroTimer: function () {
      clearInterval(Home._heroTimer);
      if (Home._heroItems.length < 2) return;
      if (root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      Home._heroTimer = setInterval(function () {
        var hero = Home.el && Home.el.querySelector('.hero');
        if (!hero || Home.el.hidden || INDTV.Router.playerOpen) return;
        if (hero.contains(document.activeElement)) return;
        Home._heroIndex = (Home._heroIndex + 1) % Home._heroItems.length;
        Home._fillHero(hero, true);
      }, 9000);
    },

    /* ---------- Cards specific to Home ---------- */
    _posterChannel: function (ch, ctx) {
      var card = UI.channelCard(ch, ctx, { variant: 'poster', keyPrefix: 'mov', showName: true });
      return card;
    },

    _wideCard: function (ch, ctx) {
      var epg = INDTV.EpgRepository.nowNext(ch);
      var card = U.el('button', { class: 'fx card card-wide', type: 'button', dataset: { key: 'ln:' + ch.id }, 'aria-label': ch.name });
      card.appendChild(U.el('span', { class: 'wide-logo' }, [UI.logo(ch, { showName: false })]));
      var info = U.el('span', { class: 'wide-info' }, [
        U.el('span', { class: 'wide-top' }, [UI.liveBadge(), ch.groupName ? U.el('span', { class: 'wide-group', text: ch.groupName }) : null]),
        U.el('span', { class: 'wide-name', text: ch.name }),
        U.el('span', { class: 'wide-prog', text: epg && epg.now ? epg.now.title : t('liveBroadcast') })
      ]);
      if (epg && epg.now) {
        info.appendChild(U.el('span', { class: 'progress' }, [U.el('span', { class: 'progress-fill', style: 'width:' + Math.round(epg.progress * 100) + '%' })]));
      }
      card.appendChild(info);
      card.addEventListener('click', function () { INDTV.Router.openPlayer({ kind: 'channel', id: ch.id }, { list: ctx }); });
      return card;
    },

    _vodCard: function (item, progress) {
      var card = U.el('button', { class: 'fx card card-poster card-vod', type: 'button', dataset: { key: 'vod:' + item.id }, 'aria-label': item.title });
      card.appendChild(UI.logo({ name: item.title, poster: item.poster }, { cls: 'card-logo vod-art', showName: true }));
      card.appendChild(U.el('span', { class: 'card-meta' }, [U.el('span', { class: 'card-name', text: item.title })]));
      if (progress) {
        card.appendChild(U.el('span', { class: 'progress progress-card' }, [U.el('span', { class: 'progress-fill', style: 'width:' + Math.round(progress.position / progress.duration * 100) + '%' })]));
      }
      card.addEventListener('click', function () { INDTV.Router.openPlayer({ kind: 'vod', id: item.id }); });
      return card;
    },

    _moviesSoon: function () {
      var sec = U.el('section', { class: 'rail', 'data-row': '' });
      sec.appendChild(U.el('div', { class: 'rail-head' }, [U.el('h2', { class: 'rail-title', text: t('movies') })]));
      var b = U.el('button', { class: 'fx soon-strip', type: 'button', dataset: { key: 'home:movies-soon' } });
      b.innerHTML = '<span class="soon-icon">' + INDTV.icon('movies') + '</span><span class="soon-copy"><strong>' +
        U.escapeHtml(t('moviesSoonTitle')) + '</strong><span>' + U.escapeHtml(t('moviesSoonBody')) + '</span></span>';
      b.addEventListener('click', function () { INDTV.Router.go('settings', { focusContent: true }); });
      sec.appendChild(U.el('div', { class: 'rail-track', 'data-fgroup': 'home-movies-soon' }, [b]));
      return sec;
    },

    _promo: function (channels) {
      var withLogo = channels.filter(function (c) { return c.logoUrl; });
      var picks = INDTV.popularChannels(24).filter(function (c) { return c.logoUrl; }).slice(0, 6);
      if (picks.length < 6) picks = picks.concat(withLogo.slice(0, 6 - picks.length));
      var sec = U.el('section', { class: 'promo', 'data-row': '', 'aria-label': 'INDTV' });
      sec.appendChild(UI.trails(9, 'trails-promo'));
      var left = U.el('div', { class: 'promo-panels promo-left', 'aria-hidden': 'true' });
      var right = U.el('div', { class: 'promo-panels promo-right', 'aria-hidden': 'true' });
      picks.forEach(function (c, i) {
        var nn = INDTV.EpgRepository.nowNext(c);
        var panel = U.el('span', { class: 'promo-panel p' + (i % 3) }, [UI.logo(c, { showName: false }),
          nn && nn.now ? U.el('span', { class: 'promo-cap', text: nn.now.title }) : null]);
        (i < 3 ? left : right).appendChild(panel);
      });
      sec.appendChild(left);
      sec.appendChild(U.el('div', { class: 'promo-center' }, [
        U.el('div', { class: 'promo-wordmark', html: INDTV.wordmark('wm-xl') }),
        U.el('div', { class: 'promo-tag', text: 'INDIAN ENTERTAINMENT' }),
        U.el('div', { class: 'promo-count', text: channels.length + ' ' + t('channels') + ' · ' + INDTV.Config.sourcesLabel() })
      ]));
      sec.appendChild(right);
      return sec;
    },

    _stateView: function (state) {
      var wrap = U.el('div', { class: 'home-state' });
      if (state.status === 'loading' || state.refreshing) {
        wrap.appendChild(U.el('div', { class: 'loading-block' }, [
          U.el('div', { class: 'loading-word', html: INDTV.wordmark('wm-xl') }),
          U.el('div', { class: 'loading-bar' }, [U.el('span')]),
          U.el('p', { text: t('loadingCatalog') })
        ]));
        // skeleton rails so the layout does not jump when channels arrive
        for (var r = 0; r < 2; r++) {
          var sk = U.el('div', { class: 'skeleton-rail' });
          for (var i = 0; i < 6; i++) sk.appendChild(U.el('span', { class: 'skeleton-card' }));
          wrap.appendChild(sk);
        }
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
