/* INDTV — Search: channel name, tvg-name and group-title (+ VOD titles when a VOD source exists). */
(function (root) {
  'use strict';
  var INDTV = root.INDTV = root.INDTV || {};
  var U = INDTV.Util, UI = INDTV.UI, t = function (k) { return INDTV.I18n.t(k); };

  var KEYS = 'abcdefghijklmnopqrstuvwxyz0123456789'.split('');

  var Search = {
    el: null, mounted: false, query: '',
    mount: function () {
      Search.el = document.getElementById('screen-search');
      Search.build();
      INDTV.Bus.on('lang', function () { Search.build(); });
      INDTV.Bus.on('catalog', U.debounce(function () { Search.results(); }, 300));
    },
    build: function () {
      Search.el.innerHTML = '';
      var left = U.el('div', { class: 'search-left' });
      Search.input = U.el('input', {
        class: 'fx search-input', id: 'search-input', type: 'search', autocomplete: 'off', spellcheck: 'false',
        placeholder: t('searchPlaceholder'), 'aria-label': t('search'), dataset: { key: 'search:input' }, maxlength: '60'
      });
      Search.input.value = Search.query;
      Search.input.addEventListener('input', function () { Search.query = Search.input.value; Search.resultsSoon(); });
      left.appendChild(U.el('div', { class: 'search-field' }, [U.el('span', { class: 'search-icon', html: INDTV.icon('search') }), Search.input]));
      var kb = U.el('div', { class: 'osk', 'data-fgroup': 'osk', 'data-fmemory': '' });
      KEYS.forEach(function (k) {
        var b = U.el('button', { class: 'fx osk-key', type: 'button', text: k.toUpperCase(), dataset: { key: 'osk:' + k } });
        b.addEventListener('click', function () { Search.type(k); });
        kb.appendChild(b);
      });
      [['space', ' ', 'osk-wide'], ['del', null, 'osk-wide'], ['clear', null, 'osk-wide']].forEach(function (spec) {
        var b = U.el('button', { class: 'fx osk-key ' + spec[2], type: 'button', dataset: { key: 'osk:' + spec[0] }, 'aria-label': t(spec[0]) });
        b.innerHTML = INDTV.icon(spec[0]) + '<span>' + U.escapeHtml(t(spec[0])) + '</span>';
        b.addEventListener('click', function () {
          if (spec[0] === 'space') Search.type(' ');
          else if (spec[0] === 'del') Search.set(Search.query.slice(0, -1));
          else Search.set('');
        });
        kb.appendChild(b);
      });
      left.appendChild(kb);
      left.appendChild(U.el('p', { class: 'search-hint', text: t('searchHint') }));
      Search.out = U.el('div', { class: 'search-results vscroll', 'data-top-offset': '0.5' });
      Search.el.appendChild(U.el('div', { class: 'screen-head' }, [U.el('h1', { class: 'screen-title', text: t('search') })]));
      Search.el.appendChild(U.el('div', { class: 'search-grid' }, [left, Search.out]));
      Search.results();
    },
    type: function (ch) { Search.set((Search.query + ch).slice(0, 60)); },
    set: function (q) { Search.query = q; Search.input.value = q; Search.results(); },
    resultsSoon: U.debounce(function () { Search.results(); }, 180),
    results: function () {
      var q = Search.query.trim();
      Search.out.innerHTML = '';
      if (!q) {
        var popular = INDTV.popularChannels(12);
        if (popular.length) {
          var ids0 = popular.map(function (c) { return c.id; });
          Search.out.appendChild(U.el('h2', { class: 'rail-title', text: t('popularChannels') }));
          var g0 = U.el('div', { class: 'grid grid-compact', 'data-fgroup': 'search-pop', 'data-fmemory': '' });
          popular.forEach(function (c) { var card = UI.channelCard(c, ids0, { variant: 'grid', keyPrefix: 'sp', showName: true }); card.setAttribute('data-row', ''); g0.appendChild(card); });
          Search.out.appendChild(g0);
        }
        return;
      }
      var list = INDTV.ChannelRepository.search(q).slice(0, 120);
      var vod = INDTV.VodRepository.search(q);
      Search.out.appendChild(U.el('h2', { class: 'rail-title', text: (list.length + vod.length) + ' ' + t('results') + ' · "' + q + '"' }));
      if (!list.length && !vod.length) {
        Search.out.appendChild(UI.emptyState({ icon: 'search', title: t('noResults') + ' "' + q + '"' }));
        return;
      }
      var ids = list.map(function (c) { return c.id; });
      var grid = U.el('div', { class: 'grid grid-compact', 'data-fgroup': 'search-res', 'data-fmemory': '' });
      list.forEach(function (c) { var card = UI.channelCard(c, ids, { variant: 'grid', keyPrefix: 'sr', showName: true }); card.setAttribute('data-row', ''); grid.appendChild(card); });
      vod.forEach(function (m) {
        var b = U.el('button', { class: 'fx card card-grid card-vod', type: 'button', 'data-row': '', dataset: { key: 'srv:' + m.id } }, [
          UI.logo({ name: m.title, poster: m.poster }, { cls: 'card-logo', showName: true }),
          U.el('span', { class: 'card-meta' }, [U.el('span', { class: 'card-name', text: m.title }), U.el('span', { class: 'card-group', text: t('movies') })])
        ]);
        b.addEventListener('click', function () { INDTV.Router.openPlayer({ kind: 'vod', id: m.id }); });
        grid.appendChild(b);
      });
      Search.out.appendChild(grid);
    },
    onShow: function () {},
    firstFocus: function () { return Search.el.querySelector('.osk-key'); }
  };

  INDTV.SearchScreen = Search;
})(typeof window !== 'undefined' ? window : globalThis);
