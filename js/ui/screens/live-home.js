/* INDTV — Live. One screen, streaming-service style: a framed billboard for the channel to watch now,
 * a row of category tiles, then rows of channels (recently watched, your favourites, every category).
 * OK on a channel plays it at once. The only other action: hold OK (or use ♥ in the player / billboard)
 * to add a channel to your favourites. */
(function (root) {
  'use strict';
  var INDTV = root.INDTV = root.INDTV || {};
  var U = INDTV.Util, UI = INDTV.UI;
  var CR = INDTV.ChannelRepository, Cat = INDTV.Categories, Fav = INDTV.FavoritesRepository;

  function catLine(ch) {
    return Cat.of(ch).slice(0, 2).map(function (id) { return Cat.name(id); }).join(' • ');
  }
  function nowLine(ch) {
    var e = INDTV.EpgRepository.nowNext(ch);
    if (!e || !e.now) return null;
    var lang = INDTV.I18n.lang();
    return { title: e.now.title, time: '⁦' + U._formatTime(e.now.start, lang) + '–' + U._formatTime(e.now.stop, lang) + '⁩' };
  }
  function play(ch, ids) {
    INDTV.Router.openPlayer({ kind: 'channel', id: ch.id }, { list: ids || [ch.id] });
  }

  // ---- hold OK on a channel = favourite (only once this TV has shown it delivers key-up events)
  var LP = { seenUp: false, down: false, done: false, el: null, timer: 0 };
  function toggleFav(ch) {
    var added = Fav.toggle(ch.id);
    UI.toast(added ? '♥ ' + ch.name + ' נוסף למועדפים' : ch.name + ' הוסר מהמועדפים');
  }

  var Live = {
    el: null, mounted: false,

    mount: function () {
      Live.el = document.getElementById('screen-home');
      Live.el.innerHTML = '';
      Live.el.classList.add('lh');
      Live.scroller = U.el('div', { class: 'vscroll lh-scroll', 'data-top-offset': '0' });
      Live.el.appendChild(Live.scroller);
      Live.el.addEventListener('focusin', function (e) { var k = e.target.getAttribute && e.target.getAttribute('data-key'); if (k) Live._lastKey = k; });
      Live.render();
      var rerender = U.debounce(function () { if (Live.mounted) Live.render(); }, 250);
      ['catalog', 'favorites', 'lang'].forEach(function (evt) { INDTV.Bus.on(evt, rerender); });
      INDTV.Bus.on('catalog-status', function () { if (!CR.all().length) rerender(); });
      INDTV.Bus.on('player-closed', rerender);
      INDTV.Bus.on('epg', function () { if (Live._desc && Live._descCh) Live._fillDesc(Live._desc, Live._descCh); });
      INDTV.Focus.pushHandler({ onKey: Live.onKey });
      document.addEventListener('keyup', Live.onKeyUp, true);
    },

    onShow: function () {},
    topFocus: function () { return Live.scroller.querySelector('.lh-play') || Live.scroller.querySelector('.lh-card'); },
    /** Where focus lands when coming back (e.g. from the player): the channel you left, else the top. */
    firstFocus: function () {
      var k = Live._lastKey;
      var el = k ? Live.el.querySelector('[data-key="' + k.replace(/"/g, '\\"') + '"]') : null;
      return el || Live.topFocus();
    },
    onBack: function () {
      // Back from deep in the rows: jump to the top first (the app asks to exit on the next Back)
      var cur = INDTV.Focus.current();
      var top = Live.topFocus();
      if (cur && top && cur !== top && Live.el.contains(cur)) { INDTV.Focus.focus(top); Live.scroller.scrollTo({ top: 0 }); return true; }
      return false;
    },

    onKey: function (e, KEY, match) {
      if (!match(e, KEY.OK)) return false;
      if (INDTV.Router.playerOpen || INDTV.Router.current !== 'home') return false;
      var cur = INDTV.Focus.current();
      if (!cur || !cur._ch || !LP.seenUp) return false;      // plain OK → click → play
      if (e.repeat) return true;
      LP.down = true; LP.done = false; LP.el = cur;
      clearTimeout(LP.timer);
      LP.timer = setTimeout(function () {
        if (LP.down && !LP.done && LP.el === INDTV.Focus.current()) { LP.done = true; toggleFav(LP.el._ch); }
      }, 650);
      return true;
    },
    onKeyUp: function (e) {
      var M = INDTV.Focus.match, K = INDTV.Focus.KEY;
      if (!M(e, K.OK)) return;
      LP.seenUp = true;
      if (!LP.down) return;
      LP.down = false;
      clearTimeout(LP.timer);
      if (!LP.done && LP.el && LP.el === INDTV.Focus.current()) LP.el.click();
    },

    // ---------------------------------------------------------------- billboard
    _billboard: function (ch, ids) {
      var now = nowLine(ch);
      var fav = Fav.has(ch.id);
      var playBtn = U.el('button', { class: 'fx lh-btn lh-play', type: 'button', dataset: { key: 'lh:play' }, html: INDTV.icon('play') + '<span>צפייה בשידור חי</span>' });
      playBtn.addEventListener('click', function () { play(ch, ids); });
      var favBtn = U.el('button', { class: 'fx lh-btn lh-favbtn' + (fav ? ' is-on' : ''), type: 'button', dataset: { key: 'lh:fav' },
        html: INDTV.icon(fav ? 'heartFill' : 'heart') + '<span>' + (fav ? 'במועדפים' : 'הוספה למועדפים') + '</span>' });
      favBtn.addEventListener('click', function () { toggleFav(ch); });
      [playBtn, favBtn].forEach(function (b) { b.addEventListener('focus', function () { INDTV.Ambient.channel(ch); }); });
      var meta = [U.el('span', { class: 'lh-live', html: '<i></i>שידור חי' })];
      var cl = catLine(ch);
      if (cl) meta.push(U.el('span', { text: cl }));
      var art = U.el('div', { class: 'lh-bb-art', style: '--cat:' + Cat.color(Cat.of(ch)[0]) }, [UI.logo(ch, { cls: 'lh-bb-logo', eager: true, showName: false })]);
      var info = U.el('div', { class: 'lh-bb-info' }, [
        U.el('div', { class: 'lh-kicker', text: INDTV.RecentRepository.channels()[0] === ch ? 'המשך לצפות' : 'מומלץ עכשיו' }),
        U.el('h1', { class: 'lh-bb-title' + (ch.name.length > 20 ? ' long' : ''), dir: 'auto', text: ch.name }),
        U.el('div', { class: 'lh-meta' }, meta),
        now ? U.el('div', { class: 'lh-now' }, [U.el('span', { class: 'lh-now-k', text: 'עכשיו:' }), U.el('span', { dir: 'auto', text: now.title }), U.el('span', { class: 'lh-now-t', text: now.time })]) : null,
        U.el('div', { class: 'lh-actions', 'data-fgroup': 'lh-bb' }, [playBtn, favBtn])
      ]);
      return U.el('section', { class: 'lh-bb-row', 'data-row': '', 'data-row-top': '' }, [U.el('div', { class: 'lh-bb' }, [art, U.el('div', { class: 'lh-bb-shade' }), info])]);
    },

    // ---------------------------------------------------------------- category tiles
    _catTiles: function (cats) {
      var track = U.el('div', { class: 'rail-track lh-tiles', 'data-fgroup': 'lh-cats', 'data-fmemory': '' });
      cats.forEach(function (c, i) {
        var b = U.el('button', { class: 'fx lh-cat', type: 'button', dataset: { key: 'lh-cat:' + c.id }, style: '--cat:' + Cat.color(c.id) },
          [U.el('span', { class: 'lh-cat-name', text: Cat.name(c.id) }), U.el('span', { class: 'lh-cat-n', text: c.count + ' ערוצים' })]);
        b.addEventListener('click', function () { Live.jumpToCategory(i); });
        b.addEventListener('focus', function () { INDTV.Ambient.color(Cat.color(c.id)); });
        track.appendChild(b);
      });
      return U.el('section', { class: 'rail lh-cats-row', 'data-row': '', 'data-row-top': '' }, [track]);
    },

    jumpToCategory: function (i) {
      Live._more(i + 2 - Live._built);
      var row = Live.scroller.querySelector('[data-cat-row="' + i + '"]');
      var card = row && row.querySelector('.lh-card');
      if (card) INDTV.Focus.focus(card);
    },

    // ---------------------------------------------------------------- channel rows
    _row: function (title, meta, items, group) {
      var ids = items.map(function (c) { return c.id; });
      var desc = U.el('div', { class: 'lh-desc' });
      var row = UI.rail({
        title: title, meta: meta, group: group, items: items, cls: 'lh-row', batch: 14,
        render: function (ch) { return Live._card(ch, ids, group, desc); }
      });
      row.setAttribute('data-row-top', '');
      row.appendChild(desc);
      return row;
    },

    _card: function (ch, ids, group, desc) {
      var b = U.el('button', { class: 'fx lh-card', type: 'button', dataset: { key: group + ':' + ch.id, channelId: ch.id }, 'aria-label': ch.name });
      var art = U.el('span', { class: 'lh-card-art', style: '--cat:' + Cat.color(Cat.of(ch)[0]) }, [UI.logo(ch, { cls: 'lh-card-logo', showName: false })]);
      if (Fav.has(ch.id)) art.appendChild(U.el('span', { class: 'lh-heart', html: INDTV.icon('heartFill') }));
      if (INDTV.StreamScan && INDTV.StreamScan.enabled() && INDTV.StreamScan.channelState(ch) === 'dead') b.classList.add('is-off');
      b.appendChild(art);
      b.appendChild(U.el('span', { class: 'lh-card-name', dir: 'auto', text: ch.name }));
      b._ch = ch;
      b.addEventListener('focus', function () {
        INDTV.Ambient.channel(ch);
        Live._fillDesc(desc, ch);
      });
      b.addEventListener('blur', function () { desc.classList.remove('on'); });
      b.addEventListener('click', function () { play(ch, ids); });
      return b;
    },

    _fillDesc: function (desc, ch) {
      Live._desc = desc; Live._descCh = ch;
      desc.innerHTML = '';
      var bits = [U.el('span', { class: 'lh-live', html: '<i></i>שידור חי' })];
      var cl = catLine(ch);
      if (cl) bits.push(U.el('span', { text: cl }));
      var now = nowLine(ch);
      if (now) bits.push(U.el('span', { dir: 'auto', text: 'עכשיו: ' + now.title }), U.el('span', { text: now.time }));
      desc.appendChild(U.el('div', { class: 'lh-meta' }, bits));
      desc.appendChild(U.el('div', { class: 'lh-hint', text: LP.seenUp
        ? (Fav.has(ch.id) ? 'OK לצפייה · החזיקו OK כדי להסיר מהמועדפים' : 'OK לצפייה · החזיקו OK כדי להוסיף למועדפים')
        : 'OK לצפייה · ♥ להוספה למועדפים נמצא בנגן' }));
      desc.classList.add('on');
    },

    render: function () {
      var active = document.activeElement;
      var activeKey = active && Live.el.contains(active) ? active.getAttribute('data-key') : null;
      var state = CR.state.get();
      var S = Live.scroller;
      S.innerHTML = '';
      if (!state.channels.length) { S.appendChild(INDTV.HomeScreen._stateView(state)); return; }

      var recent = INDTV.RecentRepository.channels();
      var favs = Fav.channels();
      var pop = INDTV.popularChannels(24);
      var featured = recent[0] || favs[0] || pop[0];
      var cats = Cat.ranked();
      if (featured) S.appendChild(Live._billboard(featured, (recent.length ? recent : pop).map(function (c) { return c.id; })));
      if (cats.length > 1) S.appendChild(Live._catTiles(cats));
      if (favs.length) S.appendChild(Live._row('המועדפים שלי', favs.length + ' ערוצים', favs, 'lh-favs'));
      if (recent.length) S.appendChild(Live._row('צפית לאחרונה', '', recent.slice(0, 20), 'lh-recent'));
      if (!recent.length && !favs.length) S.appendChild(Live._row('הכי נצפים', '', pop, 'lh-pop'));

      // category rows are built a few at a time as you move down
      Live._cats = cats; Live._built = 0;
      Live._more = function (n) {
        var end = Math.min(cats.length, Live._built + Math.max(0, n));
        for (var i = Live._built; i < end; i++) {
          var c = cats[i];
          var row = Live._row(Cat.name(c.id), c.count + ' ערוצים', INDTV.StreamScan.sort(c.channels), 'lh-c-' + U.hash(c.id));
          row.setAttribute('data-cat-row', String(i));
          S.appendChild(row);
        }
        Live._built = end;
      };
      Live._more(4);
      S.onfocusin = function (e) {
        var row = e.target.closest && e.target.closest('[data-cat-row]');
        if (row && +row.getAttribute('data-cat-row') >= Live._built - 2) Live._more(3);
      };
      if (INDTV.Router.playerOpen) return;            // never pull focus out from under the player
      var want = activeKey || (Live.mountedOnce && Live._lastKey);
      Live.mountedOnce = true;
      if (want && /^lh-c-/.test(want)) Live._more(cats.length);
      var back = want ? Live.el.querySelector('[data-key="' + want.replace(/"/g, '\\"') + '"]') : null;
      if (!back && want && want.indexOf(':') > 0) {      // its row changed (e.g. "recently watched" appeared): same channel elsewhere
        var chId = want.slice(want.indexOf(':') + 1);
        back = Live.el.querySelector('[data-channel-id="' + chId.replace(/"/g, '\\"') + '"]');
      }
      if (back) INDTV.Focus.focus(back);
      else if (want || !INDTV.Focus.current()) { var f = Live.topFocus(); if (f && INDTV.Router.current === 'home' && document.documentElement.classList.contains('is-ready')) INDTV.Focus.focus(f); }
    }
  };

  INDTV.LiveHome = Live;
})(typeof window !== 'undefined' ? window : globalThis);
