/* INDTV — Settings: language, Sources (built-in + user URL / pasted / local file), programme guide, data. */
(function (root) {
  'use strict';
  var INDTV = root.INDTV = root.INDTV || {};
  var U = INDTV.Util, UI = INDTV.UI, t = function (k) { return INDTV.I18n.t(k); };
  var PR = INDTV.PlaylistRepository, SR = INDTV.SourcesRepository;

  function errText(code) {
    switch (code) {
      case 'offline': return t('noConnection');
      case 'hls': return t('hlsNotPlaylist');
      case 'not_m3u': return t('notM3u');
      case 'invalid_url': return t('invalidUrl');
      case 'empty': return t('emptyCatalogTitle');
      case 'too_large': return 'File too large';
      default: return t('playlistUnavailable') + (code && /^HTTP|^http/.test(code) ? ' (' + code + ')' : '');
    }
  }

  var Settings = {
    el: null, mounted: false, addMode: null, addKind: 'live', _confirmClear: false,

    mount: function () {
      Settings.el = document.getElementById('screen-settings');
      Settings.build();
      SR.state.subscribe(U.debounce(function () { Settings.renderSources(); }, 120), false);
      INDTV.EpgRepository.state.subscribe(function () { Settings.renderEpgStatus(); }, false);
      INDTV.Bus.on('lang', function () { Settings.build(); });
    },
    firstFocus: function () { return Settings.el.querySelector('.fx'); },

    build: function () {
      Settings.el.innerHTML = '';
      Settings.scroller = U.el('div', { class: 'vscroll settings-scroll', 'data-top-offset': '7' });
      Settings.el.appendChild(Settings.scroller);
      var s = Settings.scroller;
      s.appendChild(U.el('div', { class: 'screen-head', 'data-row': '' }, [U.el('h1', { class: 'screen-title', text: t('settings') })]));

      // Language
      var langRow = U.el('div', { class: 'set-row', 'data-fgroup': 'set-lang' });
      [['en', 'English'], ['he', 'עברית']].forEach(function (l) {
        var b = UI.button(l[1], INDTV.I18n.lang() === l[0] ? 'check' : 'globe', function () { INDTV.I18n.setLang(l[0]); }, {
          cls: 'btn-choice' + (INDTV.I18n.lang() === l[0] ? ' is-on' : ''), key: 'lang:' + l[0]
        });
        if (l[0] === 'he') b.setAttribute('lang', 'he');
        langRow.appendChild(b);
      });
      s.appendChild(Settings.section(t('language'), langRow));

      // Display size
      var sizeRow = U.el('div', { class: 'set-row', 'data-fgroup': 'set-size' });
      [['m', 'sizeM'], ['l', 'sizeL'], ['xl', 'sizeXL']].forEach(function (z) {
        var on = INDTV.Display.get() === z[0];
        sizeRow.appendChild(UI.button(t(z[1]), on ? 'check' : null, function () {
          INDTV.Display.set(z[0]);
          Settings.build();
          INDTV.Focus.restore('size:' + z[0], Settings.el);
        }, { cls: 'btn-choice' + (on ? ' is-on' : ''), key: 'size:' + z[0] }));
      });
      s.appendChild(Settings.section(t('displaySize'), U.el('div', {}, [sizeRow, U.el('p', { class: 'set-status', text: t('displaySizeHint') })])));

      // Sources
      Settings.sourcesBox = U.el('div', { class: 'sources' });
      var head = U.el('div', { class: 'set-row', 'data-fgroup': 'set-src-actions' }, [
        UI.button(t('refreshAll'), 'refresh', function () {
          PR.refresh().then(function (r) {
            UI.toast(r.some(function (x) { return x.ok; }) ? t('refreshed') : t('refreshFailed'), r.some(function (x) { return x.ok; }) ? null : 'error');
          });
        }, { cls: 'btn-ghost', key: 'src:refreshall' }),
        UI.button(t('addUrl'), 'link', function () { Settings.openAdd('url'); }, { cls: 'btn-ghost', key: 'src:addurl' }),
        UI.button(t('addRaw'), 'paste', function () { Settings.openAdd('raw'); }, { cls: 'btn-ghost', key: 'src:addraw' }),
        UI.button(t('addFile'), 'file', function () { Settings.openAdd('file'); }, { cls: 'btn-ghost', key: 'src:addfile' })
      ]);
      Settings.addBox = U.el('div', { class: 'add-box' });
      s.appendChild(Settings.section(t('sources'), U.el('div', {}, [Settings.sourcesBox, head, Settings.addBox])));
      Settings.renderSources();
      Settings.renderAdd();

      // Programme guide (automatic + optional extra URL)
      var epg = INDTV.EpgRepository.state.get();
      var autoRow = U.el('div', { class: 'set-row', 'data-fgroup': 'set-epg-auto' }, [
        UI.button(t('on'), epg.auto ? 'check' : null, function () { INDTV.EpgRepository.setAuto(true); Settings.build(); INDTV.Focus.restore('epg:auto:on', Settings.el); }, { cls: 'btn-choice' + (epg.auto ? ' is-on' : ''), key: 'epg:auto:on' }),
        UI.button(t('off'), !epg.auto ? 'check' : null, function () { INDTV.EpgRepository.setAuto(false); Settings.build(); INDTV.Focus.restore('epg:auto:off', Settings.el); }, { cls: 'btn-choice' + (!epg.auto ? ' is-on' : ''), key: 'epg:auto:off' })
      ]);
      Settings.epgInput = U.el('input', { class: 'fx field', id: 'epg-url', type: 'url', placeholder: 'https://…/guide.xml.gz', value: epg.url || '', dataset: { key: 'epg:url' }, 'aria-label': t('epgCustom'), dir: 'ltr' });
      Settings.epgStatus = U.el('p', { class: 'set-status' });
      var epgRow = U.el('div', { class: 'set-form', 'data-fgroup': 'set-epg' }, [
        U.el('span', { class: 'field-label', text: t('epgAuto') }),
        autoRow,
        U.el('p', { class: 'set-status', text: t('epgAutoBody') }),
        U.el('label', { class: 'field-label', for: 'epg-url', text: t('epgCustom') }),
        Settings.epgInput,
        U.el('div', { class: 'set-row' }, [
          UI.button(t('save'), 'check', function () {
            INDTV.EpgRepository.setUrl(Settings.epgInput.value.trim()).catch(function () { UI.toast(t('invalidUrl'), 'error'); });
          }, { cls: 'btn-primary', key: 'epg:save' }),
          UI.button(t('refresh'), 'refresh', function () { INDTV.EpgRepository.refresh({ force: true }); }, { cls: 'btn-ghost', key: 'epg:refresh' })
        ]),
        Settings.epgStatus
      ]);
      s.appendChild(Settings.section(t('epgTitle'), epgRow));
      Settings.renderEpgStatus();

      // Live translation
      s.appendChild(Settings.section(t('liveTranslate'), Settings.translateForm()));

      // Data + about
      var clearBtn = UI.button(t('clearCache'), 'trash', function () {
        if (!Settings._confirmClear) {
          Settings._confirmClear = true;
          clearBtn.querySelector('.btn-label').textContent = t('clearCache') + ' — OK?';
          setTimeout(function () { Settings._confirmClear = false; if (clearBtn.isConnected) clearBtn.querySelector('.btn-label').textContent = t('clearCache'); }, 4000);
          return;
        }
        Settings._confirmClear = false;
        Settings.clearAll();
      }, { cls: 'btn-ghost btn-danger', key: 'data:clear' });
      s.appendChild(Settings.section(t('about'), U.el('div', {}, [
        U.el('p', { class: 'about-text', text: t('aboutBody') }),
        U.el('p', { class: 'about-text about-src', dir: 'ltr', text: INDTV.Config.BUILTIN_NAME + ': ' + INDTV.Config.BUILTIN_URL }),
        U.el('div', { class: 'set-row', 'data-fgroup': 'set-data' }, [clearBtn])
      ])));
    },

    section: function (title, body) {
      return U.el('section', { class: 'set-section', 'data-row': '' }, [U.el('h2', { class: 'set-title', text: title }), body]);
    },

    renderSources: function () {
      if (!Settings.sourcesBox) return;
      var activeKey = document.activeElement && Settings.sourcesBox.contains(document.activeElement) ? document.activeElement.getAttribute('data-key') : null;
      Settings.sourcesBox.innerHTML = '';
      SR.all().forEach(function (src) {
        var card = U.el('div', { class: 'src-card' + (src.enabled ? '' : ' is-off'), 'data-fgroup': 'src-' + src.id });
        var status = src.status === 'ok' ? t('statusOk') : src.status === 'error' ? t('statusError') : src.status === 'loading' ? t('statusLoading') : t('statusIdle');
        card.appendChild(U.el('div', { class: 'src-head' }, [
          U.el('span', { class: 'src-name', text: src.name }),
          U.el('span', { class: 'tag' + (src.type === 'builtin' ? ' tag-accent' : ''), text: src.type === 'builtin' ? t('builtIn') : t('userSource') }),
          U.el('span', { class: 'tag tag-muted', text: src.kind === 'vod' ? t('kindVod') : t('kindLive') }),
          U.el('span', { class: 'src-state st-' + (src.status || 'idle'), text: status })
        ]));
        var where = src.type === 'url' || src.type === 'builtin' ? U.redactUrl(src.url) : (src.type === 'file' ? t('addFile') : t('addRaw'));
        card.appendChild(U.el('p', { class: 'src-url', dir: 'ltr', text: where }));
        var facts = [
          t('lastRefresh') + ': ' + U.timeAgo(src.lastRefresh, INDTV.I18n.lang()),
          src.count ? src.count + ' ' + t('channels') : null
        ];
        if (src.stats) {
          facts.push('tvg-id ' + src.stats.withTvgId, 'tvg-name ' + src.stats.withTvgName, 'tvg-logo ' + src.stats.withLogo, 'group-title ' + src.stats.withGroup);
        }
        card.appendChild(U.el('p', { class: 'src-facts', dir: 'auto', text: facts.filter(Boolean).join('  ·  ') }));
        if (src.status === 'error') card.appendChild(U.el('p', { class: 'src-error', text: errText(src.error) + (src.count ? ' · ' + t('showingCached') : '') }));
        var actions = U.el('div', { class: 'set-row' }, [
          UI.button(src.enabled ? t('enabled') : t('disabled'), src.enabled ? 'check' : 'clear', function () { PR.setEnabled(src.id, !src.enabled); }, { cls: 'btn-choice' + (src.enabled ? ' is-on' : ''), key: 'src:' + src.id + ':toggle' }),
          UI.button(t('refresh'), 'refresh', function () {
            PR.refresh({ sourceId: src.id }).then(function () { UI.toast(t('refreshed')); }, function () { UI.toast(t('refreshFailed'), 'error'); });
          }, { cls: 'btn-ghost', key: 'src:' + src.id + ':refresh' }),
          src.type === 'builtin' ? null : UI.button(t('remove'), 'trash', function () {
            PR.removeSource(src.id).then(function () { UI.toast(t('removed')); });
          }, { cls: 'btn-ghost btn-danger', key: 'src:' + src.id + ':remove' })
        ]);
        card.appendChild(actions);
        Settings.sourcesBox.appendChild(card);
      });
      if (activeKey) INDTV.Focus.restore(activeKey, Settings.sourcesBox);
    },

    openAdd: function (mode) {
      Settings.addMode = Settings.addMode === mode ? null : mode;
      Settings.renderAdd();
      var f = Settings.addBox.querySelector('.fx');
      if (f) INDTV.Focus.focus(f);
    },

    renderAdd: function () {
      var box = Settings.addBox;
      box.innerHTML = '';
      var mode = Settings.addMode;
      if (!mode) return;
      var form = U.el('div', { class: 'set-form add-form', 'data-fgroup': 'set-add' });
      var nameIn = U.el('input', { class: 'fx field', id: 'add-name', type: 'text', maxlength: '60', placeholder: 'My playlist', dataset: { key: 'add:name' } });
      form.appendChild(U.el('label', { class: 'field-label', for: 'add-name', text: t('sourceName') }));
      form.appendChild(nameIn);
      var valueIn;
      if (mode === 'url') {
        valueIn = U.el('input', { class: 'fx field', id: 'add-url', type: 'url', placeholder: 'https://…/playlist.m3u', dir: 'ltr', dataset: { key: 'add:url' } });
        form.appendChild(U.el('label', { class: 'field-label', for: 'add-url', text: t('sourceUrl') }));
      } else if (mode === 'raw') {
        valueIn = U.el('textarea', { class: 'fx field field-area', id: 'add-raw', rows: '6', dir: 'ltr', placeholder: '#EXTM3U\n#EXTINF:-1 tvg-id="…" tvg-logo="…" group-title="…",Channel\nhttps://…', dataset: { key: 'add:raw' } });
        form.appendChild(U.el('label', { class: 'field-label', for: 'add-raw', text: t('addRaw') }));
      } else {
        valueIn = U.el('input', { class: 'fx field', id: 'add-file', type: 'file', accept: '.m3u,.m3u8,audio/x-mpegurl,application/vnd.apple.mpegurl,text/plain', dataset: { key: 'add:file' } });
        form.appendChild(U.el('label', { class: 'field-label', for: 'add-file', text: t('addFile') }));
      }
      form.appendChild(valueIn);
      var kindRow = U.el('div', { class: 'set-row' });
      [['live', 'kindLive'], ['vod', 'kindVod']].forEach(function (k) {
        kindRow.appendChild(UI.button(t(k[1]), Settings.addKind === k[0] ? 'check' : null, function () { Settings.addKind = k[0]; Settings.renderAdd(); INDTV.Focus.restore('add:kind:' + k[0], box); }, {
          cls: 'btn-choice' + (Settings.addKind === k[0] ? ' is-on' : ''), key: 'add:kind:' + k[0]
        }));
      });
      form.appendChild(U.el('span', { class: 'field-label', text: t('sourceKind') }));
      form.appendChild(kindRow);
      var msg = U.el('p', { class: 'set-status', 'aria-live': 'polite' });
      var submit = UI.button(t('add'), 'plus', function () {
        msg.textContent = t('statusLoading') + '…';
        var name = nameIn.value;
        var p;
        if (mode === 'url') p = PR.addSource({ type: 'url', url: valueIn.value.trim(), name: name, kind: Settings.addKind });
        else if (mode === 'raw') p = PR.addSource({ type: 'raw', raw: valueIn.value, name: name, kind: Settings.addKind });
        else {
          var file = valueIn.files && valueIn.files[0];
          if (!file) { msg.textContent = t('notM3u'); return; }
          if (file.size > 20 * 1024 * 1024) { msg.textContent = 'File too large'; return; }
          p = file.text().then(function (txt) { return PR.addSource({ type: 'file', raw: txt, name: name || file.name, kind: Settings.addKind }); });
        }
        p.then(function () {
          UI.toast(t('added'));
          Settings.addMode = null;
          Settings.renderAdd();
        }, function (e) { msg.textContent = errText(e && e.code); });
      }, { cls: 'btn-primary', key: 'add:submit' });
      form.appendChild(U.el('div', { class: 'set-row' }, [submit,
        UI.button(t('cancel'), null, function () { Settings.addMode = null; Settings.renderAdd(); INDTV.Focus.restore('src:add' + mode, Settings.el); }, { cls: 'btn-ghost', key: 'add:cancel' })]));
      form.appendChild(msg);
      box.appendChild(form);
    },

    renderEpgStatus: function () {
      if (!Settings.epgStatus) return;
      var st = INDTV.EpgRepository.state.get();
      var txt;
      if (!st.auto && !st.url) txt = t('epgNone');
      else if (st.status === 'loading') txt = t('statusLoading') + '…';
      else if (st.status === 'error') txt = t('statusError') + ': ' + (st.error === 'not_xmltv' ? 'XMLTV?' : errText(st.error));
      else if (st.status === 'ok') txt = st.matched + ' ' + t('epgMatched') + ' · ' + st.count + ' ' + t('epgLoaded') + ' · ' + t('lastRefresh') + ': ' + U.timeAgo(st.fetchedAt, INDTV.I18n.lang());
      else txt = t('statusIdle');
      Settings.epgStatus.textContent = t('epgStatus') + ': ' + txt;
    },

    translateForm: function () {
      var LT = INDTV.LiveTranslate;
      var cfg = LT.config();
      var box = U.el('div', { class: 'set-form', 'data-fgroup': 'set-tr' });
      box.appendChild(U.el('p', { class: 'set-status', text: t('translateHint') }));
      function rebuild(key) { var parent = box.parentNode; parent.replaceChild(Settings.translateForm(), box); if (key) INDTV.Focus.restore(key, Settings.el); }

      box.appendChild(U.el('span', { class: 'field-label', text: t('translateProvider') }));
      var provRow = U.el('div', { class: 'set-row' });
      [['groq', 'provGroq'], ['openai', 'provOpenai'], ['custom', 'provCustom']].forEach(function (pv) {
        var on = cfg.provider === pv[0];
        provRow.appendChild(UI.button(t(pv[1]), on ? 'check' : null, function () { LT.saveConfig({ provider: pv[0] }); rebuild('tr:prov:' + pv[0]); },
          { cls: 'btn-choice' + (on ? ' is-on' : ''), key: 'tr:prov:' + pv[0] }));
      });
      box.appendChild(provRow);

      var keyIn = U.el('input', { class: 'fx field', id: 'tr-key', type: 'password', autocomplete: 'off', spellcheck: 'false', dir: 'ltr',
        placeholder: cfg.provider === 'groq' ? 'gsk_…' : 'sk-…', value: cfg.key, dataset: { key: 'tr:key' } });
      box.appendChild(U.el('label', { class: 'field-label', for: 'tr-key', text: t('translateKey') }));
      box.appendChild(keyIn);

      box.appendChild(U.el('span', { class: 'field-label', text: t('translateTo') }));
      var tgRow = U.el('div', { class: 'set-row' });
      LT.TARGETS.forEach(function (tg) {
        var on = cfg.target === tg.code;
        var b = UI.button(tg.name, on ? 'check' : null, function () { LT.saveConfig({ target: tg.code }); rebuild('tr:tg:' + tg.code); },
          { cls: 'btn-choice' + (on ? ' is-on' : ''), key: 'tr:tg:' + tg.code });
        b.setAttribute('lang', tg.code);
        tgRow.appendChild(b);
      });
      box.appendChild(tgRow);

      var origRow = U.el('div', { class: 'set-row' }, [
        UI.button(t('translateShowOriginal') + ': ' + (cfg.showOriginal ? t('on') : t('off')), cfg.showOriginal ? 'check' : null, function () {
          LT.saveConfig({ showOriginal: !cfg.showOriginal }); rebuild('tr:orig');
        }, { cls: 'btn-choice' + (cfg.showOriginal ? ' is-on' : ''), key: 'tr:orig' })
      ]);
      box.appendChild(origRow);

      var adv = U.el('div', { class: 'set-form', hidden: cfg.provider !== 'custom' && !Settings._trAdvanced });
      var baseIn = U.el('input', { class: 'fx field', id: 'tr-base', type: 'url', dir: 'ltr', value: cfg.base, dataset: { key: 'tr:base' } });
      var sttIn = U.el('input', { class: 'fx field', id: 'tr-stt', type: 'text', dir: 'ltr', value: cfg.stt, dataset: { key: 'tr:stt' } });
      var llmIn = U.el('input', { class: 'fx field', id: 'tr-llm', type: 'text', dir: 'ltr', value: cfg.llm, dataset: { key: 'tr:llm' } });
      adv.appendChild(U.el('label', { class: 'field-label', for: 'tr-base', text: t('translateBase') }));
      adv.appendChild(baseIn);
      adv.appendChild(U.el('label', { class: 'field-label', for: 'tr-stt', text: INDTV.I18n.lang() === 'he' ? 'מודל זיהוי דיבור' : 'Speech-to-text model' }));
      adv.appendChild(sttIn);
      adv.appendChild(U.el('label', { class: 'field-label', for: 'tr-llm', text: INDTV.I18n.lang() === 'he' ? 'מודל תרגום' : 'Translation model' }));
      adv.appendChild(llmIn);

      var msg = U.el('p', { class: 'set-status', 'aria-live': 'polite' });
      box.appendChild(U.el('div', { class: 'set-row' }, [
        UI.button(t('save2'), 'check', function () {
          LT.saveConfig({ key: keyIn.value.trim(), base: baseIn.value.trim() || cfg.base, stt: sttIn.value.trim() || cfg.stt, llm: llmIn.value.trim() || cfg.llm });
          msg.textContent = t('statusLoading') + '…';
          LT.test().then(function (ok) { msg.textContent = ok ? t('translateOk') : t('translateFail'); });
        }, { cls: 'btn-primary', key: 'tr:save' }),
        UI.button(t('translateModels'), 'settings', function () { Settings._trAdvanced = !Settings._trAdvanced; adv.hidden = !adv.hidden; }, { cls: 'btn-ghost', key: 'tr:adv' })
      ]));
      box.appendChild(adv);
      box.appendChild(msg);
      return box;
    },

    clearAll: function () {
      var keys = ['favorites', 'recent', 'health', 'epg:meta', 'epg:data', 'epg:guide', 'epg:settings', 'shows', 'vod:progress'];
      SR.all().forEach(function (s) { keys.push('entries:' + s.id, 'raw:' + s.id); });
      keys.push('sources');
      Promise.all(keys.map(function (k) { return INDTV.Store.del(k); })).then(function () {
        UI.toast(t('cacheCleared'));
        setTimeout(function () { root.location.reload(); }, 700);
      });
    }
  };

  INDTV.SettingsScreen = Settings;
})(typeof window !== 'undefined' ? window : globalThis);
