/* INDTV — Catch-up screen: everything the TV recorded by itself, filed by day and hour,
 * plus the catch-up settings (what to record automatically and for how many days to keep it). */
(function (root) {
  'use strict';
  var INDTV = root.INDTV = root.INDTV || {};
  var U = INDTV.Util, UI = INDTV.UI, t = function (k) { return INDTV.I18n.t(k); };
  var DAY = 86400000;

  function dayStart(ts) { var d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); }
  function dayLabel(start) {
    var today = dayStart(Date.now());
    if (start === today) return t('today');
    if (start === today - DAY) return t('yesterday');
    var d = new Date(start), lang = INDTV.I18n.lang();
    var wd = (lang === 'he' ? ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'])[d.getDay()];
    return wd + ' ' + d.getDate() + '/' + (d.getMonth() + 1);
  }
  function hourLabel(ts) { var d = new Date(ts); d.setMinutes(0, 0, 0); return U.formatTime(d.getTime(), INDTV.I18n.lang()); }
  function fmtBytes(b) { return b > 1e9 ? (b / 1e9).toFixed(1) + ' GB' : Math.round(b / 1e6) + ' MB'; }

  var CU = {
    el: null, mounted: false, day: null, view: 'list',

    mount: function () {
      CU.el = document.getElementById('screen-catchup');
      CU.scroller = U.el('div', { class: 'vscroll page-scroll', 'data-top-offset': '0' });
      CU.el.appendChild(CU.scroller);
      CU.render();
      var rr = U.debounce(function () { if (INDTV.Router.current === 'catchup' && !CU._busyFocus()) CU.render(); }, 600);
      INDTV.Bus.on('catchup', rr);
      INDTV.Bus.on('lang', function () { CU.render(); });
      INDTV.Bus.on('catchup-cfg', function () { CU.render(); });
    },
    // the list refreshes as new chunks arrive, but never while the user is moving through it
    _busyFocus: function () { var a = document.activeElement; return a && CU.el.contains(a) && Date.now() - (INDTV.Focus._lastMove || 0) < 4000; },
    onShow: function () { CU.render(); },
    firstFocus: function () { return CU.el.querySelector('.chip.on') || CU.el.querySelector('.fx'); },
    onBack: function () {
      if (CU.view === 'settings') { CU.view = 'list'; CU.render(); INDTV.Focus.focus(CU.el.querySelector('[data-key="cu:settings"]')); return true; }
      return false;
    },

    render: function () {
      var activeKey = document.activeElement && CU.el.contains(document.activeElement) ? document.activeElement.getAttribute('data-key') : null;
      CU.scroller.innerHTML = '';
      var rows = INDTV.CatchUp.state.get();
      var cfg = INDTV.CatchUp.config();
      var bgNames = cfg.channels.map(function (id) { var c = INDTV.ChannelRepository.get(id); return c ? c.name : null; }).filter(Boolean);
      var status = [];
      status.push(cfg.watched ? t('cuWatchedOn') : t('cuWatchedOff'));
      if (bgNames.length) status.push(t('cuBgNow') + ': ' + bgNames.join(', '));
      status.push(cfg.days === 1 ? t('cuKeep1') : t('cuKeep').replace('{n}', cfg.days));
      CU.scroller.appendChild(U.el('div', { class: 'page-head', 'data-row': '' }, [
        U.el('h1', { class: 'page-title', text: t('catchup') }),
        U.el('p', { class: 'page-sub', text: status.join(' · ') })
      ]));

      // day chips (+ settings)
      var days = [], today = dayStart(Date.now());
      for (var i = 0; i < cfg.days; i++) days.push(today - i * DAY);
      if (CU.day === null || days.indexOf(CU.day) < 0) CU.day = today;
      var chips = U.el('div', { class: 'chips chips-row hscroll', 'data-fgroup': 'cu-days', 'data-row': '' });
      days.forEach(function (d) {
        var n = rows.filter(function (r) { return dayStart(r.startWall) === d; }).length;
        var b = U.el('button', { class: 'fx chip' + (CU.view === 'list' && d === CU.day ? ' on' : ''), type: 'button', dataset: { key: 'cu:day:' + d } });
        b.innerHTML = '<span>' + U.escapeHtml(dayLabel(d)) + '</span>' + (n ? '<span class="chip-n">' + n + '</span>' : '');
        b.addEventListener('click', function () { CU.day = d; CU.view = 'list'; CU.render(); INDTV.Focus.focus(CU.el.querySelector('[data-key="cu:day:' + d + '"]')); });
        chips.appendChild(b);
      });
      var set = U.el('button', { class: 'fx chip chip-icon' + (CU.view === 'settings' ? ' on' : ''), type: 'button', dataset: { key: 'cu:settings' }, html: INDTV.icon('settings') + '<span>' + U.escapeHtml(t('cuSettings')) + '</span>' });
      set.addEventListener('click', function () { CU.view = CU.view === 'settings' ? 'list' : 'settings'; CU.render(); INDTV.Focus.focus(CU.el.querySelector('[data-key="cu:settings"]')); });
      chips.appendChild(set);
      CU.scroller.appendChild(chips);

      if (CU.view === 'settings') CU.renderSettings(cfg);
      else CU.renderDay(rows);
      if (activeKey) INDTV.Focus.restore(activeKey, CU.el);
    },

    renderDay: function (rows) {
      var list = rows.filter(function (r) { return dayStart(r.startWall) === CU.day; });
      if (!list.length) {
        var cfg = INDTV.CatchUp.config();
        CU.scroller.appendChild(UI.emptyState({
          icon: 'recordings', title: t('cuEmptyTitle'),
          body: cfg.watched || cfg.channels.length ? t('cuEmptyBody') : t('cuEmptyOff'),
          actions: [UI.button(t('cuSettings'), 'settings', function () { CU.view = 'settings'; CU.render(); INDTV.Focus.focus(CU.el.querySelector('[data-key="cu:settings"]')); }, { cls: 'btn-primary', key: 'cu:empty-set' })]
        }));
        return;
      }
      // group by clock hour, latest first
      var groups = {}, order = [];
      list.forEach(function (r) {
        var h = new Date(r.startWall); h.setMinutes(0, 0, 0);
        var k = h.getTime();
        if (!groups[k]) { groups[k] = []; order.push(k); }
        groups[k].push(r);
      });
      order.sort(function (a, b) { return b - a; });
      var lang = INDTV.I18n.lang();
      order.forEach(function (k) {
        CU.scroller.appendChild(UI.rail({
          title: hourLabel(k), group: 'cu-h-' + k, items: groups[k], cls: 'rail-cards',
          render: function (r) {
            var ch = INDTV.ChannelRepository.get(r.chId) || { id: r.chId, name: r.chName };
            var b = U.el('button', { class: 'fx cu-card' + (r.live ? ' is-live' : ''), type: 'button', dataset: { key: 'cu:' + r.id }, 'aria-label': r.title + ', ' + r.chName });
            b.appendChild(U.el('span', { class: 'tile-disc cu-disc' }, [UI.logo(ch, { cls: 'tile-logo', showName: false })]));
            var info = U.el('span', { class: 'cu-info' }, [
              U.el('span', { class: 'cu-title', dir: 'auto', text: r.title }),
              U.el('span', { class: 'cu-ch', dir: 'auto', text: r.progTitle ? r.chName : t('cuNoGuide') }),
              U.el('span', { class: 'cu-time', text: '\u2066' + U._formatTime(r.startWall, lang) + '–' + U._formatTime(r.endWall, lang) + '\u2069 · \u2066' + U.formatDuration(r.dur) + '\u2069' })
            ]);
            if (r.live) info.appendChild(U.el('span', { class: 'badge-rec cu-live', text: t('recBadge') }));
            if (r.lastPos > 5 && r.dur) info.appendChild(U.el('span', { class: 'progress' }, [U.el('span', { class: 'progress-fill', style: 'width:' + Math.min(100, Math.round(r.lastPos / r.dur * 100)) + '%' })]));
            b.appendChild(info);
            b.addEventListener('focus', function () { INDTV.Ambient.channel(ch.groups ? ch : null); });
            b.addEventListener('click', function () { INDTV.Router.openPlayer({ kind: 'rec', id: r.id }); });
            return b;
          }
        }));
      });
    },

    renderSettings: function (cfg) {
      var wrap = U.el('div', { class: 'cu-settings' });
      // 1. record what I watch
      var w = U.el('button', { class: 'fx set-toggle' + (cfg.watched ? ' on' : ''), type: 'button', dataset: { key: 'cu:watched' }, 'data-row': '' });
      w.innerHTML = '<span class="set-toggle-text"><span class="set-toggle-title">' + U.escapeHtml(t('cuWatched')) + '</span><span class="set-toggle-sub">' + U.escapeHtml(t('cuWatchedSub')) + '</span></span><span class="toggle"></span>';
      w.addEventListener('click', function () { INDTV.CatchUp.setWatched(!INDTV.CatchUp.config().watched); });
      wrap.appendChild(w);
      // 2. keep for N days
      var keep = U.el('div', { class: 'set-line', 'data-row': '' }, [U.el('span', { class: 'set-line-title', text: t('cuDays') })]);
      var kc = U.el('div', { class: 'chips', 'data-fgroup': 'cu-keep' });
      [1, 3, 7, 14].forEach(function (d) {
        var b = U.el('button', { class: 'fx chip' + (cfg.days === d ? ' on' : ''), type: 'button', dataset: { key: 'cu:keep:' + d }, text: d === 1 ? t('cuDay1') : t('cuDaysN').replace('{n}', d) });
        b.addEventListener('click', function () { INDTV.CatchUp.setDays(d); });
        kc.appendChild(b);
      });
      keep.appendChild(kc);
      wrap.appendChild(keep);
      // 3. background channels
      wrap.appendChild(U.el('div', { class: 'set-line-col', 'data-row': '' }, [
        U.el('span', { class: 'set-line-title', text: t('cuBgTitle').replace('{n}', INDTV.CatchUp.maxChannels) }),
        U.el('span', { class: 'set-toggle-sub', text: t('cuBgSub') })
      ]));
      var pool = [];
      cfg.channels.forEach(function (id) { var c = INDTV.ChannelRepository.get(id); if (c) pool.push(c); });
      INDTV.FavoritesRepository.channels().concat(INDTV.RecentRepository.channels()).forEach(function (c) { if (pool.indexOf(c) < 0) pool.push(c); });
      if (!pool.length) {
        wrap.appendChild(U.el('p', { class: 'set-status', text: t('cuBgEmpty') }));
      } else {
        var grid = U.el('div', { class: 'tile-grid tile-grid-sm', 'data-fgroup': 'cu-bg', 'data-fmemory': '' });
        pool.slice(0, 40).forEach(function (c) {
          var on = cfg.channels.indexOf(c.id) >= 0;
          var b = U.el('button', { class: 'fx tile tile-sm tile-pick' + (on ? ' is-on' : ''), type: 'button', dataset: { key: 'cu:bg:' + c.id }, 'aria-label': c.name, 'data-row': '' });
          b.appendChild(U.el('span', { class: 'tile-disc' }, [UI.logo(c, { cls: 'tile-logo', showName: false })]));
          b.appendChild(U.el('span', { class: 'tile-check', html: INDTV.icon('check') }));
          b.appendChild(U.el('span', { class: 'tile-name', text: c.name }));
          b.addEventListener('click', function () {
            if (!INDTV.CatchUp.toggleChannel(c.id)) UI.toast(t('cuBgLimit').replace('{n}', INDTV.CatchUp.maxChannels), 'error');
          });
          grid.appendChild(b);
        });
        wrap.appendChild(grid);
      }
      wrap.appendChild(U.el('p', { class: 'set-status', 'data-row': '', text: t('cuStorage') + ': ' + fmtBytes(INDTV.CatchUp.usageBytes()) + ' · ' + t('cuLocalNote') }));
      CU.scroller.appendChild(wrap);
    }
  };

  INDTV.CatchUpScreen = CU;
})(typeof window !== 'undefined' ? window : globalThis);
