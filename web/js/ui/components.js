/* INDTV — shared UI components. Every channel image comes from Channel.logoUrl (the parsed tvg-logo). */
(function (root) {
  'use strict';
  var INDTV = root.INDTV = root.INDTV || {};
  var U = INDTV.Util, t = function (k) { return INDTV.I18n.t(k); };

  function monogram(name) {
    var words = String(name || '').replace(U.NON_ALNUM, ' ').trim().split(/\s+/).filter(Boolean);
    if (!words.length) return 'TV';
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0].charAt(0) + words[1].charAt(0)).toUpperCase();
  }

  /**
   * Channel logo with INDTV fallback. The fallback appears only when logoUrl is missing,
   * invalid or fails to load. It never imitates a broadcaster logo.
   */
  function logo(channelLike, opts) {
    opts = opts || {};
    var url = channelLike ? (channelLike.logoUrl || channelLike.poster || null) : null;
    var name = channelLike ? (channelLike.name || channelLike.title || '') : '';
    var wrap = U.el('span', { class: 'logo' + (opts.cls ? ' ' + opts.cls : '') });
    var fb = U.el('span', { class: 'logo-fb' + (opts.showName === false ? ' no-name' : ''), 'aria-hidden': 'true' }, [
      U.el('span', { class: 'logo-fb-mono', text: monogram(name) }),
      opts.showName === false ? null : U.el('span', { class: 'logo-fb-name', text: name })
    ]);
    if (url) {
      var img = U.el('img', {
        class: 'logo-img', alt: name, src: url, loading: opts.eager ? 'eager' : 'lazy', decoding: 'async',
        referrerpolicy: 'no-referrer', draggable: 'false'
      });
      img.addEventListener('error', function () { wrap.classList.add('is-failed'); });
      img.addEventListener('load', function () { wrap.classList.add('is-loaded'); });
      wrap.appendChild(img);
      wrap.appendChild(fb);
      wrap.setAttribute('data-logo-url', url);
    } else {
      wrap.classList.add('is-failed');
      wrap.appendChild(fb);
    }
    return wrap;
  }

  function liveBadge(extraCls) {
    return U.el('span', { class: 'badge-live' + (extraCls ? ' ' + extraCls : ''), text: t('liveBadge') });
  }

  /** Popular-style channel card: logo over a soft glow made from the same real logo. */
  function channelCard(ch, ctx, opts) {
    opts = opts || {};
    var card = U.el('button', {
      class: 'fx card card-ch' + (opts.variant ? ' card-' + opts.variant : ''), type: 'button',
      dataset: { key: (opts.keyPrefix || 'c') + ':' + ch.id, channelId: ch.id },
      'aria-label': ch.name + (ch.groupName ? ', ' + ch.groupName : '')
    });
    if (opts.glow === true && ch.logoUrl) {
      card.appendChild(U.el('span', { class: 'card-glow', 'aria-hidden': 'true', style: 'background-image:url("' + encodeURI(ch.logoUrl).replace(/"/g, '%22') + '")' }));
    }
    card.appendChild(logo(ch, { cls: 'card-logo', showName: true }));
    card.appendChild(liveBadge());
    if (opts.showName) {
      card.appendChild(U.el('span', { class: 'card-meta' }, [
        U.el('span', { class: 'card-name', text: ch.name }),
        ch.groupName ? U.el('span', { class: 'card-group', text: ch.groupName }) : null
      ]));
    }
    if (INDTV.FavoritesRepository.has(ch.id)) card.appendChild(U.el('span', { class: 'card-fav', html: INDTV.icon('heartFill') }));
    if (opts.variant === 'pop' || opts.variant === 'grid' || opts.variant === 'std') {
      var nl = nowLine(ch);
      if (nl) { card.appendChild(nl); card.classList.add('has-now'); }
    }
    card.addEventListener('click', function () {
      INDTV.Router.openPlayer({ kind: 'channel', id: ch.id }, { list: ctx || [ch.id] });
    });
    return card;
  }

  /** Horizontal rail. items rendered lazily in batches so long rails stay light. */
  function rail(opts) {
    var section = U.el('section', { class: 'rail' + (opts.cls ? ' ' + opts.cls : ''), 'data-row': '', 'aria-label': opts.title });
    var head = U.el('div', { class: 'rail-head' }, [
      U.el('h2', { class: 'rail-title', text: opts.title }),
      opts.meta ? U.el('span', { class: 'rail-meta', text: opts.meta }) : null
    ]);
    var track = U.el('div', { class: 'rail-track', 'data-fgroup': opts.group || ('rail-' + U.hash(opts.title)), 'data-fmemory': '' });
    section.appendChild(head);
    section.appendChild(track);
    var items = opts.items || [];
    var batch = opts.batch || 12, rendered = 0;
    function renderMore() {
      var end = Math.min(items.length, rendered + batch);
      var frag = document.createDocumentFragment();
      for (var i = rendered; i < end; i++) frag.appendChild(opts.render(items[i], i));
      track.appendChild(frag);
      rendered = end;
    }
    renderMore();
    if (items.length > rendered) {
      track.addEventListener('focusin', function (e) {
        var kids = track.children;
        var idx = Array.prototype.indexOf.call(kids, e.target);
        if (idx >= rendered - 5 && rendered < items.length) renderMore();
      });
    }
    return section;
  }

  function emptyState(o) {
    return U.el('div', { class: 'empty' + (o.cls ? ' ' + o.cls : '') }, [
      U.el('span', { class: 'empty-icon', html: INDTV.icon(o.icon || 'alert') }),
      U.el('h3', { class: 'empty-title', text: o.title }),
      o.body ? U.el('p', { class: 'empty-body', text: o.body }) : null,
      o.actions && o.actions.length ? U.el('div', { class: 'empty-actions' }, o.actions) : null
    ]);
  }

  function button(label, iconName, onClick, opts) {
    opts = opts || {};
    var b = U.el('button', {
      class: 'fx btn' + (opts.cls ? ' ' + opts.cls : ''), type: 'button',
      dataset: opts.key ? { key: opts.key } : undefined, 'aria-label': opts.aria || label
    });
    b.innerHTML = (iconName ? INDTV.icon(iconName) : '') + '<span class="btn-label">' + U.escapeHtml(label) + '</span>';
    if (onClick) b.addEventListener('click', onClick);
    return b;
  }

  var toastTimer = null;
  function toast(msg, kind) {
    var el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.className = 'toast is-on' + (kind ? ' toast-' + kind : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.className = 'toast'; }, 2600);
  }

  /** Cinematic light trails (decorative, CSS-animated). */
  function trails(count, cls) {
    var wrap = U.el('div', { class: 'trails' + (cls ? ' ' + cls : ''), 'aria-hidden': 'true' });
    for (var i = 0; i < count; i++) {
      wrap.appendChild(U.el('span', { class: 'trail trail-' + (i % 6), style: '--i:' + i }));
    }
    return wrap;
  }

  /** "My Shows" card: the show title with where/when it is on, from the programme guide. */
  function showCard(fav, opts) {
    opts = opts || {};
    var st = INDTV.ShowFavorites.status(fav);
    var ch = st ? st.channel : (fav.channelId ? INDTV.ChannelRepository.get(fav.channelId) : null);
    var lang = INDTV.I18n.lang();
    var line;
    if (st && st.live) line = t('airingNow') + ' · ' + st.channel.name;
    else if (st) line = t('airsAt') + ' ' + U.formatTime(st.programme.start, lang) + ' · ' + st.channel.name;
    else line = t('notInGuide');
    var card = U.el('button', {
      class: 'fx card card-wide card-show' + (st && st.live ? ' is-live' : ''), type: 'button',
      dataset: { key: (opts.keyPrefix || 'show') + ':' + fav.key }, 'aria-label': fav.title + ', ' + line
    });
    card.appendChild(U.el('span', { class: 'wide-logo' }, [ch ? logo(ch, { showName: false }) : U.el('span', { class: 'show-star', html: INDTV.icon('kids') })]));
    var info = U.el('span', { class: 'wide-info' }, [
      U.el('span', { class: 'wide-top' }, [st && st.live ? liveBadge() : U.el('span', { class: 'tag tag-accent', text: '★' })]),
      U.el('span', { class: 'wide-name', text: fav.title }),
      U.el('span', { class: 'wide-prog', text: line })
    ]);
    if (st && st.live) {
      var pr = (Date.now() - st.programme.start) / (st.programme.stop - st.programme.start);
      info.appendChild(U.el('span', { class: 'progress' }, [U.el('span', { class: 'progress-fill', style: 'width:' + Math.round(pr * 100) + '%' })]));
    }
    card.appendChild(info);
    card.addEventListener('click', function () {
      var target = st ? st.channel : ch;
      if (target) INDTV.Router.openPlayer({ kind: 'channel', id: target.id }, { list: [target.id] });
      else toast(t('notInGuide'));
    });
    return card;
  }

  /** Small "what's on now" line under a channel card when the guide knows it. */
  function nowLine(ch) {
    var e = INDTV.EpgRepository.nowNext(ch);
    if (!e || !e.now) return null;
    return U.el('span', { class: 'card-now' }, [
      U.el('span', { class: 'card-now-title', text: e.now.title }),
      U.el('span', { class: 'card-now-bar' }, [U.el('span', { style: 'width:' + Math.round(e.progress * 100) + '%' })])
    ]);
  }

  /** Subtitle look from Settings → Live translation (size, background, colour, position). */
  function applySubStyle(el) {
    var c = INDTV.LiveTranslate.config();
    el.setAttribute('data-size', c.subSize);
    el.setAttribute('data-bg', c.subBg);
    el.setAttribute('data-color', c.subColor);
    el.setAttribute('data-pos', c.subPos);
  }

  INDTV.UI = {
    logo: logo, liveBadge: liveBadge, channelCard: channelCard, rail: rail, emptyState: emptyState,
    button: button, toast: toast, trails: trails, monogram: monogram, showCard: showCard, nowLine: nowLine, applySubStyle: applySubStyle
  };
})(typeof window !== 'undefined' ? window : globalThis);
