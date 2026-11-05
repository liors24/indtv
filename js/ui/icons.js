/* INDTV — vector icon set (drawn for INDTV, 24×24 grid, stroke-based). */
(function (root) {
  'use strict';
  var INDTV = root.INDTV = root.INDTV || {};

  var S = 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
  var ICONS = {
    aspect: '<rect ' + S + ' x="2.5" y="5" width="19" height="14" rx="2"/><path ' + S + ' d="M6 9.5V8h2.5M18 14.5V16h-2.5M15.5 8H18v1.5M8.5 16H6v-1.5"/>',
    quality: '<rect ' + S + ' x="2.5" y="5" width="19" height="14" rx="2"/><path ' + S + ' d="M6.5 9.5v5M6.5 12h3.2M9.7 9.5v5M13 9.5h2.3a2.5 2.5 0 0 1 0 5H13z"/>',
    home: '<path ' + S + ' d="M3.5 10.2 12 3.5l8.5 6.7V19a1.5 1.5 0 0 1-1.5 1.5h-4.2v-6h-5.6v6H5A1.5 1.5 0 0 1 3.5 19z"/>',
    live: '<rect ' + S + ' x="2.5" y="6.5" width="19" height="13" rx="2.2"/><path ' + S + ' d="M8 2.8 12 6.4l4-3.6"/><circle cx="7" cy="13" r="1.6" fill="currentColor"/>',
    movies: '<rect ' + S + ' x="3" y="3.5" width="18" height="17" rx="2.2"/><path ' + S + ' d="M7.5 3.5v17M16.5 3.5v17M3 8.2h4.5M3 12h4.5M3 15.8h4.5M16.5 8.2H21M16.5 12H21M16.5 15.8H21"/>',
    shows: '<rect ' + S + ' x="3" y="7" width="18" height="13" rx="2.2"/><path ' + S + ' d="M6.5 3.8h11M10.5 11v5.5l4.5-2.75z"/>',
    kids: '<path ' + S + ' d="M12 3.2l2.5 5.2 5.7.8-4.1 4 1 5.6L12 16.1l-5.1 2.7 1-5.6-4.1-4 5.7-.8z"/>',
    news: '<rect ' + S + ' x="3" y="4.5" width="14" height="15.5" rx="1.6"/><path ' + S + ' d="M17 8.5h2.5a1.5 1.5 0 0 1 1.5 1.5v8a2 2 0 0 1-4 0M6.5 8.5h7M6.5 12h7M6.5 15.5h4.5"/>',
    heart: '<path ' + S + ' d="M12 20s-7.2-4.3-9.1-8.7C1.6 8.2 3.6 4.8 7 4.8c2.1 0 3.4 1.2 5 3.1 1.6-1.9 2.9-3.1 5-3.1 3.4 0 5.4 3.4 4.1 6.5C19.2 15.7 12 20 12 20z"/>',
    heartFill: '<path fill="currentColor" d="M12 20s-7.2-4.3-9.1-8.7C1.6 8.2 3.6 4.8 7 4.8c2.1 0 3.4 1.2 5 3.1 1.6-1.9 2.9-3.1 5-3.1 3.4 0 5.4 3.4 4.1 6.5C19.2 15.7 12 20 12 20z"/>',
    settings: '<path ' + S + ' d="M4 6.5h9M17.5 6.5H20M4 12h3.5M11.5 12H20M4 17.5h11M19 17.5h1"/><circle ' + S + ' cx="15.2" cy="6.5" r="2.2"/><circle ' + S + ' cx="9.5" cy="12" r="2.2"/><circle ' + S + ' cx="17" cy="17.5" r="2.2"/>',
    search: '<circle ' + S + ' cx="10.8" cy="10.8" r="6.6"/><path ' + S + ' d="m20.2 20.2-4.6-4.6"/>',
    user: '<circle ' + S + ' cx="12" cy="8.3" r="3.8"/><path ' + S + ' d="M4.5 20.2c1.4-3.7 4.3-5.6 7.5-5.6s6.1 1.9 7.5 5.6"/>',
    play: '<path fill="currentColor" d="M8.2 4.9c0-.9 1-1.4 1.7-.9l9.8 6.6c.7.5.7 1.5 0 1.9l-9.8 6.7c-.7.5-1.7 0-1.7-.9z"/>',
    pause: '<rect x="6.3" y="4.5" width="4" height="15" rx="1.1" fill="currentColor"/><rect x="13.7" y="4.5" width="4" height="15" rx="1.1" fill="currentColor"/>',
    rewind10: '<path ' + S + ' d="M4.6 13a7.6 7.6 0 1 0 2.3-5.6"/><path ' + S + ' d="M4.4 3.9v4h4"/><text x="12.4" y="15.6" text-anchor="middle" font-size="6.6" font-weight="700" fill="currentColor" font-family="Arial, sans-serif">10</text>',
    forward10: '<path ' + S + ' d="M19.4 13a7.6 7.6 0 1 1-2.3-5.6"/><path ' + S + ' d="M19.6 3.9v4h-4"/><text x="11.6" y="15.6" text-anchor="middle" font-size="6.6" font-weight="700" fill="currentColor" font-family="Arial, sans-serif">10</text>',
    prev: '<path ' + S + ' d="M6 5v14"/><path fill="currentColor" d="M18.6 5.6c0-.8-.9-1.3-1.6-.8l-8.3 6.4c-.5.4-.5 1.2 0 1.6l8.3 6.4c.7.5 1.6 0 1.6-.8z"/>',
    next: '<path ' + S + ' d="M18 5v14"/><path fill="currentColor" d="M5.4 5.6c0-.8.9-1.3 1.6-.8l8.3 6.4c.5.4.5 1.2 0 1.6L7 19.2c-.7.5-1.6 0-1.6-.8z"/>',
    volume: '<path ' + S + ' d="M4 9.2h3.6L12.5 5v14l-4.9-4.2H4z"/><path ' + S + ' d="M16 8.8a4.6 4.6 0 0 1 0 6.4M18.6 6.2a8.3 8.3 0 0 1 0 11.6"/>',
    mute: '<path ' + S + ' d="M4 9.2h3.6L12.5 5v14l-4.9-4.2H4z"/><path ' + S + ' d="m16.5 9.5 5 5M21.5 9.5l-5 5"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/>',
    fullscreen: '<path ' + S + ' d="M4 9V4.5A.5.5 0 0 1 4.5 4H9M20 9V4.5a.5.5 0 0 0-.5-.5H15M4 15v4.5a.5.5 0 0 0 .5.5H9M20 15v4.5a.5.5 0 0 1-.5.5H15"/>',
    back: '<path ' + S + ' d="M19.5 12h-15M10.5 6l-6 6 6 6"/>',
    refresh: '<path ' + S + ' d="M19.8 11.2a7.9 7.9 0 1 0-2.2 6.1"/><path ' + S + ' d="M20 4.2v7h-7"/>',
    plus: '<path ' + S + ' d="M12 5v14M5 12h14"/>',
    trash: '<path ' + S + ' d="M4.5 7h15M9.5 7V4.8h5V7M6.5 7l.9 12.2a1.5 1.5 0 0 0 1.5 1.3h6.2a1.5 1.5 0 0 0 1.5-1.3L17.5 7"/>',
    check: '<path ' + S + ' d="m5 12.5 4.5 4.5L19 7.5"/>',
    globe: '<circle ' + S + ' cx="12" cy="12" r="8.5"/><path ' + S + ' d="M3.5 12h17M12 3.5c2.4 2.4 3.6 5.2 3.6 8.5s-1.2 6.1-3.6 8.5c-2.4-2.4-3.6-5.2-3.6-8.5S9.6 5.9 12 3.5z"/>',
    link: '<path ' + S + ' d="M10 14a4 4 0 0 0 5.7 0l3.2-3.2a4 4 0 0 0-5.7-5.7l-1.1 1.1"/><path ' + S + ' d="M14 10a4 4 0 0 0-5.7 0l-3.2 3.2a4 4 0 0 0 5.7 5.7l1.1-1.1"/>',
    paste: '<rect ' + S + ' x="5" y="4.5" width="14" height="16" rx="2"/><path ' + S + ' d="M9 4.5V3.5h6v1M8.5 10h7M8.5 13.5h7M8.5 17h4"/>',
    file: '<path ' + S + ' d="M14 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8z"/><path ' + S + ' d="M14 3.5V8h4.5"/>',
    guide: '<rect ' + S + ' x="3" y="4.5" width="18" height="15" rx="2"/><path ' + S + ' d="M3 9h18M8.5 9v10.5M12 13h6M12 16.5h4"/>',
    offline: '<path ' + S + ' d="M3.5 3.5l17 17M8.5 16.2a5 5 0 0 1 7 0M5.4 12.8a9.5 9.5 0 0 1 4-2.2M18.6 12.8a9.6 9.6 0 0 0-2-1.4M2.4 9.5a14 14 0 0 1 3.3-2.3M21.6 9.5a14 14 0 0 0-8.4-3.9"/><circle cx="12" cy="19.4" r="1.1" fill="currentColor"/>',
    alert: '<path ' + S + ' d="M12 4 21 19.5H3z"/><path ' + S + ' d="M12 10v4.2"/><circle cx="12" cy="17" r="1.1" fill="currentColor"/>',
    signal: '<path ' + S + ' d="M5.6 18.4a9 9 0 0 1 0-12.8M18.4 5.6a9 9 0 0 1 0 12.8M8.5 15.5a5 5 0 0 1 0-7M15.5 8.5a5 5 0 0 1 0 7"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/>',
    chevron: '<path ' + S + ' d="m9 5.5 6.5 6.5L9 18.5"/>',
    del: '<path ' + S + ' d="M9 5.5h10.5A1.5 1.5 0 0 1 21 7v10a1.5 1.5 0 0 1-1.5 1.5H9L3 12z"/><path ' + S + ' d="m11.5 9.5 5 5M16.5 9.5l-5 5"/>',
    space: '<path ' + S + ' d="M4 10v4.5h16V10"/>',
    translate: '<path ' + S + ' d="M3.5 5.5h9M8 3.5v2M10.5 5.5c-.8 3.6-3.3 6.4-6.5 7.8M6 8.5c1 1.9 2.6 3.4 4.6 4.3"/><path ' + S + ' d="m12.5 20.5 4-9.5 4 9.5M14 17h5"/>',
    record: '<circle ' + S + ' cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.6" fill="currentColor"/>',
    startOver: '<path ' + S + ' d="M4.6 13a7.6 7.6 0 1 0 2.3-5.6"/><path ' + S + ' d="M4.4 3.9v4h4"/><path fill="currentColor" d="M10.3 9.3v5.4l4.5-2.7z"/>',
    goLive: '<path ' + S + ' d="M5.2 5.2 13.6 12 5.2 18.8z"/><path ' + S + ' d="M18.5 5v14"/>',
    recordings: '<rect ' + S + ' x="3" y="5.5" width="18" height="13" rx="2.2"/><circle cx="8.6" cy="12" r="2.4" fill="currentColor"/><path ' + S + ' d="M13.5 10h4.5M13.5 14h3"/>',
    clear: '<circle ' + S + ' cx="12" cy="12" r="8.5"/><path ' + S + ' d="m9 9 6 6M15 9l-6 6"/>'
  };

  INDTV.icon = function (name, cls) {
    var body = ICONS[name] || ICONS.alert;
    return '<svg class="ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + body + '</svg>';
  };

  /** Brand mark: a lamp broadcasting into the room (with an on-air dot), paired with the INDTV wordmark. */
  INDTV.wordmark = function (cls) {
    return '<span class="wordmark' + (cls ? ' ' + cls : '') + '" dir="ltr" aria-label="INDTV">' +
      '<svg class="wm-mark" viewBox="0 0 24 24" aria-hidden="true"><circle cx="4.6" cy="12.6" r="2.5" fill="currentColor"/><path d="M9.05 8.00A6.4 6.4 0 0 1 9.05 17.20" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"/><path d="M12.38 4.54A11.2 11.2 0 0 1 12.38 20.66" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity=".55"/><circle class="wm-live" cx="19.6" cy="3.9" r="2" fill="#ff4d5e"/></svg>' +
      '<span class="wm-ind">IND</span><span class="wm-tv">TV</span></span>';
  };
})(typeof window !== 'undefined' ? window : globalThis);
