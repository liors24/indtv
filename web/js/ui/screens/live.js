/* INDTV — Live TV: categories (group-title) · channel list · channel detail. */
(function (root) {
  'use strict';
  var INDTV = root.INDTV = root.INDTV || {};
  var U = INDTV.Util, UI = INDTV.UI, t = function (k) { return INDTV.I18n.t(k); };
  var CR = INDTV.ChannelRepository;

  var BATCH = 60;

  var Live = {
    el: null, mounted: false, category: '__all', _list: [], _rendered: 0, _detailId: null,

    mount: function () {
      Live.el = document.getElementById('screen-live');
      Live.el.innerHTML = '';
      Live.cats = U.el('div', { class: 'live-cats vscroll', 'data-fgroup': 'live-cats', 'data-fmemory': '', 'data-faxis': 'v', 'data-top-offset': '0.5' });
      Live.listWrap = U.el('div', { class: 'live-list vscroll', 'data-fgroup': 'live-list', 'data-fmemory': '', 'data-faxis': 'v', 'data-top-offset': '0.5' });
      Live.detail = U.el('aside', { class: 'live-detail', 'aria-live': 'polite' });
      var head = U.el('div', { class: 'screen-head' }, [
        U.el('h1', { class: 'screen-title', text: t('live') }),
        Live.countEl = U.el('span', { class: 'screen-sub' })
      ]);
      Live.el.appendChild(head);
      Live.el.appendChild(U.el('div', { class: 'live-grid' }, [
        U.el('div', { class: 'live-col live-col-cats' }, [U.el('h2', { class: 'col-title', text: t('categories') }), Live.cats]),
        U.el('div', { class: 'live-col live-col-list' }, [Live.listWrap]),
        Live.detail
      ]));
      Live.render();
      var rerender = U.debounce(function () { Live.render(); }, 250);
      ['catalog', 'lang'].forEach(function (e) { INDTV.Bus.on(e, rerender); });
      INDTV.Bus.on('epg', function () { if (Live._detailId) Live.showDetail(Live._detailId); });
      INDTV.Bus.on('favorites', function () { if (Live._detailId) Live.showDetail(Live._detailId); });

      // Category: filter on focus (no stream starts); list: detail follows focus, OK plays.
      Live.cats.addEventListener('focusin', U.debounce(function (e) {
        var b = e.target.closest ? e.target.closest('.cat-item') : null;
        if (b && b.dataset.cat !== Live.category) { Live.category = b.dataset.cat; Live.renderList(); Live.markCat(); }
      }, 120));
      Live.listWrap.addEventListener('focusin', function (e) {
        var row = e.target.closest ? e.target.closest('.ch-row') : null;
        if (!row) return;
        Live._showDetailSoon(row.dataset.channelId);
        var idx = Number(row.dataset.index);
        if (idx >= Live._rendered - 8) Live.renderMore();
      });
    },

    _showDetailSoon: U.debounce(function (id) { Live.showDetail(id); }, 90),

    onShow: function () {},
    firstFocus: function () {
      return Live.listWrap.querySelector('.ch-row') || Live.cats.querySelector('.cat-item');
    },

    render: function () {
      var state = CR.state.get();
      Live.el.querySelector('.screen-title').textContent = t('live');
      Live.el.querySelector('.col-title').textContent = t('categories');
      Live.countEl.textContent = state.channels.length ? state.channels.length + ' ' + t('channels') + ' · ' + INDTV.Config.sourcesLabel() : '';
      var activeKey = document.activeElement && Live.el.contains(document.activeElement) ? document.activeElement.getAttribute('data-key') : null;

      Live.cats.innerHTML = '';
      var cats = [{ name: '__all', label: t('allChannels'), count: state.channels.length }];
      var favCount = INDTV.FavoritesRepository.channels().length;
      if (favCount) cats.push({ name: '__fav', label: t('favorites'), count: favCount });
      state.groups.forEach(function (g) { cats.push({ name: g.name, label: g.name, count: g.count }); });
      if (cats.map(function (c) { return c.name; }).indexOf(Live.category) < 0) Live.category = '__all';
      cats.forEach(function (c) {
        var b = U.el('button', { class: 'fx cat-item', type: 'button', dataset: { cat: c.name, key: 'cat:' + c.name } }, [
          U.el('span', { class: 'cat-name', text: c.label }),
          U.el('span', { class: 'cat-count', text: String(c.count) })
        ]);
        Live.cats.appendChild(b);
      });
      Live.markCat();
      Live.renderList();
      if (activeKey) INDTV.Focus.restore(activeKey, Live.el);
    },

    markCat: function () {
      var items = Live.cats.querySelectorAll('.cat-item');
      for (var i = 0; i < items.length; i++) items[i].classList.toggle('is-active', items[i].dataset.cat === Live.category);
    },

    currentList: function () {
      if (Live.category === '__all') return CR.all();
      if (Live.category === '__fav') return INDTV.FavoritesRepository.channels();
      return CR.inGroup(Live.category);
    },

    renderList: function () {
      Live._list = Live.currentList();
      Live._ids = Live._list.map(function (c) { return c.id; });
      Live._rendered = 0;
      Live.listWrap.innerHTML = '';
      Live.listWrap.scrollTop = 0;
      if (!Live._list.length) {
        var st = CR.state.get();
        Live.listWrap.appendChild(UI.emptyState({
          icon: st.status === 'loading' ? 'live' : 'alert',
          title: st.status === 'loading' ? t('loadingCatalog') : t('emptyCatalogTitle'),
          body: st.status === 'loading' ? null : t('emptyCatalogBody')
        }));
        Live.detail.innerHTML = '';
        return;
      }
      Live.renderMore();
      Live.showDetail(Live._list[0].id);
    },

    renderMore: function () {
      var end = Math.min(Live._list.length, Live._rendered + BATCH);
      var frag = document.createDocumentFragment();
      for (var i = Live._rendered; i < end; i++) frag.appendChild(Live._row(Live._list[i], i));
      Live.listWrap.appendChild(frag);
      Live._rendered = end;
    },

    _row: function (ch, i) {
      var epg = INDTV.EpgRepository.nowNext(ch);
      var row = U.el('button', {
        class: 'fx ch-row', type: 'button', 'data-row': '',
        dataset: { channelId: ch.id, index: String(i), key: 'row:' + ch.id }, 'aria-label': ch.name
      });
      row.appendChild(U.el('span', { class: 'row-num', text: String(i + 1) }));
      row.appendChild(U.el('span', { class: 'row-logo' }, [UI.logo(ch, { showName: false })]));
      row.appendChild(U.el('span', { class: 'row-text' }, [
        U.el('span', { class: 'row-name', text: ch.name }),
        U.el('span', { class: 'row-sub', text: epg && epg.now ? epg.now.title : (ch.groups.join(' · ') || t('liveBroadcast')) })
      ]));
      var tags = U.el('span', { class: 'row-tags' });
      if (INDTV.FavoritesRepository.has(ch.id)) tags.appendChild(U.el('span', { class: 'row-fav', html: INDTV.icon('heartFill') }));
      if (ch.quality) tags.appendChild(U.el('span', { class: 'tag', text: ch.quality }));
      tags.appendChild(UI.liveBadge());
      row.appendChild(tags);
      row.addEventListener('click', function () {
        INDTV.Router.openPlayer({ kind: 'channel', id: ch.id }, { list: Live._ids });
      });
      return row;
    },

    _showFavButton: function (prog, ch) {
      var on = INDTV.ShowFavorites.has(prog.title);
      var b = U.el('button', { class: 'fx prog-fav' + (on ? ' is-on' : ''), type: 'button', dataset: { key: 'detail:showfav' } });
      b.innerHTML = INDTV.icon(on ? 'heartFill' : 'heart') + '<span>' + U.escapeHtml(on ? t('removeShow') : t('addShow')) + '</span>';
      b.addEventListener('click', function () {
        var added = INDTV.ShowFavorites.toggle(prog, ch);
        UI.toast(added ? t('showAdded') : t('showRemoved'));
        Live.showDetail(ch.id);
      });
      return b;
    },

    showDetail: function (id) {
      var ch = CR.get(id);
      if (!ch) return;
      Live._detailId = id;
      var epg = INDTV.EpgRepository.nowNext(ch);
      var lang = INDTV.I18n.lang();
      var d = Live.detail;
      var keepFocus = d.contains(document.activeElement) ? document.activeElement.getAttribute('data-key') : null;
      d.innerHTML = '';
      d.appendChild(U.el('div', { class: 'detail-art' }, [
        ch.logoUrl ? U.el('span', { class: 'detail-art-glow', style: 'background-image:url("' + encodeURI(ch.logoUrl).replace(/"/g, '%22') + '")' }) : null,
        UI.logo(ch, { cls: 'detail-logo', showName: true })
      ]));
      d.appendChild(U.el('div', { class: 'detail-top' }, [UI.liveBadge(), ch.quality ? U.el('span', { class: 'tag', text: ch.quality }) : null,
        ch.notAlways ? U.el('span', { class: 'tag tag-muted', text: t('notAlways') }) : null]));
      d.appendChild(U.el('h2', { class: 'detail-name', text: ch.name }));
      if (ch.groups.length) d.appendChild(U.el('p', { class: 'detail-groups', text: ch.groups.join(' · ') }));

      var guide = U.el('div', { class: 'detail-guide' });
      if (epg && (epg.now || epg.next)) {
        if (epg.now) {
          guide.appendChild(U.el('div', { class: 'guide-now' }, [
            U.el('span', { class: 'guide-label', text: t('nowPlaying') }),
            U.el('span', { class: 'guide-title', text: epg.now.title }),
            U.el('span', { class: 'guide-time', text: U.formatTime(epg.now.start, lang) + '–' + U.formatTime(epg.now.stop, lang) }),
            U.el('span', { class: 'progress' }, [U.el('span', { class: 'progress-fill', style: 'width:' + Math.round(epg.progress * 100) + '%' })]),
            epg.now.desc ? U.el('p', { class: 'guide-desc', text: epg.now.desc }) : null,
            Live._showFavButton(epg.now, ch)
          ]));
        }
        if (epg.next) {
          guide.appendChild(U.el('div', { class: 'guide-next' }, [
            U.el('span', { class: 'guide-label', text: t('upNext') }),
            U.el('span', { class: 'guide-title', text: epg.next.title }),
            U.el('span', { class: 'guide-time', text: U.formatTime(epg.next.start, lang) })
          ]));
        }
      } else {
        guide.appendChild(U.el('p', { class: 'guide-none', html: INDTV.icon('guide') + '<span>' + U.escapeHtml(t('noGuide')) + '</span>' }));
      }
      d.appendChild(guide);

      var facts = U.el('dl', { class: 'detail-facts' });
      function fact(k, v) { if (!v) return; facts.appendChild(U.el('dt', { text: k })); facts.appendChild(U.el('dd', { text: v })); }
      fact(t('sources'), ch.sources.length + ' ' + (ch.sources.length === 1 ? t('streamSource') : t('streamSources')));
      fact(t('language'), ch.language ? ch.language.split(';').join(', ') : null);
      fact('tvg-id', ch.tvgId);
      d.appendChild(facts);
      if (ch.geoBlocked) d.appendChild(U.el('p', { class: 'detail-note', text: t('geoNote') }));

      var fav = INDTV.FavoritesRepository.has(ch.id);
      d.appendChild(U.el('div', { class: 'detail-actions' }, [
        UI.button(t('watchLive'), 'play', function () { INDTV.Router.openPlayer({ kind: 'channel', id: ch.id }, { list: Live._ids }); }, { cls: 'btn-primary', key: 'detail:watch' }),
        UI.button(fav ? t('removeFavorite') : t('addFavorite'), fav ? 'heartFill' : 'heart', function () {
          var added = INDTV.FavoritesRepository.toggle(ch.id);
          UI.toast(added ? t('favAdded') : t('favRemoved'));
          var row = Live.listWrap.querySelector('.ch-row[data-channel-id="' + (root.CSS && CSS.escape ? CSS.escape(ch.id) : ch.id) + '"]');
          if (row) row.parentNode.replaceChild(Live._row(ch, Number(row.dataset.index)), row);
        }, { cls: 'btn-ghost', key: 'detail:fav' })
      ]));
      if (keepFocus) INDTV.Focus.restore(keepFocus, d);
    }
  };

  INDTV.LiveScreen = Live;
})(typeof window !== 'undefined' ? window : globalThis);
