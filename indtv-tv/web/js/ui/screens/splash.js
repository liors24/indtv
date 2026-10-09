/* INDTV — cinematic splash. Uses cached real logos only; never waits on the network. */
(function (root) {
  'use strict';
  var INDTV = root.INDTV = root.INDTV || {};
  var U = INDTV.Util, UI = INDTV.UI;

  // Card slots: position (vw/vh), depth layer and tilt. Depth drives parallax speed and blur.
  var SLOTS = [
    { x: 9, y: 18, d: 3, r: -6 }, { x: 22, y: 64, d: 2, r: 4 }, { x: 6, y: 72, d: 1, r: -3 }, { x: 28, y: 12, d: 1, r: 3 },
    { x: 72, y: 14, d: 2, r: 5 }, { x: 84, y: 58, d: 3, r: -5 }, { x: 66, y: 72, d: 1, r: 3 }, { x: 90, y: 26, d: 1, r: -2 }
  ];

  INDTV.Splash = {
    show: function (durationMs) {
      var el = document.getElementById('splash');
      el.innerHTML = '';
      el.hidden = false;
      el.appendChild(UI.trails(10, 'trails-splash'));
      var cards = U.el('div', { class: 'splash-cards', 'aria-hidden': 'true' });
      var logos = INDTV.ChannelRepository.all().filter(function (c) { return c.logoUrl; });
      var picks = INDTV.popularChannels(16).filter(function (c) { return c.logoUrl; });
      if (picks.length < SLOTS.length) picks = picks.concat(logos.slice(0, SLOTS.length - picks.length));
      picks.slice(0, SLOTS.length).forEach(function (ch, i) {
        var s = SLOTS[i];
        var card = U.el('span', {
          class: 'splash-card depth-' + s.d,
          style: 'left:' + s.x + '%;top:' + s.y + '%;--r:' + s.r + 'deg;--delay:' + (i * 90) + 'ms'
        }, [UI.logo(ch, { showName: false, eager: true })]);
        cards.appendChild(card);
      });
      el.appendChild(cards);
      el.appendChild(U.el('div', { class: 'splash-center' }, [
        U.el('div', { class: 'splash-word', html: INDTV.wordmark('wm-hero') }),
        U.el('div', { class: 'splash-tag', text: 'INDIAN ENTERTAINMENT' })
      ]));
      return new Promise(function (resolve) {
        setTimeout(function () {
          el.classList.add('is-leaving');
          setTimeout(function () { el.hidden = true; el.innerHTML = ''; el.classList.remove('is-leaving'); resolve(); }, 420);
        }, durationMs || 1700);
      });
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
