/* INDTV — Categories: every category of the playlist in a side list (☰ folds it), the chosen category's
 * channels as round logos, and a search that looks inside the chosen category (or everywhere under "All"). */
(function (root) {
  'use strict';
  var INDTV = root.INDTV = root.INDTV || {};
  var U = INDTV.Util, UI = INDTV.UI, t = function (k) { return INDTV.I18n.t(k); };
  var Cat = INDTV.Categories;

  function matches(ch, q) {
    if (!q) return true;
    var name = ch.name.toLowerCase();
    if (name.indexOf(q) >= 0) return true;
    if (ch.tvgName && ch.tvgName.toLowerCase().indexOf(q) >= 0) return true;
    var nq = U.normalizeName(q);
    if (nq && U.normalizeName(ch.name).indexOf(nq) >= 0) return true;
    return Cat.of(ch).some(function (id) { var c = Cat.info(id); return c.en.toLowerCase().indexOf(q) >= 0 || c.he.indexOf(q) >= 0; });
  }

  var CS = {
    el: null, mounted: false, sel: 'all', query: '', collapsed: false,

    mount: function () {
      CS.el = document.getElementById('screen-categories');
      try { CS.collapsed = INDTV.Store.getSync('cats:collapsed') === true; } catch (e) { CS.collapsed = false; }
      CS.build();
      INDTV.Bus.on('lang', function () { CS.build(); });
      INDTV.Bus.on('catalog', U.debounce(function () { CS.buildList(); CS.renderMain(); }, 300));
      INDTV.Bus.on('favorites', U.debounce(function () { CS.renderMain(true); }, 200));
    },

    build: function () {
      CS.el.innerHTML = '';
      CS.side = U.el('aside', { class: 'cat-side' + (CS.collapsed ? ' is-collapsed' : '') });
      var menu = U.el('button', { class: 'fx menu-btn', type: 'button', 'aria-label': t('toggleList'), dataset: { key: 'cat:menu' } });
      menu.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
      menu.addEventListener('click', function () {
        CS.collapsed = !CS.collapsed;
        CS.side.classList.toggle('is-collapsed', CS.collapsed);
        try { INDTV.Store.setSync('cats:collapsed', CS.collapsed); } catch (e) { /* ignore */ }
      });
      CS.side.appendChild(U.el('div', { class: 'cat-side-head' }, [menu, U.el('span', { class: 'cat-side-title', text: t('categories') })]));
      CS.list = U.el('div', { class: 'vscroll cat-list', 'data-fgroup': 'cat-list', 'data-faxis': 'v', 'data-flock': '', 'data-top-offset': '0' });
      CS.side.appendChild(CS.list);

      var main = U.el('div', { class: 'cat-main' });
      CS.title = U.el('h1', { class: 'cat-title' });
      CS.count = U.el('span', { class: 'cat-count' });
      CS.input = U.el('input', {
        class: 'fx chip chip-search', id: 'cat-search', type: 'search', autocomplete: 'off', spellcheck: 'false', maxlength: '40',
        placeholder: t('searchHere'), 'aria-label': t('searchHere'), dataset: { key: 'cat:search' }
      });
      CS.input.value = CS.query;
      CS.input.addEventListener('input', U.debounce(function () { CS.query = (CS.input.value || '').trim(); CS.renderMain(); }, 160));
      CS.clear = U.el('button', { class: 'fx chip chip-clear', type: 'button', dataset: { key: 'cat:clear' }, html: INDTV.icon('clear') + '<span>' + U.escapeHtml(t('clear')) + '</span>' });
      CS.clear.addEventListener('click', function () { CS.input.value = ''; CS.query = ''; CS.renderMain(); INDTV.Focus.focus(CS.input); });
      var searchWrap = U.el('div', { class: 'chips', 'data-fgroup': 'cat-chips' }, [
        U.el('span', { class: 'chip-search-wrap' }, [U.el('span', { class: 'chip-search-ic', html: INDTV.icon('search') }), CS.input]), CS.clear
      ]);
      main.appendChild(U.el('div', { class: 'cat-head' }, [U.el('div', { class: 'cat-head-text' }, [CS.title, CS.count]), searchWrap]));
      CS.scroller = U.el('div', { class: 'vscroll cat-scroll', 'data-top-offset': '0' });
      main.appendChild(CS.scroller);
      CS.el.appendChild(CS.side);
      CS.el.appendChild(main);
      CS.buildList();
      CS.renderMain();
    },

    buildList: function () {
      var keep = CS.list.contains(document.activeElement) ? document.activeElement.getAttribute('data-key') : null;
      CS.list.innerHTML = '';
      var total = INDTV.ChannelRepository.all().length;
      var rows = [{ id: 'all', count: total }].concat(Cat.all());
      rows.forEach(function (c) {
        var name = c.id === 'all' ? t('allCategories') : Cat.name(c.id);
        var color = c.id === 'all' ? 'var(--lamp)' : Cat.color(c.id);
        var b = U.el('button', { class: 'fx cat-row' + (c.id === CS.sel ? ' is-sel' : ''), type: 'button', dataset: { key: 'cat:' + c.id, cat: c.id }, 'aria-label': name });
        b.innerHTML = '<span class="cat-disc" style="--c:' + color + '"><span>' + U.escapeHtml(c.id === 'all' ? '∗' : name.charAt(0)) + '</span></span>' +
          '<span class="cat-row-text"><span class="cat-name" dir="auto">' + U.escapeHtml(name) + '</span><span class="cat-num">' + U.escapeHtml(U.count(c.count, 'channel', 'channels')) + '</span></span>';
        b.addEventListener('focus', function () {
          clearTimeout(CS._selT);
          CS._selT = setTimeout(function () { CS.select(c.id); }, 220);
        });
        b.addEventListener('click', function () {
          clearTimeout(CS._selT);
          CS.select(c.id);
          var f = CS.scroller.querySelector('.tile') || CS.input;
          INDTV.Focus.focus(f);
        });
        CS.list.appendChild(b);
      });
      if (keep) INDTV.Focus.restore(keep, CS.list);
    },

    select: function (id) {
      if (id === CS.sel && CS._rendered) return;
      CS.sel = id;
      Array.prototype.forEach.call(CS.list.children, function (b) { b.classList.toggle('is-sel', b.dataset.cat === id); });
      if (id !== 'all') { Cat.bump(id, 0.5); INDTV.Ambient.color(Cat.color(id)); }
      CS.renderMain();
    },

    renderMain: function (keepFocus) {
      CS._rendered = true;
      var activeKey = keepFocus && CS.scroller.contains(document.activeElement) ? document.activeElement.getAttribute('data-key') : null;
      var q = CS.query.toLowerCase();
      var base = CS.sel === 'all' ? INDTV.ChannelRepository.all() : Cat.channels(CS.sel);
      var list = q ? base.filter(function (c) { return matches(c, q); }) : base;
      CS.title.textContent = CS.sel === 'all' ? t('allCategories') : Cat.name(CS.sel);
      CS.count.textContent = (q ? list.length + ' / ' : '') + U.count(base.length, 'channel', 'channels');
      CS.clear.hidden = !q;
      CS.scroller.innerHTML = '';
      if (!list.length) {
        var others = q && CS.sel !== 'all' ? INDTV.ChannelRepository.all().filter(function (c) { return matches(c, q); }).length : 0;
        var actions = [];
        if (others) actions.push(UI.button(t('searchEverywhere') + ' (' + others + ')', 'search', function () { CS.select('all'); INDTV.Focus.focus(CS.scroller.querySelector('.tile')); }, { cls: 'btn-primary', key: 'cat:everywhere' }));
        CS.scroller.appendChild(UI.emptyState({ icon: 'search', title: q ? t('noResults') : t('emptyCatalogTitle'), body: q ? '"' + CS.query + '"' : null, actions: actions }));
        return;
      }
      var ids = list.map(function (c) { return c.id; });
      var grid = U.el('div', { class: 'tile-grid', 'data-fgroup': 'cat-grid', 'data-fmemory': '' });
      var rendered = 0, batch = 60;
      var more = function () {
        var end = Math.min(list.length, rendered + batch), frag = document.createDocumentFragment();
        for (var i = rendered; i < end; i++) {
          var tile = UI.channelTile(list[i], ids, { keyPrefix: 'cg' });
          tile.setAttribute('data-row', '');
          frag.appendChild(tile);
        }
        grid.appendChild(frag);
        rendered = end;
      };
      more();
      grid.addEventListener('focusin', function (e) {
        var idx = Array.prototype.indexOf.call(grid.children, e.target);
        if (idx >= rendered - 16 && rendered < list.length) more();
      });
      CS.scroller.appendChild(grid);
      CS.scroller.scrollTop = 0;
      if (activeKey) INDTV.Focus.restore(activeKey, CS.scroller);
    },

    /** Open the tab on a given category (from Home's "see all"). */
    open: function (id) {
      if (!CS.mounted) { INDTV.Router.go('categories'); }
      CS.query = ''; if (CS.input) CS.input.value = '';
      INDTV.Router.go('categories', { animate: true });
      CS._rendered = false;
      CS.select(id);
      var row = CS.list.querySelector('[data-cat="' + id + '"]');
      if (row) INDTV.Focus.reveal(row);
      INDTV.Focus.focus(CS.scroller.querySelector('.tile') || row);
    },

    firstFocus: function () { return CS.list.querySelector('.cat-row.is-sel') || CS.list.querySelector('.cat-row'); },

    onBack: function () {
      var a = document.activeElement;
      if (a && (CS.scroller.contains(a) || (a.closest && a.closest('.cat-head')))) {
        INDTV.Focus.focus(CS.list.querySelector('.cat-row.is-sel') || CS.list.querySelector('.cat-row'));
        return true;
      }
      return false;
    }
  };

  INDTV.CategoriesScreen = CS;
})(typeof window !== 'undefined' ? window : globalThis);
