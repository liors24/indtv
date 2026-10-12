// Browser stand-in for the Android host + TDLib, used only for design review with Playwright.
(function () {
  const params = new URLSearchParams(location.search);
  const authMode = params.get('auth') || 'ready';
  if (params.get('taste') === '1' && !localStorage.getItem('nova.taste')) {
    // pretend the viewer has watched a lot of Grey's Anatomy and the nature channel
    localStorage.setItem('nova.taste', JSON.stringify({ chats: { '-1004': 9000, '-1003': 3000 }, series: { 'greysanatomy': { name: "Grey's Anatomy", chatId: -1004, secs: 9000, season: 20, ep: 3, last: Date.now() } }, words: { greys: 9000, anatomy: 9000, planet: 2000, earth: 2000 }, kinds: { movie: 100, episode: 9000, clip: 300 }, done: [], total: 12000 }));
  }
  const port = location.port;
  let seq = 1;
  const out = [];
  function emit(o) { out.push(o); flush(); }
  let flushT = 0;
  function flush() {
    if (flushT) return;
    flushT = setTimeout(() => { flushT = 0; const b = out.splice(0); if (window.__td) window.__td(b); }, 10);
  }
  const reply = (req, o) => { o['@extra'] = req['@extra']; setTimeout(() => emit(o), 40 + Math.random() * 120); };

  const T = (n) => ({ '@type': 'file', id: n, size: 1000, expected_size: 1000, local: { path: '', is_downloading_completed: false }, remote: {} });
  const mini = (n) => null;

  const chatsDef = [
    { id: -1001, title: 'תחנה 19 HD', ch: true, photo: 2000 },
    { id: -1002, title: 'סרטים ישראליים 🎬', ch: true, photo: 2001 },
    { id: -1003, title: 'Nature 4K', ch: true, photo: 2002 },
    { id: -1004, title: 'האנטומיה של גריי', ch: true, photo: 2003 },
    { id: -1005, title: 'המשפחה ❤️', ch: false, photo: 0 },
    { id: 501, title: 'דני כהן', user: true, photo: 2005 },
    { id: -1006, title: 'מוזיקה ישראלית', ch: true, photo: 2006 },
    { id: -1007, title: 'קומדיות', ch: true, photo: 0 },
    { id: 502, title: 'Saved Messages', user: true, photo: 0 },
  ];

  const msgs = {};
  let mid = 100;
  let img = 0;
  function nextImg() { return 1000 + (img++ % 40); }
  function video(chatId, caption, dur, opts) {
    opts = opts || {};
    const im = nextImg();
    const m = {
      '@type': 'message', id: (mid += 1) * 1048576, chat_id: chatId, date: Math.floor(Date.now() / 1000) - mid * 3600 * 5,
      is_outgoing: !!opts.out, sender_id: { '@type': 'messageSenderChat', chat_id: chatId },
      content: {
        '@type': opts.doc ? 'messageDocument' : 'messageVideo',
        caption: { '@type': 'formattedText', text: caption, entities: [] },
      },
    };
    if (opts.doc) m.content.document = { file_name: opts.doc, mime_type: 'video/x-matroska', thumbnail: { file: T(im) }, document: { id: 9000 + mid, size: 1.6e9 } };
    else m.content.video = { duration: dur, width: opts.h ? Math.round(opts.h * 16 / 9) : 1920, height: opts.h || 1080, file_name: opts.file || 'video.mp4', mime_type: 'video/mp4', supports_streaming: true, thumbnail: { file: T(im) }, video: { id: 9000 + mid, size: Math.round(dur * 260000 * (opts.h ? opts.h / 1080 : 1)) } };
    (msgs[chatId] || (msgs[chatId] = [])).push(m);
    return m;
  }
  function photo(chatId, caption) {
    const im = nextImg();
    const m = { '@type': 'message', id: (mid += 1) * 1048576, chat_id: chatId, date: Math.floor(Date.now() / 1000) - mid * 3600 * 3, sender_id: { '@type': 'messageSenderChat', chat_id: chatId },
      content: { '@type': 'messagePhoto', caption: { text: caption || '' }, photo: { sizes: [{ type: 'm', width: 320, height: 180, photo: T(im) }, { type: 'y', width: 1280, height: 720, photo: T(im) }] } } };
    (msgs[chatId] || (msgs[chatId] = [])).push(m);
  }
  function text(chatId, t, out, user) {
    const m = { '@type': 'message', id: (mid += 1) * 1048576, chat_id: chatId, date: Math.floor(Date.now() / 1000) - (200 - mid) * 600, is_outgoing: !!out,
      sender_id: user ? { '@type': 'messageSenderUser', user_id: user } : { '@type': 'messageSenderChat', chat_id: chatId },
      content: { '@type': 'messageText', text: { text: t } } };
    (msgs[chatId] || (msgs[chatId] = [])).push(m);
  }

  for (let e = 14; e >= 1; e--) video(-1001, `🔥 תחנה 19 עונה 3 פרק ${e} 🔥\n1080p WEB-DL\nהועלה בלעדית בטלגרם #תחנה19`, 2580 + e * 13);
  for (let e = 8; e >= 1; e--) video(-1001, `תחנה 19 - עונה 2 פרק ${e}\nתרגום: צוות הערוץ`, 2500 + e * 9);
  video(-1001, 'פרומו לעונה 4', 94);
  video(-1002, 'גבעת חלפון אינה עונה\nקומדיה קלאסית, 1976. גרסה משוחזרת באיכות גבוהה.', 5400);
  video(-1002, 'אסקימו לימון\nהסרט המקורי, 1978', 5600);
  video(-1002, 'מבצע סבתא', 3500);
  video(-1002, 'הבורר הסרט', 6200, { doc: 'HaBorer.The.Movie.2007.1080p.mkv' });
  video(-1002, 'מאחורי הקלעים: הצילומים בנגב', 610);
  for (let e = 6; e >= 1; e--) video(-1003, `Planet Earth III S01E0${e} 2160p`, 3200, { doc: `Planet.Earth.III.S01E0${e}.2160p.mkv` });
  video(-1003, 'שקיעה מעל הכנרת, צילום רחפן', 180);
  video(-1003, 'נמרים בהודו', 2950);
  for (let e = 10; e >= 1; e--) video(-1004, `Grey's Anatomy S20E${e < 10 ? '0' + e : e}`, 2520);
  for (let e = 10; e >= 1; e--) { video(-1004, `Grey's Anatomy S20E${e < 10 ? '0' + e : e} 720p`, 2520, { h: 720 }); video(-1004, `Grey's Anatomy S20E${e < 10 ? '0' + e : e} 480p`, 2520, { h: 480 }); }
  video(-1002, 'גבעת חלפון אינה עונה 720p', 5400, { h: 720 });
  video(-1005, 'הצגה של נועה בגן 🥰', 245);
  video(-1005, 'יום הולדת לסבא', 420);
  for (let i = 0; i < 14; i++) photo(-1005, i === 0 ? 'טיול לצפון' : '');
  for (let i = 0; i < 6; i++) photo(-1003, 'Nature still');
  text(-1005, 'מישהו יודע מתי הארוחה ביום שישי?', false, 501);
  text(-1005, 'בשבע וחצי, אצל סבתא', true);
  text(-1005, 'מביאים קינוח? 🍰', false, 501);
  text(501, 'ראית את הפרק החדש של תחנה 19?', false, 501);
  text(501, 'עוד לא, מתחיל הערב בטלוויזיה', true);
  text(501, 'אל תעשה לי ספוילרים 😅', true);
  Object.keys(msgs).forEach((k) => msgs[k].sort((a, b) => b.date - a.date));

  function chatObj(c, i) {
    const last = msgs[c.id] && msgs[c.id][0];
    return {
      '@type': 'chat', id: c.id, title: c.title,
      type: c.user ? { '@type': 'chatTypePrivate', user_id: c.id } : { '@type': 'chatTypeSupergroup', supergroup_id: -c.id, is_channel: c.ch },
      photo: c.photo ? { small: T(c.photo), big: T(c.photo) } : null,
      positions: [{ '@type': 'chatPosition', list: { '@type': 'chatListMain' }, order: String(9000000000 - i * 1000), is_pinned: false }],
      last_message: last || null, unread_count: i === 4 ? 3 : i === 5 ? 1 : 0, permissions: { can_send_basic_messages: true },
    };
  }

  function search(list, filter) {
    return list.filter((m) => {
      const t = m.content['@type'];
      if (filter === 'searchMessagesFilterVideo') return t === 'messageVideo';
      if (filter === 'searchMessagesFilterDocument') return t === 'messageDocument';
      if (filter === 'searchMessagesFilterPhoto') return t === 'messagePhoto';
      if (filter === 'searchMessagesFilterAudio') return t === 'messageAudio';
      return false;
    });
  }

  let auth = authMode === 'setup' ? 'params' : 'params';
  function setAuth(t, extra) { emit({ '@type': 'updateAuthorizationState', authorization_state: Object.assign({ '@type': t }, extra || {}) }); }

  const handlers = {
    getOption: (r) => { reply(r, { '@type': 'optionValueString', value: '1.8.36' }); setAuth('authorizationStateWaitTdlibParameters'); },
    setTdlibParameters: (r) => {
      reply(r, { '@type': 'ok' });
      if (authMode === 'ready') setTimeout(() => setAuth('authorizationStateReady'), 200);
      else setTimeout(() => setAuth('authorizationStateWaitPhoneNumber'), 200);
    },
    requestQrCodeAuthentication: (r) => { reply(r, { '@type': 'ok' }); setTimeout(() => setAuth('authorizationStateWaitOtherDeviceConfirmation', { link: 'tg://login?token=AQJ1c2VyX3Rva2VuX2Zvcl90ZXN0aW5nX3FyX2NvZGVfMTIzNDU2Nzg5MA' }), 600); },
    getMe: (r) => reply(r, { '@type': 'user', id: 777, first_name: 'יוסי', last_name: 'לוי', phone_number: '972501234567', profile_photo: { small: T(2008) } }),
    loadChats: (r) => {
      chatsDef.forEach((c, i) => emit({ '@type': 'updateNewChat', chat: chatObj(c, i) }));
      emit({ '@type': 'updateUser', user: { id: 501, first_name: 'דני', last_name: 'כהן' } });
      reply(r, { '@type': 'ok' });
    },
    getChat: (r) => { const i = chatsDef.findIndex((c) => c.id === r.chat_id); reply(r, chatObj(chatsDef[i], i)); },
    searchMessages: (r) => {
      let all = [];
      Object.keys(msgs).forEach((k) => { all = all.concat(search(msgs[k], r.filter['@type'])); });
      if (r.query) all = all.filter((m) => (m.content.caption.text || '').indexOf(r.query) >= 0);
      all.sort((a, b) => b.date - a.date);
      reply(r, { '@type': 'foundMessages', total_count: all.length, messages: all.slice(0, r.limit), next_offset: '' });
    },
    searchChatMessages: (r) => {
      let list = search(msgs[r.chat_id] || [], r.filter['@type']);
      if (r.query) list = list.filter((m) => ((m.content.caption && m.content.caption.text) || '').indexOf(r.query) >= 0);
      if (r.from_message_id) list = list.filter((m) => m.id < r.from_message_id);
      const page = list.slice(0, r.limit);
      reply(r, { '@type': 'foundChatMessages', total_count: list.length, messages: page, next_from_message_id: page.length === r.limit ? page[page.length - 1].id : 0 });
    },
    getChatHistory: (r) => {
      let list = msgs[r.chat_id] || [];
      if (r.from_message_id) list = list.filter((m) => m.id < r.from_message_id);
      reply(r, { '@type': 'messages', total_count: list.length, messages: list.slice(0, r.limit) });
    },
    getMessage: (r) => { const m = (msgs[r.chat_id] || []).find((x) => x.id === r.message_id); reply(r, m || { '@type': 'error', code: 404, message: 'Not Found' }); },
    getStorageStatisticsFast: (r) => reply(r, { '@type': 'storageStatisticsFast', files_size: 48 * 1048576, file_count: 120, database_size: 1 }),
    sendMessage: (r) => {
      const m = { '@type': 'message', id: (mid += 1) * 1048576, chat_id: r.chat_id, date: Math.floor(Date.now() / 1000), is_outgoing: true, content: { '@type': 'messageText', text: { text: r.input_message_content.text.text } } };
      reply(r, m);
      emit({ '@type': 'updateNewMessage', message: m });
    },
  };

  let playState = { active: false };
  let playT = 0;
  window.NovaHost = {
    info: () => JSON.stringify({ port, lan: '192.168.1.23', token: 'a1b2c3d4e5f6', db: '/db', files: '/files', model: 'Xiaomi Mi Box S', system: 'Android 9', version: '1.0.0', lang: 'he' }),
    ready: () => { if (authMode === 'ready' || authMode === 'qr') localStorage.setItem('nova.api', JSON.stringify({ id: 12345, hash: 'x'.repeat(32) })); if (authMode === 'setup') localStorage.removeItem('nova.api'); handlers.getOption({}); },
    send: (s) => {
      const r = JSON.parse(s);
      const f = handlers[r['@type']];
      if (f) f(r);
      else reply(r, { '@type': 'ok' });
    },
    execute: () => '{}',
    restart: () => {},
    play: (url, start) => {
      playState = { active: true, prepared: false, buffering: true, pos: start, dur: 2600000, playing: false };
      let v = document.getElementById('mockvideo');
      if (!v) { v = document.createElement('img'); v.id = 'mockvideo'; v.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;object-fit:cover;z-index:-1'; document.documentElement.appendChild(v); }
      v.src = '/t/' + (1000 + Math.floor(Math.random() * 40)) + '.jpg';
      v.style.display = 'block';
      setTimeout(() => { playState.prepared = true; playState.buffering = false; playState.playing = true; window.__player && window.__player({ type: 'prepared', dur: 2600000, tracks: [{ index: 1, type: 'audio', lang: 'eng' }, { index: 2, type: 'text', lang: 'heb' }] }); }, 900);
      clearInterval(playT);
      playT = setInterval(() => { if (playState.playing) playState.pos += 500; }, 500);
    },
    pause: () => { playState.playing = false; },
    resume: () => { playState.playing = true; },
    seek: (ms) => { playState.pos = ms; },
    speed: () => {},
    mute: (m) => { playState.muted = m; },
    aspect: (m) => { const v = document.getElementById('mockvideo'); if (!v) return; const fit = { fit: 'contain', zoom: 'cover', fill: 'fill' }[m]; v.style.objectFit = fit || 'contain'; v.style.background = '#000'; },
    prefetch: () => {},
    track: () => {},
    stop: () => { playState = { active: false }; clearInterval(playT); const v = document.getElementById('mockvideo'); if (v) v.style.display = 'none'; },
    state: () => JSON.stringify(playState),
    keepScreenOn: () => {},
    exit: () => console.log('EXIT'),
  };
})();
