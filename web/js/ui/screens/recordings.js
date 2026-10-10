/* INDTV — Recordings: programmes saved on this device (see js/player/dvr.js). */
(function (root) {
  'use strict';
  var INDTV = root.INDTV = root.INDTV || {};
  var U = INDTV.Util, UI = INDTV.UI, t = function (k) { return INDTV.I18n.t(k); };

  function fmtBytes(n) {
    if (!n) return '0 MB';
    if (n >= 1e9) return (n / 1e9).toFixed(1) + ' GB';
    return Math.max(1, Math.round(n / 1e6)) + ' MB';
  }
  function fmtDate(ms) {
    try { return new Date(ms).toLocaleDateString(INDTV.I18n.lang() === 'he' ? 'he-IL' : 'en-GB', { day: 'numeric', month: 'short' }) + ' · ' + U.formatTime(ms, INDTV.I18n.lang()); }
    catch (e) { return U.formatTime(ms, INDTV.I18n.lang()); }
  }
  function statusText(r) {
    if (r.status === 'recording') return t('recInProgress');
    if (r.status === 'error') return t('recErrEmpty');
    if (r.error === 'storage') return t('recErrStorage');
    if (r.error === 'network') return t('recErrNet');
    if (r.error === 'encrypted') return t('recErrEnc');
    return t('recDone');
  }

  var R = {
    el: null, mounted: false, _confirm: null,
    mount: function () {
      R.el = document.getElementById('screen-recordings');
      R.scroller = U.el('div', { class: 'vscroll grid-scroll', 'data-top-offset': '7' });
      R.el.appendChild(R.scroller);
      R.render();
      var rr = U.debounce(function () { R.render(); }, 250);
      INDTV.Bus.on('lang', rr);
      INDTV.DVR.state.subscribe(rr, false);
      // elapsed time of a running recording
      setInterval(function () { if (R.el && !R.el.hidden && INDTV.DVR.isRecording()) R.render(); }, 5000);
    },
    onShow: function () { R.render(); },
    firstFocus: function () { return R.el.querySelector('.fx'); },
    render: function () {
      if (!R.el) return;
      var activeKey = document.activeElement && R.el.contains(document.activeElement) ? document.activeElement.getAttribute('data-key') : null;
      var rows = INDTV.DVR.state.get();
      R.scroller.innerHTML = '';
      R.scroller.appendChild(U.el('div', { class: 'screen-head', 'data-row': '' }, [
        U.el('h1', { class: 'screen-title', text: t('recordings') }),
        rows.length ? U.el('span', { class: 'screen-sub', text: String(rows.length) }) : null
      ]));
      var meter = U.el('p', { class: 'set-status rec-meter', 'data-row': '' });
      R.scroller.appendChild(meter);
      INDTV.DVR.usage().then(function (u) {
        var txt = t('recStorage') + ': ' + fmtBytes(u.recBytes);
        if (u.quota) txt += ' · ' + t('recStorageDevice') + ': ' + fmtBytes(u.usage) + ' / ' + fmtBytes(u.quota);
        meter.textContent = txt;
      });
      if (!INDTV.DVR.supported()) {
        R.scroller.appendChild(UI.emptyState({ icon: 'alert', title: t('recordings'), body: t('dvrUnsupported') }));
        return;
      }
      if (!rows.length) {
        R.scroller.appendChild(UI.emptyState({
          icon: 'recordings', title: t('recEmptyTitle'), body: t('recEmptyBody'),
          actions: [UI.button(t('live'), 'live', function () { INDTV.Router.go('live', { focusContent: true }); }, { cls: 'btn-primary', key: 'rec:golive' })]
        }));
      } else {
        var list = U.el('div', { class: 'rec-list', 'data-fgroup': 'rec-list', 'data-fmemory': '' });
        rows.forEach(function (r) {
          var live = r.status === 'recording';
          var info = U.el('div', { class: 'rec-info' }, [
            U.el('span', { class: 'rec-title', text: r.title }),
            U.el('span', { class: 'rec-meta', text: r.chName + ' · ' + fmtDate(r.startWall) }),
            U.el('span', { class: 'rec-meta rec-state' + (live ? ' is-rec' : r.status === 'error' || r.error ? ' is-err' : ''), text: statusText(r) + ' · ' + U.formatDuration(r.dur) + ' · ' + fmtBytes(r.bytes) })
          ]);
          var acts = [];
          if (r.status !== 'error') acts.push(UI.button(t('recPlay'), 'play', function () { INDTV.Router.openPlayer({ kind: 'rec', id: r.id }, { list: [r.id] }); }, { cls: 'btn-primary', key: 'rec:play:' + r.id }));
          if (live) acts.push(UI.button(t('recordStop'), 'stop', function () { INDTV.DVR.stopRecording('stopped'); }, { cls: 'btn-ghost', key: 'rec:stop:' + r.id }));
          var del = UI.button(R._confirm === r.id ? t('recDeleteSure') : t('recDelete'), 'trash', function () {
            if (R._confirm !== r.id) {
              R._confirm = r.id;
              R.render();
              INDTV.Focus.restore('rec:del:' + r.id, R.el);
              setTimeout(function () { if (R._confirm === r.id) { R._confirm = null; R.render(); } }, 4000);
              return;
            }
            R._confirm = null;
            INDTV.DVR.remove(r.id);
          }, { cls: 'btn-ghost btn-danger', key: 'rec:del:' + r.id });
          acts.push(del);
          list.appendChild(U.el('div', { class: 'rec-row', 'data-row': '' }, [info, U.el('div', { class: 'rec-actions' }, acts)]));
        });
        R.scroller.appendChild(list);
      }
      if (activeKey) INDTV.Focus.restore(activeKey, R.el);
    }
  };
  INDTV.RecordingsScreen = R;
})(typeof window !== 'undefined' ? window : globalThis);
