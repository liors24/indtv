/* INDTV — Player screen + OSD. Renders PlayerController.state; never starts playback on its own. */
(function (root) {
  'use strict';
  var INDTV = root.INDTV = root.INDTV || {};
  var U = INDTV.Util, UI = INDTV.UI, t = function (k) { return INDTV.I18n.t(k); };
  var P = INDTV.Player, Focus = INDTV.Focus;

  var OSD_HIDE_MS = 3600;

  var PS = {
    el: null, _open: false, _returnFocus: null, _osdTimer: null, _handler: null, _renderedItemId: null,

    build: function () {
      var el = PS.el = document.getElementById('player');
      el.innerHTML = '';
      PS.video = U.el('video', { class: 'player-video', playsinline: '', 'aria-label': 'Video' });
      el.appendChild(PS.video);
      el.appendChild(U.el('div', { class: 'osd-shade-top', 'aria-hidden': 'true' }));
      el.appendChild(U.el('div', { class: 'osd-shade-bottom', 'aria-hidden': 'true' }));

      PS.top = U.el('div', { class: 'osd osd-top' });
      PS.chInfo = U.el('div', { class: 'osd-ch' });
      PS.badges = U.el('div', { class: 'osd-badges' });
      PS.top.appendChild(PS.chInfo);
      PS.top.appendChild(PS.badges);
      el.appendChild(PS.top);

      PS.subs = U.el('div', { class: 'live-subs', 'aria-live': 'polite' });
      el.appendChild(PS.subs);
      PS.status = U.el('div', { class: 'player-status', 'aria-live': 'polite' });
      el.appendChild(PS.status);

      var bottom = PS.bottom = U.el('div', { class: 'osd osd-bottom' });
      PS.prog = U.el('div', { class: 'osd-prog' });
      PS.progress = U.el('div', { class: 'osd-progress' }, [
        U.el('span', { class: 'osd-time osd-time-a' }),
        U.el('span', { class: 'progress progress-osd' }, [U.el('span', { class: 'progress-fill' })]),
        U.el('span', { class: 'osd-time osd-time-b' })
      ]);
      var main = U.el('div', { class: 'osd-main', 'data-fgroup': 'osd-main' });
      PS.btn = {};
      function ctl(name, icon, label, fn, cls) {
        var b = U.el('button', { class: 'fx ctl' + (cls ? ' ' + cls : ''), type: 'button', 'aria-label': label, title: label, dataset: { key: 'ctl:' + name } });
        b.innerHTML = INDTV.icon(icon);
        b.addEventListener('click', function () { fn(); PS.showOsd(); });
        PS.btn[name] = b;
        return b;
      }
      var dvr = U.el('div', { class: 'osd-dvr', 'data-fgroup': 'osd-dvr' });
      dvr.appendChild(ctl('rec', 'record', t('recordBtn'), function () { PS.doRecord(); }, 'ctl-sm'));
      dvr.appendChild(ctl('start', 'startOver', t('startOver'), function () { PS.doStartOver(); }, 'ctl-sm'));
      dvr.appendChild(ctl('live', 'goLive', t('goLive'), function () { P.goLive(); }, 'ctl-sm ctl-live'));
      main.appendChild(ctl('rw', 'rewind10', t('rewind'), function () { PS.jump(-1, PS.btn.rw); }));
      main.appendChild(ctl('prev', 'prev', t('prevChannel'), function () { P.step(-1); }));
      main.appendChild(ctl('play', 'pause', t('pause'), function () { P.togglePlay(); }, 'ctl-main'));
      main.appendChild(ctl('next', 'next', t('nextChannel'), function () { P.step(1); }));
      main.appendChild(ctl('fw', 'forward10', t('forward'), function () { PS.jump(1, PS.btn.fw); }));
      var secondary = U.el('div', { class: 'osd-secondary', 'data-fgroup': 'osd-secondary' });
      secondary.appendChild(ctl('tr', 'translate', t('liveTranslate'), function () {
        if (!INDTV.LiveTranslate.isConfigured()) { UI.toast(t('translateSetup')); return; }
        INDTV.LiveTranslate.toggle(PS.video);
      }, 'ctl-sm'));
      secondary.appendChild(ctl('mute', 'volume', t('mute'), function () { P.toggleMute(); }, 'ctl-sm'));
      secondary.appendChild(ctl('stop', 'stop', t('stop'), function () { P.stop(); }, 'ctl-sm'));
      secondary.appendChild(ctl('fs', 'fullscreen', t('fullscreen'), function () { PS.toggleFullscreen(); }, 'ctl-sm'));
      secondary.appendChild(ctl('back', 'back', t('back'), function () { PS.close(); }, 'ctl-sm'));
      bottom.appendChild(PS.prog);
      bottom.appendChild(PS.progress);
      bottom.appendChild(U.el('div', { class: 'osd-controls' }, [dvr, main, secondary]));
      el.appendChild(bottom);

      P.init(PS.video);
      if (PS._wired) setTimeout(function () { PS.renderSubs(INDTV.LiveTranslate.state.get()); }, 0);
      PS._renderedItemId = null;
      el.addEventListener('mousemove', function () { if (PS._open) PS.showOsd(); });
      if (PS._wired) return;
      PS._wired = true;
      INDTV.LiveTranslate.state.subscribe(function (ts) { PS.renderSubs(ts); }, false);
      P.state.subscribe(PS.render, false);
      INDTV.Bus.on('epg', function () { if (PS._open) PS.renderProgramme(); });
      // Labels are rebuilt for the new language while the player is closed (it covers the language toggle).
      INDTV.Bus.on('lang', function () { if (!PS._open) PS.build(); });
      setInterval(function () { if (PS._open && P.state.get().kind === 'channel') PS.renderProgramme(); }, 30000);
    },

    isOpen: function () { return PS._open; },

    open: function (ref, ctx, returnFocus) {
      if (!PS._open) {
        PS._open = true;
        if (returnFocus) PS._returnFocus = returnFocus;
        PS.el.hidden = false;
        document.documentElement.classList.add('is-watching');
        Focus.scope = PS.el;
        PS._handler = { onBack: PS.onBack, onKey: PS.onKey };
        Focus.pushHandler(PS._handler);
      }
      P.open(ref, ctx);
      PS.showOsd();
      Focus.focus(PS.btn.play, { noScroll: true });
    },

    close: function (opts) {
      if (!PS._open) return;
      PS._open = false;
      INDTV.LiveTranslate.stop();
      P.close();
      clearTimeout(PS._osdTimer);
      if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(function () {});
      PS.el.hidden = true;
      PS.el.classList.remove('osd-on');
      document.documentElement.classList.remove('is-watching');
      Focus.scope = null;
      Focus.popHandler(PS._handler);
      var rf = PS._returnFocus;
      PS._returnFocus = null;
      if (rf && rf.isConnected) Focus.focus(rf);
      else { var s = INDTV.Router.screens[INDTV.Router.current]; var f = s && s.firstFocus && s.firstFocus(); if (f) Focus.focus(f); }
      if (!opts || !opts.fromHistory) INDTV.Router.playerClosed();
      INDTV.Bus.emit('player-closed');
    },

    onBack: function () {
      var st = P.state.get();
      if (PS.el.classList.contains('osd-on') && st.phase === 'playing') { PS.hideOsd(); return true; }
      if (document.fullscreenElement && document.exitFullscreen) { document.exitFullscreen().catch(function () {}); return true; }
      PS.close();
      return true;
    },

    onKey: function (e, KEY, match) {
      if (match(e, KEY.CH_UP)) { P.step(1); PS.showOsd(); return true; }
      if (match(e, KEY.CH_DOWN)) { P.step(-1); PS.showOsd(); return true; }
      if (match(e, KEY.PLAYPAUSE) || match(e, KEY.PLAY) || match(e, KEY.PAUSE)) { P.togglePlay(); PS.showOsd(); return true; }
      if (match(e, KEY.STOP)) { P.stop(); PS.showOsd(); return true; }
      if (match(e, KEY.FF)) { PS.jump(1, PS.btn.fw); PS.showOsd(); return true; }
      if (match(e, KEY.RW)) { PS.jump(-1, PS.btn.rw); PS.showOsd(); return true; }
      if (match(e, KEY.RED)) { PS.doRecord(); PS.showOsd(); return true; }
      if (match(e, KEY.GREEN)) { PS.doStartOver(); PS.showOsd(); return true; }
      if (match(e, KEY.YELLOW)) { P.goLive(); PS.showOsd(); return true; }
      var isNav = match(e, KEY.LEFT) || match(e, KEY.RIGHT) || match(e, KEY.UP) || match(e, KEY.DOWN) || match(e, KEY.OK);
      if (isNav && !PS.el.classList.contains('osd-on')) {
        // First press only reveals the OSD; it never triggers a control by accident.
        PS.showOsd();
        if (!PS.el.contains(document.activeElement)) Focus.focus(PS.btn.play, { noScroll: true });
        return true;
      }
      if (isNav) PS.showOsd();
      return false;
    },

    showOsd: function () {
      PS.el.classList.add('osd-on');
      clearTimeout(PS._osdTimer);
      PS._osdTimer = setTimeout(function () {
        var st = P.state.get();
        if (st.phase === 'playing' && !st.paused) PS.hideOsd();
        else PS.showOsd();
      }, OSD_HIDE_MS);
    },
    hideOsd: function () {
      clearTimeout(PS._osdTimer);
      PS.el.classList.remove('osd-on');
    },

    /** Rewind / forward; repeated presses in a row jump further (10 s, 10 s, 30 s, 1 min, 2 min, 5 min). */
    jump: function (dir, btn) {
      var now = Date.now(), steps = [10, 10, 30, 60, 120, 300];
      PS._jumpN = now - (PS._jumpAt || 0) < 1300 ? Math.min(steps.length - 1, (PS._jumpN || 0) + 1) : 0;
      PS._jumpAt = now;
      var ok = P.seekBy(dir * steps[PS._jumpN]);
      if (!ok) {
        PS.flash(btn);
        var st = P.state.get();
        if (st.kind === 'channel' && dir < 0) UI.toast(t(st.dvrOn ? 'recNoBuffer' : 'recNoDvr'));
      }
    },
    doRecord: function () {
      var r = P.toggleRecord();
      if (r === 'started') UI.toast(t('recStarted'));
      else if (r === 'stopped') UI.toast(t('recStopped'));
      else if (r === 'busy') UI.toast(t('recBusy'), 'error');
      else UI.toast(t('recUnavailable'), 'error');
    },
    doStartOver: function () {
      var r = P.jumpToProgramme();
      if (r.ok) { if (!r.exact) UI.toast(t('progPartial')); return; }
      PS.flash(PS.btn.start);
      UI.toast(t(r.why === 'noepg' ? 'progNoEpg' : r.why === 'kind' ? 'recNoDvr' : P.state.get().dvrOn ? 'recNoBuffer' : 'recNoDvr'));
    },

    flash: function (btn) {
      btn.classList.add('is-denied');
      setTimeout(function () { btn.classList.remove('is-denied'); }, 400);
    },

    toggleFullscreen: function () {
      try {
        if (document.fullscreenElement) document.exitFullscreen();
        else if (PS.el.requestFullscreen) PS.el.requestFullscreen().catch(function () {});
      } catch (e) { /* not available on this TV */ }
    },

    render: function (st) {
      if (!PS.el) return;
      var item = st.item;
      PS.el.setAttribute('data-phase', st.phase);
      // channel / title block (top-left) — logo is Channel.logoUrl (tvg-logo)
      var itemKey = item ? st.kind + ':' + item.id : null;
      if (itemKey !== PS._renderedItemId) {
        PS._renderedItemId = itemKey;
        PS.chInfo.innerHTML = '';
        if (item) {
          var isCh = st.kind === 'channel';
          PS.chInfo.appendChild(U.el('span', { class: 'osd-logo' }, [UI.logo(isCh ? item : { name: item.title, poster: item.poster }, { showName: false, eager: true })]));
          PS.chInfo.appendChild(U.el('span', { class: 'osd-ch-text' }, [
            U.el('span', { class: 'osd-ch-name', text: isCh ? item.name : item.title }),
            U.el('span', { class: 'osd-ch-cat', text: isCh ? (item.groups.join(' · ') || t('liveBroadcast')) : st.kind === 'rec' ? (item.chName || t('recordings')) : (item.kind === 'episode' ? 'S' + item.season + ' · E' + item.episode : t('movies')) })
          ]));
        }
        PS.renderProgramme();
        var hasN = P.hasNeighbours();
        PS.btn.prev.disabled = !hasN;
        PS.btn.next.disabled = !hasN;
        PS.btn.prev.classList.toggle('is-disabled', !hasN);
        PS.btn.next.classList.toggle('is-disabled', !hasN);
      }
      // badges (top-right)
      PS.badges.innerHTML = '';
      PS.badges.appendChild(U.el('span', { class: 'osd-clock', text: U.formatTime(Date.now(), INDTV.I18n.lang()) }));
      if (st.kind === 'channel' && st.recording) PS.badges.appendChild(U.el('span', { class: 'badge-rec', text: t('recBadge') + ' ' + U.formatDuration(st.recSec) }));
      if (st.kind === 'channel' && st.shift) PS.badges.appendChild(U.el('span', { class: 'badge-shift', dir: 'ltr', text: '−' + U.formatDuration(st.behind) + ' ' + t('behindLive') }));
      else if (st.kind === 'channel') PS.badges.appendChild(UI.liveBadge('badge-lg'));
      var q = st.quality || (item && item.quality ? (parseInt(item.quality, 10) >= 1000 ? 'FHD' : parseInt(item.quality, 10) >= 700 ? 'HD' : null) : null);
      if (q) PS.badges.appendChild(U.el('span', { class: 'tag tag-q', text: q }));
      if (st.muted) PS.badges.appendChild(U.el('span', { class: 'osd-muted', html: INDTV.icon('mute') }));

      // controls
      var playing = st.phase === 'playing' && !st.paused;
      PS.btn.play.innerHTML = INDTV.icon(playing ? 'pause' : 'play');
      PS.btn.play.setAttribute('aria-label', playing ? t('pause') : t('play'));
      PS.btn.mute.innerHTML = INDTV.icon(st.muted ? 'mute' : 'volume');
      PS.btn.mute.setAttribute('aria-label', st.muted ? t('unmute') : t('mute'));
      var isCh = st.kind === 'channel';
      var canBack = isCh ? (st.shift || (st.dvrOn && st.buf >= 6) || st.canSeek) : st.canSeek;
      PS.btn.rw.classList.toggle('is-disabled', !canBack);
      PS.btn.fw.classList.toggle('is-disabled', isCh ? !(st.shift || st.canSeek) : !st.canSeek);
      PS.btn.rec.hidden = PS.btn.start.hidden = !isCh;
      PS.btn.live.hidden = !(isCh && st.shift);
      PS.btn.rec.classList.toggle('is-rec', !!st.recording);
      PS.btn.rec.setAttribute('aria-label', st.recording ? t('recordStop') : t('recordBtn'));
      PS.btn.rec.innerHTML = INDTV.icon(st.recording ? 'stop' : 'record');
      PS.btn.start.classList.toggle('is-disabled', !(st.dvrOn && st.buf >= 6));
      PS.btn.live.innerHTML = INDTV.icon('goLive') + '<span>' + U.escapeHtml(t('liveBadge')) + '</span>';

      // progress
      var fill = PS.progress.querySelector('.progress-fill');
      var a = PS.progress.querySelector('.osd-time-a'), b = PS.progress.querySelector('.osd-time-b');
      var mark = PS.progress.querySelector('.prog-mark');
      if (mark) mark.remove();
      PS.progress.classList.toggle('is-shift', !!st.shift);
      if ((st.kind === 'vod' || st.kind === 'rec') && isFinite(st.duration) && st.duration > 0) {
        fill.style.width = Math.min(100, st.currentTime / st.duration * 100) + '%';
        a.textContent = U.formatDuration(st.currentTime);
        b.textContent = U.formatDuration(st.duration);
      } else {
        var epg = st.kind === 'channel' ? INDTV.EpgRepository.nowNext(item) : null;
        if (epg && epg.now) {
          // The bar is the whole programme. While watching behind live the thumb moves back by the delay,
          // and a tick shows where the saved buffer begins (that is as far back as you can go).
          var len = epg.now.stop - epg.now.start, at = Date.now() - (st.shift ? st.behind * 1000 : 0);
          fill.style.width = Math.max(0, Math.min(100, Math.round((at - epg.now.start) / len * 100))) + '%';
          a.textContent = U.formatTime(epg.now.start, INDTV.I18n.lang());
          b.textContent = U.formatTime(epg.now.stop, INDTV.I18n.lang());
          if (st.dvrOn && st.bufStart > epg.now.start) {
            var mk = U.el('span', { class: 'prog-mark', 'aria-hidden': 'true' });
            mk.style.left = Math.min(100, (st.bufStart - epg.now.start) / len * 100) + '%';
            PS.progress.querySelector('.progress-osd').appendChild(mk);
          }
        } else if (st.kind === 'rec') {
          fill.style.width = '100%';
          a.textContent = U.formatDuration(st.currentTime);
          b.textContent = '';
        } else if (st.shift && st.buf > 0) {
          fill.style.width = Math.max(0, Math.min(100, (st.buf - st.behind) / st.buf * 100)) + '%';
          a.textContent = '−' + U.formatDuration(st.behind);
          b.textContent = t('liveBadge');
        } else {
          fill.style.width = '100%';
          a.textContent = t('liveBadge');
          b.textContent = '';
        }
      }
      PS.progress.classList.toggle('is-live', st.kind === 'channel');

      // status panel (center)
      PS.status.innerHTML = '';
      if (st.phase === 'loading' || (st.phase === 'playing' && st.buffering)) {
        var srcLine = st.checking ? t('checkingSources') : st.phase === 'loading' && st.sourceCount ? t('tryingSource') + ' ' + (st.sourceIndex + 1) + ' ' + t('of') + ' ' + st.sourceCount : t('buffering');
        PS.status.appendChild(U.el('div', { class: 'status-card status-loading' }, [
          U.el('span', { class: 'status-bar' }, [U.el('span')]),
          U.el('span', { class: 'status-text', text: srcLine })
        ]));
      } else if (st.phase === 'error') {
        var body = st.error === 'missing' ? t('streamUnavailable') : t('allSourcesFailedBody');
        var card = U.el('div', { class: 'status-card status-error' }, [
          U.el('span', { class: 'status-icon', html: INDTV.icon('alert') }),
          U.el('h2', { class: 'status-title', text: st.error === 'missing' ? t('streamUnavailable') : t('allSourcesFailed') }),
          U.el('p', { class: 'status-body', text: body })
        ]);
        if (st.insecureSkipped) card.appendChild(U.el('p', { class: 'status-note', text: t('insecureBlocked') }));
        if (item && item.geoBlocked) card.appendChild(U.el('p', { class: 'status-note', text: t('geoNote') }));
        var retry = UI.button(t('tryAgain'), 'refresh', function () { if (item) P.open({ kind: st.kind, id: item.id }); }, { cls: 'btn-primary', key: 'err:retry' });
        var back = UI.button(t('back'), 'back', function () { PS.close(); }, { cls: 'btn-ghost', key: 'err:back' });
        card.appendChild(U.el('div', { class: 'status-actions', 'data-fgroup': 'err' }, [retry, back]));
        PS.status.appendChild(card);
        PS.showOsd();
        setTimeout(function () { if (PS._open && P.state.get().phase === 'error') Focus.focus(retry, { noScroll: true }); }, 0);
      } else if (st.phase === 'stopped') {
        PS.status.appendChild(U.el('div', { class: 'status-card' }, [U.el('span', { class: 'status-text', text: t('stopped') })]));
      }
    },

    renderProgramme: function () {
      var st = P.state.get();
      var focusKey = PS.prog.contains(document.activeElement) ? document.activeElement.getAttribute('data-key') : null;
      PS.prog.innerHTML = '';
      if (!st.item) return;
      if (st.kind !== 'channel') {
        PS.prog.appendChild(U.el('div', { class: 'osd-now' }, [U.el('span', { class: 'osd-now-title', text: st.item.title })]));
        return;
      }
      var ch = st.item;
      var epg = INDTV.EpgRepository.nowNext(ch);
      var lang = INDTV.I18n.lang();
      if (epg && epg.now) {
        var prog = epg.now;
        var fav = INDTV.ShowFavorites.has(prog.title);
        var heart = U.el('button', { class: 'fx prog-fav' + (fav ? ' is-on' : ''), type: 'button', dataset: { key: 'osd:showfav' } });
        heart.innerHTML = INDTV.icon(fav ? 'heartFill' : 'heart') + '<span>' + U.escapeHtml(fav ? t('removeShow') : t('addShow')) + '</span>';
        heart.addEventListener('click', function () {
          var added = INDTV.ShowFavorites.toggle(prog, ch);
          UI.toast(added ? t('showAdded') : t('showRemoved'));
          PS.renderProgramme();
          PS.showOsd();
        });
        PS.prog.appendChild(U.el('div', { class: 'osd-now' }, [
          U.el('span', { class: 'osd-label', text: t('nowPlaying') + ' · ' + '\u2066' + U._formatTime(prog.start, lang) + '–' + U._formatTime(prog.stop, lang) + '\u2069' }),
          U.el('span', { class: 'osd-now-row' }, [U.el('span', { class: 'osd-now-title', text: prog.title }), heart])
        ]));
        if (epg.next) PS.prog.appendChild(U.el('div', { class: 'osd-next' }, [
          U.el('span', { class: 'osd-label', text: t('upNext') + ' · ' + U.formatTime(epg.next.start, lang) }),
          U.el('span', { class: 'osd-next-title', text: epg.next.title })
        ]));
      } else if (epg && epg.next) {
        PS.prog.appendChild(U.el('div', { class: 'osd-now' }, [
          U.el('span', { class: 'osd-label', text: t('upNext') + ' · ' + U.formatTime(epg.next.start, lang) }),
          U.el('span', { class: 'osd-now-title', text: epg.next.title })
        ]));
      } else {
        PS.prog.appendChild(U.el('div', { class: 'osd-now' }, [
          U.el('span', { class: 'osd-label', text: t('nowPlaying') }),
          U.el('span', { class: 'osd-now-title', text: t('liveBroadcast') })
        ]));
      }
      if (focusKey) INDTV.Focus.restore(focusKey, PS.prog);
    },

    /* ---------- live translation overlay ---------- */
    renderSubs: function (ts) {
      if (!PS.subs) return;
      PS.btn.tr.classList.toggle('is-on', !!ts.on);
      PS.btn.tr.setAttribute('aria-label', ts.on ? t('translateOn') : t('liveTranslate'));
      INDTV.UI.applySubStyle(PS.subs);
      PS.subs.innerHTML = '';
      if (!ts.on || !ts.text) return;
      PS.subs.appendChild(U.el('div', { class: 'live-sub-line', dir: 'auto', text: ts.text }));
      if (ts.showOriginal && ts.orig && ts.orig !== ts.text) PS.subs.appendChild(U.el('div', { class: 'live-sub-orig', dir: 'auto', text: ts.orig }));
    }
  };

  INDTV.PlayerScreen = PS;
})(typeof window !== 'undefined' ? window : globalThis);
