/* INDTV — English / Hebrew strings. Channel names are never translated. */
(function (root) {
  'use strict';
  var INDTV = root.INDTV = root.INDTV || {};

  var STRINGS = {
    en: {
      home: 'Home', live: 'Live TV', movies: 'Movies', shows: 'TV Shows', kids: 'Kids', news: 'News',
      favorites: 'Favorites', settings: 'Settings', search: 'Search', profile: 'Profile',
      popularChannels: 'Popular Channels', liveNow: 'Live Now', recentlyWatched: 'Recently Watched',
      recommended: 'Recommended', watchLive: 'Watch Live', sources: 'Sources', refresh: 'Refresh',
      liveBadge: 'LIVE', indianEntertainment: 'INDIAN ENTERTAINMENT',
      allChannels: 'All channels', channels: 'channels', channel: 'channel',
      nowPlaying: 'Now', upNext: 'Next', noGuide: 'No programme guide for this channel',
      liveBroadcast: 'Live broadcast', streamSources: 'stream sources', streamSource: 'stream source',
      addFavorite: 'Add to Favorites', removeFavorite: 'Remove from Favorites',
      emptyFavoritesTitle: 'No favorites yet',
      emptyFavoritesBody: 'Open Live TV, highlight a channel and choose Add to Favorites. It will appear here and on Home.',
      emptyRecentTitle: 'Nothing watched yet',
      moviesSoonTitle: 'Movies are coming to INDTV',
      moviesSoonBody: 'No movie library is connected yet. Add a VOD playlist you are licensed to use under Settings → Sources and it will appear here.',
      showsSoonTitle: 'TV Shows are coming to INDTV',
      showsSoonBody: 'No series library is connected yet. Add a VOD playlist under Settings → Sources to browse shows, seasons and episodes.',
      openSources: 'Open Sources',
      continueWatching: 'Continue Watching',
      searchPlaceholder: 'Search channels and categories',
      searchHint: 'Type with the on-screen keyboard or your remote keyboard.',
      noResults: 'No channels match',
      results: 'results',
      space: 'Space', del: 'Delete', clear: 'Clear',
      // states
      loadingCatalog: 'Loading channels…', refreshing: 'Refreshing channels…',
      playlistUnavailable: 'Playlist unavailable', noConnection: 'No connection',
      showingCached: 'Showing saved channels. We will try again soon.',
      emptyCatalogTitle: 'No channels yet',
      emptyCatalogBody: 'INDTV could not load the built-in playlist. Check the internet connection, then press Refresh.',
      tryAgain: 'Try again',
      streamUnavailable: 'Stream unavailable',
      allSourcesFailed: 'All stream sources failed',
      allSourcesFailedBody: 'This channel did not respond on any of its sources. Public streams go offline from time to time. Try another channel or come back later.',
      insecureBlocked: 'Some sources use plain http and the browser blocks them on a secure (https) page.',
      geoNote: 'This channel is marked geo-blocked by the playlist and may not play in your region.',
      notAlways: 'Not 24/7',
      tryingSource: 'Connecting to source',
      of: 'of',
      buffering: 'Buffering…',
      // player
      rewind: 'Back 10 seconds', forward: 'Forward 10 seconds', prevChannel: 'Previous channel',
      nextChannel: 'Next channel', play: 'Play', pause: 'Pause', mute: 'Mute', unmute: 'Unmute',
      stop: 'Stop', fullscreen: 'Full screen', back: 'Back', stopped: 'Playback stopped',
      pressBackAgain: 'Press Back again to leave INDTV',
      // settings
      language: 'Language', english: 'English', hebrew: 'עברית',
      builtIn: 'Built-in', userSource: 'Your source', enabled: 'On', disabled: 'Off',
      lastRefresh: 'Last refresh', status: 'Status', statusOk: 'Loaded', statusError: 'Error',
      statusIdle: 'Waiting', statusLoading: 'Loading', remove: 'Remove',
      addUrl: 'Add playlist URL', addRaw: 'Paste playlist text', addFile: 'Load file from this device',
      sourceName: 'Name', sourceUrl: 'Playlist URL (.m3u)', sourceKind: 'Content',
      kindLive: 'Live channels', kindVod: 'Movies & shows (VOD)',
      add: 'Add source', cancel: 'Cancel', save: 'Save',
      epgTitle: 'Programme guide (XMLTV)', epgUrl: 'XMLTV URL (.xml or .xml.gz)', epgStatus: 'Guide',
      epgNone: 'No guide configured', epgLoaded: 'programmes loaded',
      refreshAll: 'Refresh all sources', clearCache: 'Clear saved data',
      cacheCleared: 'Saved data cleared',
      about: 'About INDTV',
      aboutBody: 'INDTV plays public channels listed by the India playlist of the open iptv-org project and sources you add yourself. It does not host streams and does not bypass DRM, paywalls, geo-blocking or sign-in.',
      added: 'Source added', invalidUrl: 'Enter a full http(s) address to a .m3u playlist',
      hlsNotPlaylist: 'That address is a single video stream (.m3u8), not a channel list. Add the .m3u playlist that lists channels.',
      notM3u: 'That file is not an M3U playlist. It must start with #EXTM3U.',
      removed: 'Source removed', refreshed: 'Channels refreshed', refreshFailed: 'Refresh failed',
      favAdded: 'Added to Favorites', favRemoved: 'Removed from Favorites',
      categories: 'Categories', details: 'Channel details', quality: 'Quality'
    },
    he: {
      home: 'דף הבית', live: 'שידור חי', movies: 'סרטים', shows: 'תוכניות', kids: 'ילדים', news: 'חדשות',
      favorites: 'מועדפים', settings: 'הגדרות', search: 'חיפוש', profile: 'פרופיל',
      popularChannels: 'ערוצים פופולריים', liveNow: 'משודר עכשיו', recentlyWatched: 'נצפה לאחרונה',
      recommended: 'מומלצים', watchLive: 'צפה בשידור חי', sources: 'מקורות', refresh: 'רענון',
      liveBadge: 'LIVE', indianEntertainment: 'INDIAN ENTERTAINMENT',
      allChannels: 'כל הערוצים', channels: 'ערוצים', channel: 'ערוץ',
      nowPlaying: 'עכשיו', upNext: 'הבא', noGuide: 'אין לוח שידורים לערוץ הזה',
      liveBroadcast: 'שידור חי', streamSources: 'מקורות שידור', streamSource: 'מקור שידור',
      addFavorite: 'הוסף למועדפים', removeFavorite: 'הסר מהמועדפים',
      emptyFavoritesTitle: 'עדיין אין מועדפים',
      emptyFavoritesBody: 'פתחו את שידור חי, סמנו ערוץ ובחרו "הוסף למועדפים". הוא יופיע כאן ובדף הבית.',
      emptyRecentTitle: 'עוד לא צפית בכלום',
      moviesSoonTitle: 'סרטים מגיעים ל-INDTV',
      moviesSoonBody: 'עדיין לא חוברה ספריית סרטים. הוסיפו רשימת VOD שיש לכם רשות להשתמש בה בהגדרות ← מקורות והיא תופיע כאן.',
      showsSoonTitle: 'תוכניות מגיעות ל-INDTV',
      showsSoonBody: 'עדיין לא חוברה ספריית סדרות. הוסיפו רשימת VOD בהגדרות ← מקורות כדי לדפדף בתוכניות, עונות ופרקים.',
      openSources: 'פתח מקורות',
      continueWatching: 'המשך צפייה',
      searchPlaceholder: 'חיפוש ערוצים וקטגוריות',
      searchHint: 'הקלידו במקלדת שעל המסך או במקלדת של השלט.',
      noResults: 'לא נמצאו ערוצים עבור',
      results: 'תוצאות',
      space: 'רווח', del: 'מחק', clear: 'נקה',
      loadingCatalog: 'טוען ערוצים…', refreshing: 'מרענן ערוצים…',
      playlistUnavailable: 'רשימת הערוצים לא זמינה', noConnection: 'אין חיבור לאינטרנט',
      showingCached: 'מוצגים הערוצים השמורים. ננסה שוב בקרוב.',
      emptyCatalogTitle: 'עדיין אין ערוצים',
      emptyCatalogBody: 'INDTV לא הצליח לטעון את רשימת הערוצים המובנית. בדקו את החיבור לאינטרנט ולחצו רענון.',
      tryAgain: 'נסה שוב',
      streamUnavailable: 'השידור לא זמין',
      allSourcesFailed: 'כל מקורות השידור נכשלו',
      allSourcesFailedBody: 'הערוץ לא הגיב באף אחד מהמקורות שלו. שידורים ציבוריים יורדים מדי פעם. נסו ערוץ אחר או חזרו מאוחר יותר.',
      insecureBlocked: 'חלק מהמקורות משתמשים ב-http רגיל והדפדפן חוסם אותם בדף מאובטח (https).',
      geoNote: 'הערוץ מסומן ברשימה כחסום גאוגרפית וייתכן שלא יעבוד באזור שלך.',
      notAlways: 'לא 24/7',
      tryingSource: 'מתחבר למקור',
      of: 'מתוך',
      buffering: 'טוען…',
      rewind: '10 שניות אחורה', forward: '10 שניות קדימה', prevChannel: 'ערוץ קודם',
      nextChannel: 'ערוץ הבא', play: 'נגן', pause: 'השהה', mute: 'השתק', unmute: 'בטל השתקה',
      stop: 'עצור', fullscreen: 'מסך מלא', back: 'חזרה', stopped: 'הניגון נעצר',
      pressBackAgain: 'לחצו שוב על חזרה כדי לצאת מ-INDTV',
      language: 'שפה', english: 'English', hebrew: 'עברית',
      builtIn: 'מובנה', userSource: 'המקור שלך', enabled: 'פעיל', disabled: 'כבוי',
      lastRefresh: 'רענון אחרון', status: 'מצב', statusOk: 'נטען', statusError: 'שגיאה',
      statusIdle: 'ממתין', statusLoading: 'טוען', remove: 'הסר',
      addUrl: 'הוסף כתובת רשימה', addRaw: 'הדבק טקסט רשימה', addFile: 'טען קובץ מהמכשיר',
      sourceName: 'שם', sourceUrl: 'כתובת הרשימה (.m3u)', sourceKind: 'תוכן',
      kindLive: 'ערוצים חיים', kindVod: 'סרטים ותוכניות (VOD)',
      add: 'הוסף מקור', cancel: 'ביטול', save: 'שמור',
      epgTitle: 'לוח שידורים (XMLTV)', epgUrl: 'כתובת XMLTV (‎.xml או ‎.xml.gz)', epgStatus: 'לוח שידורים',
      epgNone: 'לא הוגדר לוח שידורים', epgLoaded: 'תוכניות נטענו',
      refreshAll: 'רענן את כל המקורות', clearCache: 'מחק נתונים שמורים',
      cacheCleared: 'הנתונים השמורים נמחקו',
      about: 'אודות INDTV',
      aboutBody: 'INDTV מנגן ערוצים ציבוריים מרשימת הודו של פרויקט iptv-org הפתוח ומקורות שהוספתם בעצמכם. האתר לא מאחסן שידורים ולא עוקף DRM, חומות תשלום, חסימות גאוגרפיות או התחברות.',
      added: 'המקור נוסף', invalidUrl: 'הזינו כתובת http(s) מלאה לרשימת ‎.m3u',
      hlsNotPlaylist: 'הכתובת הזו היא שידור בודד (‎.m3u8) ולא רשימת ערוצים. הוסיפו את רשימת ה-‎.m3u של הערוצים.',
      notM3u: 'הקובץ הזה אינו רשימת M3U. הוא חייב להתחיל ב-‎#EXTM3U.',
      removed: 'המקור הוסר', refreshed: 'הערוצים רועננו', refreshFailed: 'הרענון נכשל',
      favAdded: 'נוסף למועדפים', favRemoved: 'הוסר מהמועדפים',
      categories: 'קטגוריות', details: 'פרטי ערוץ', quality: 'איכות'
    }
  };

  var lang = 'en';
  try { lang = INDTV.Store.getSync('lang') === 'he' ? 'he' : 'en'; } catch (e) { lang = 'en'; }

  INDTV.I18n = {
    lang: function () { return lang; },
    t: function (key) {
      var table = STRINGS[lang] || STRINGS.en;
      return table[key] !== undefined ? table[key] : (STRINGS.en[key] !== undefined ? STRINGS.en[key] : key);
    },
    setLang: function (next) {
      next = next === 'he' ? 'he' : 'en';
      if (next === lang) return;
      lang = next;
      INDTV.Store.setSync('lang', lang);
      INDTV.I18n.applyDir();
      INDTV.Bus.emit('lang', lang);
    },
    applyDir: function () {
      var html = document.documentElement;
      html.setAttribute('lang', lang === 'he' ? 'he' : 'en');
      html.setAttribute('dir', lang === 'he' ? 'rtl' : 'ltr');
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
