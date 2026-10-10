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
      displaySize: 'Display size', sizeM: 'Standard', sizeL: 'Large', sizeXL: 'Extra large',
      displaySizeHint: 'Makes cards and text bigger on every screen. Pick the size that reads best from your sofa.',
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
      categories: 'Categories', details: 'Channel details', quality: 'Quality', sourcesWord: 'sources',
      epgAuto: 'Automatic guide', epgAutoBody: 'Downloads free public TV guides for India and matches them to your channels, so the player and Home show what is on now.',
      epgMatched: 'channels with a guide', epgCustom: 'Extra guide URL (optional)', on: 'On', off: 'Off',
      myShows: 'My Shows', addShow: 'Add show to favorites', removeShow: 'Remove show', showAdded: 'Show added to My Shows',
      showRemoved: 'Show removed from My Shows', airingNow: 'On now', airsAt: 'Next at', notInGuide: 'Not in the guide for the next 36 hours',
      showStarting: 'is starting now on ', noShowsTitle: 'No favorite shows yet',
      noShowsBody: 'While watching, open the controls and press the heart next to the show name. INDTV tells you when it is on.',
      watchNow: 'Watch now', bestSource: 'Best source', checkingSources: 'Choosing the best stream…',
      liveTranslate: 'Live translation', translateOn: 'Translation on', translateOff: 'Translation off', translateTo: 'Translate to',
      translateSetup: 'To turn on live translation, add a free API key under Settings → Live translation.',
      translateKey: 'API key', translateProvider: 'Service', provGroq: 'Groq — free daily quota', provSoniox: 'Soniox — word-by-word live (paid)', provDeepgram: 'Deepgram + Google — word-by-word, free',
      catGeneral: 'General', trCatService: 'Service & keys', trCatLang: 'Language', trCatStyle: 'Subtitle style',
      recordings: 'Recordings', recordBtn: 'Record programme', recordStop: 'Stop recording', startOver: 'Programme start', goLive: 'Back to live',
      recStarted: 'Recording started', recStopped: 'Recording saved', recBusy: 'Already recording another channel', recUnavailable: 'This channel cannot be recorded (needs an unencrypted HLS stream)',
      recNoBuffer: 'Nothing buffered yet — try again in a few seconds', progNoEpg: 'No programme guide for this channel', progPartial: 'Programme start was not buffered — jumped to the earliest saved point',
      behindLive: 'behind live', recBadge: 'REC', recEmptyTitle: 'No recordings yet', recEmptyBody: 'While watching a channel press the record button in the player. The programme is saved here, from its start when it is still buffered.',
      recPlay: 'Play', recDelete: 'Delete', recDeleteSure: 'Delete — OK?', recInProgress: 'Recording…', recDone: 'Saved', recErrStorage: 'Stopped: storage full', recErrNet: 'Stopped: stream lost', recErrEnc: 'Not possible: encrypted stream', recErrEmpty: 'Nothing was captured',
      recStorage: 'Storage used by recordings', recStorageDevice: 'Device storage', recGoLive: 'Go to Live',
      catRec: 'Recording', dvrTitle: 'Recording & rewind', dvrRing: 'Rewind buffer (minutes of live TV kept)', dvrOff: 'Off', dvrRingBody: 'The app keeps the last minutes of the channel you watch on this device, so you can go back. A longer buffer uses more storage.',
      dvrAutoStop: 'Stop recording at programme end', dvrFromStart: 'Record from programme start (when buffered)', dvrPad: 'Extra minutes after the programme', dvrUnsupported: 'Recording is not supported on this device or browser.',
      recMin: 'min', recNoDvr: 'Rewind is off for this channel',
      groqKeyLabel: 'Groq API key (optional backup translator)', deepgramHint: 'Free word-by-word mode: Deepgram recognises the speech live (free starting credit, no card needed — console.deepgram.com → API Keys) and the translation is done by a fast free translator, no key and no per-minute limit. A Groq key is optional, only as a backup.', provOpenai: 'OpenAI',
      sonioxHint: 'Word-by-word mode: speech is recognised and translated while it is spoken, like live captions (about half a second behind). Needs a paid Soniox key (about $0.12 per hour of viewing): soniox.com → sign up → API Keys.',
      groqHint: 'Free mode: subtitles appear phrase by phrase, about 2–3 seconds behind.', provCustom: 'Other (OpenAI-compatible)',
      translateShowOriginal: 'Show original text', translateTest: 'Test key', translateOk: 'The key works', translateFail: 'The key did not work',
      translateHint: 'INDTV listens to the programme sound, recognises any language and shows subtitles in the language you choose, about 8–10 seconds behind the picture. Get a free key at console.groq.com → API Keys (free quota is a few hours a day). Tip: type the key from your phone with the Google TV app keyboard.',
      translateListening: 'Listening…', translateLimit: 'Free quota reached. Translation resumes in a minute.',
      translateUnsupported: 'This stream cannot be translated on this device.', translateModels: 'Models (advanced)', translateBase: 'Server address',
      translateError: 'Translation paused: the service did not answer.', detected: 'Detected', save2: 'Save',
      subStyle: 'Subtitle style', subSize: 'Size', subBg: 'Background', subColor: 'Text colour', subPos: 'Position',
      sizeS: 'Small', sizeMd: 'Medium', sizeLg: 'Large', sizeXl: 'Huge', bgNone: 'No box (outline)', bgSemi: 'See-through', bgSolid: 'Black box',
      colWhite: 'White', colYellow: 'Yellow', colCyan: 'Cyan', colGreen: 'Green', posBottom: 'Bottom', posTop: 'Top',
      subPreview: 'This is how subtitles will look'
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
      displaySize: 'גודל תצוגה', sizeM: 'רגיל', sizeL: 'גדול', sizeXL: 'גדול מאוד',
      displaySizeHint: 'מגדיל את הכרטיסים והטקסט בכל המסכים. בחרו את הגודל שהכי קריא מהספה.',
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
      categories: 'קטגוריות', details: 'פרטי ערוץ', quality: 'איכות', sourcesWord: 'מקורות',
      epgAuto: 'לוח שידורים אוטומטי', epgAutoBody: 'מוריד לוחות שידורים ציבוריים וחינמיים להודו ומתאים אותם לערוצים, כך שהנגן ודף הבית מציגים מה משודר עכשיו.',
      epgMatched: 'ערוצים עם לוח שידורים', epgCustom: 'כתובת לוח שידורים נוסף (לא חובה)', on: 'פועל', off: 'כבוי',
      myShows: 'התוכניות שלי', addShow: 'הוסף תוכנית למועדפים', removeShow: 'הסר תוכנית', showAdded: 'התוכנית נוספה ל"התוכניות שלי"',
      showRemoved: 'התוכנית הוסרה מ"התוכניות שלי"', airingNow: 'משודרת עכשיו', airsAt: 'הבא ב-', notInGuide: 'לא מופיעה בלוח ב-36 השעות הקרובות',
      showStarting: 'מתחילה עכשיו ב-', noShowsTitle: 'עדיין אין תוכניות מועדפות',
      noShowsBody: 'בזמן צפייה, פתחו את הפקדים ולחצו על הלב שליד שם התוכנית. INDTV יודיע לכם כשהיא משודרת.',
      watchNow: 'צפה עכשיו', bestSource: 'המקור הטוב ביותר', checkingSources: 'בוחר את השידור הטוב ביותר…',
      liveTranslate: 'תרגום חי', translateOn: 'התרגום פועל', translateOff: 'התרגום כבוי', translateTo: 'תרגם ל',
      translateSetup: 'כדי להפעיל תרגום חי, הוסיפו מפתח API חינמי בהגדרות ← תרגום חי.',
      translateKey: 'מפתח API', translateProvider: 'שירות', provGroq: 'Groq — מכסה יומית חינמית', provSoniox: 'Soniox — מילה במילה בזמן אמת (בתשלום)', provDeepgram: 'Deepgram + Google — מילה במילה, חינמי',
      catGeneral: 'כללי', trCatService: 'שירות ומפתחות', trCatLang: 'שפה', trCatStyle: 'סגנון כתוביות',
      recordings: 'הקלטות', recordBtn: 'הקלט תוכנית', recordStop: 'עצור הקלטה', startOver: 'תחילת התוכנית', goLive: 'חזרה לשידור חי',
      recStarted: 'ההקלטה התחילה', recStopped: 'ההקלטה נשמרה', recBusy: 'כבר מקליט ערוץ אחר', recUnavailable: 'אי אפשר להקליט את הערוץ הזה (נדרש שידור HLS לא מוצפן)',
      recNoBuffer: 'עדיין אין חומר בזיכרון — נסו שוב בעוד כמה שניות', progNoEpg: 'אין מדריך תוכניות לערוץ הזה', progPartial: 'תחילת התוכנית לא נשמרה — קפצתי לנקודה המוקדמת ביותר ששמורה',
      behindLive: 'אחרי השידור החי', recBadge: 'REC', recEmptyTitle: 'אין עדיין הקלטות', recEmptyBody: 'בזמן צפייה בערוץ לחצו על כפתור ההקלטה בנגן. התוכנית נשמרת כאן, מתחילתה אם היא עדיין בזיכרון.',
      recPlay: 'נגן', recDelete: 'מחק', recDeleteSure: 'מחק — בטוח?', recInProgress: 'מקליט…', recDone: 'נשמר', recErrStorage: 'נעצר: אין מקום באחסון', recErrNet: 'נעצר: השידור נותק', recErrEnc: 'לא אפשרי: שידור מוצפן', recErrEmpty: 'לא נקלט כלום',
      recStorage: 'נפח שתופסות ההקלטות', recStorageDevice: 'אחסון במכשיר', recGoLive: 'לשידור חי',
      catRec: 'הקלטה', dvrTitle: 'הקלטה וחזרה אחורה', dvrRing: 'חיץ חזרה אחורה (דקות שידור שנשמרות)', dvrOff: 'כבוי', dvrRingBody: 'האפליקציה שומרת במכשיר את הדקות האחרונות של הערוץ שאתם צופים בו כדי שאפשר יהיה לחזור אחורה. חיץ ארוך יותר תופס יותר מקום.',
      dvrAutoStop: 'עצור הקלטה בסוף התוכנית', dvrFromStart: 'הקלט מתחילת התוכנית (אם היא בזיכרון)', dvrPad: 'דקות נוספות אחרי התוכנית', dvrUnsupported: 'הקלטה לא נתמכת במכשיר או בדפדפן הזה.',
      recMin: 'דק׳', recNoDvr: 'חזרה אחורה כבויה בערוץ הזה',
      groqKeyLabel: 'מפתח Groq (אופציונלי — מתרגם גיבוי)', deepgramHint: 'מצב חינמי מילה במילה: Deepgram מזהה את הדיבור בזמן אמת (קרדיט התחלתי חינמי, בלי כרטיס אשראי — console.deepgram.com ← API Keys), והתרגום נעשה במתרגם חינמי ומהיר — בלי מפתח ובלי מגבלה לדקה. מפתח Groq הוא אופציונלי, רק כגיבוי.', provOpenai: 'OpenAI',
      sonioxHint: 'מצב מילה במילה: הדיבור מזוהה ומתורגם תוך כדי שמדברים, כמו כתוביות חיות (כחצי שנייה אחרי הדיבור). צריך מפתח Soniox בתשלום (כ-0.12$ לשעת צפייה): soniox.com ← הרשמה ← API Keys.',
      groqHint: 'מצב חינמי: הכתוביות מופיעות משפט אחרי משפט, כ-2–3 שניות אחרי הדיבור.', provCustom: 'אחר (תואם OpenAI)',
      translateShowOriginal: 'הצג גם את הטקסט המקורי', translateTest: 'בדוק מפתח', translateOk: 'המפתח עובד', translateFail: 'המפתח לא עבד',
      translateHint: 'INDTV מאזין לשמע של התוכנית, מזהה כל שפה ומציג כתוביות בשפה שבחרתם, בפיגור של כ-8–10 שניות מהתמונה. מפתח חינמי: console.groq.com ← API Keys (המכסה החינמית היא כמה שעות ביום). טיפ: אפשר להקליד את המפתח מהטלפון דרך המקלדת של אפליקציית Google TV.',
      translateListening: 'מאזין…', translateLimit: 'המכסה החינמית נוצלה. התרגום יחזור בעוד דקה.',
      translateUnsupported: 'אי אפשר לתרגם את השידור הזה במכשיר הזה.', translateModels: 'מודלים (מתקדם)', translateBase: 'כתובת השרת',
      translateError: 'התרגום הושהה: השירות לא ענה.', detected: 'זוהתה', save2: 'שמור',
      subStyle: 'סגנון כתוביות', subSize: 'גודל', subBg: 'רקע', subColor: 'צבע טקסט', subPos: 'מיקום',
      sizeS: 'קטן', sizeMd: 'בינוני', sizeLg: 'גדול', sizeXl: 'ענק', bgNone: 'בלי רקע (מסגרת)', bgSemi: 'שקוף למחצה', bgSolid: 'קופסה שחורה',
      colWhite: 'לבן', colYellow: 'צהוב', colCyan: 'תכלת', colGreen: 'ירוק', posBottom: 'למטה', posTop: 'למעלה',
      subPreview: 'כך ייראו הכתוביות'
    }
  };

  var lang = 'en';
  try { lang = INDTV.Store.getSync('lang') === 'he' ? 'he' : 'en'; } catch (e) { lang = 'en'; }

  /* Display size (Settings): scales the whole TV canvas. Default is Large. */
  INDTV.Display = {
    get: function () {
      var v = null;
      try { v = INDTV.Store.getSync('scale'); } catch (e) { v = null; }
      return v === 'm' || v === 'l' || v === 'xl' ? v : 'l';
    },
    apply: function () { document.documentElement.setAttribute('data-scale', INDTV.Display.get()); },
    set: function (v) {
      INDTV.Store.setSync('scale', v);
      INDTV.Display.apply();
      if (INDTV.Focus) INDTV.Focus._rem = 0;
      INDTV.Bus.emit('display-size', v);
    }
  };

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
