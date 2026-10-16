/* INDTV — splash: the lamp switches on and the wordmark comes up out of the dark. */
(function (root) {
  'use strict';
  var INDTV = root.INDTV = root.INDTV || {};
  var U = INDTV.Util;

  INDTV.Splash = {
    show: function (durationMs) {
      var el = document.getElementById('splash');
      el.innerHTML = '';
      el.hidden = false;
      el.appendChild(U.el('div', { class: 'splash-beam', 'aria-hidden': 'true' }));
      el.appendChild(U.el('div', { class: 'splash-center' }, [
        U.el('div', { class: 'splash-word', html: INDTV.wordmark('wm-hero') }),
        U.el('div', { class: 'splash-tag', text: INDTV.I18n.t('splashTag') })
      ]));
      return new Promise(function (resolve) {
        setTimeout(function () {
          el.classList.add('is-leaving');
          setTimeout(function () { el.hidden = true; el.innerHTML = ''; el.classList.remove('is-leaving'); resolve(); }, 360);
        }, durationMs || 900);
      });
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
