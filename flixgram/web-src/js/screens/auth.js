// First-run gate: API keys (from the phone, over the LAN), then Telegram login by QR,
// with phone number / code / 2-step password as a fallback.
import { h, store, svg, ICON } from '../util.js';
import * as td from '../td.js';
import { qrSvg } from '../qr.js';
import { setRootScope, focus } from '../focus.js';
import { button } from '../components.js';
import { toast } from '../ui.js';

// When the user asks for phone login while a QR session is pending, TDLib needs a fresh
// session first; we remember the number and continue after the restart.
export const authFlags = { pendingPhone: null };

function field(label, attrs) {
  const input = h('input.field-input.fx', Object.assign({ type: 'text', autocomplete: 'off', autocorrect: 'off', autocapitalize: 'off', spellcheck: 'false', lang: 'en', dir: 'ltr' }, attrs || {}));
  return { wrap: h('label.field', null, h('span.field-label', { text: label }), input), input };
}

// What was typed or pasted, cleaned: no direction marks or words around the number, and letters typed
// on a Hebrew keyboard become the English letters on the same keys (ש→a, נ→b, ב→c, ג→d, ק→e, כ→f).
const HE_KEYS = 'שנבגקכעיןחלךצמםפ/רדאוהסטז', EN_KEYS = 'abcdefghijklmnopqrstuvxyz';
export function cleanId(s) {
  s = String(s || '');
  const runs = s.match(/\d{3,12}/g);
  return runs && runs.length === 1 ? runs[0] : s.replace(/\D/g, '');
}
export function cleanHash(s) {
  const t = Array.from(String(s || '')).map((c) => { const k = HE_KEYS.indexOf(c); return k >= 0 ? EN_KEYS[k] : c.toLowerCase(); }).join('');
  const m = t.match(/[0-9a-f]{32}/);
  return m ? m[0] : t.replace(/[^0-9a-f]/g, '');
}

function stage(cls, left, right) {
  return h('div.gate.' + cls, null, h('div.gate-copy', null, right), h('div.gate-visual', null, left));
}

export function renderSetup(root, onDone) {
  const lan = td.info.lan;
  // Samsung TVs have no local server: the phone page sends the keys through an encrypted relay instead
  const url = td.info.setupUrl || (lan ? `http://${lan}:${td.info.port}/setup/${td.info.token}` : '');
  const id = field('api_id', { inputmode: 'numeric', placeholder: '1234567' });
  const hash = field('api_hash', { placeholder: '32 תווים' });
  const save = button('שמירה והמשך', () => submit(id.input.value, hash.input.value), { primary: true });
  const manual = h('div.manual', { hidden: true }, id.wrap, hash.wrap, save);
  const toggle = button('להקליד בשלט במקום', () => {
    manual.hidden = false;
    toggle.hidden = true;
    focus(id.input);
  });

  const copy = [
    h('div.brand-mark', null, h('img', { src: 'logo.svg', alt: '' }), h('span', { text: 'FLIXGRAM' })),
    h('h1.gate-title', { text: 'מחברים את הטלוויזיה לטלגרם' }),
    h('ol.steps', null,
      h('li', null, h('b', { text: 'סרקו את הקוד במצלמת הטלפון. ' }), td.info.setupUrl ? 'ייפתח דף קטן בטלפון.' : 'ייפתח דף קטן על אותה רשת Wi‑Fi.'),
      h('li', null, h('b', { text: 'צרו מפתח ב־my.telegram.org. ' }), 'נכנסים עם המספר, API development tools, ממלאים שם כלשהו.'),
      h('li', null, h('b', { text: 'מדביקים api_id ו־api_hash. ' }), 'הטלוויזיה ממשיכה לבד ברגע שהם מגיעים.')),
    h('p.gate-note', { text: 'המפתח נשמר רק בטלוויזיה הזו. צריך לעשות את זה פעם אחת.' }),
    toggle, manual,
  ];
  const visual = url
    ? h('div.qr-card', null, h('div.qr', { html: qrSvg(url, 420) }), h('div.qr-cap', { text: 'סריקה מהטלפון' }), h('div.qr-url', { text: url.split('#')[0] }))
    : h('div.qr-card.none', null, h('p', { text: 'לא נמצא חיבור רשת מקומי. אפשר להקליד את הפרטים בשלט.' }));
  root.innerHTML = '';
  const el = stage('setup', visual, copy);
  root.appendChild(el);
  setRootScope(el, toggle);
  if (!url) { manual.hidden = false; toggle.hidden = true; setRootScope(el, id.input); }

  function submit(a, b) {
    a = cleanId(a);
    b = cleanHash(b);
    if (!/^\d{3,12}$/.test(a) || !/^[0-9a-f]{32}$/.test(b)) {
      toast('api_id הוא מספר, ו־api_hash הוא 32 תווים באנגלית ומספרים');
      return;
    }
    store.set('api', { id: parseInt(a, 10), hash: b });
    onDone();
  }
  window.__setup = (o) => {
    toast('הפרטים התקבלו מהטלפון');
    submit(o.api_id, o.api_hash);
  };
}

export function renderLogin(root, authState) {
  const t = authState['@type'];
  root.innerHTML = '';
  let el;
  if (t === 'authorizationStateWaitOtherDeviceConfirmation' || t === 'qr-pending') {
    const qr = h('div.qr', { html: authState.link ? qrSvg(authState.link, 440) : '' });
    if (!authState.link) qr.appendChild(h('div.qr-wait'));
    const phoneBtn = button('התחברות עם מספר טלפון', () => {
      renderLogin(root, { '@type': 'phone-form' });
    });
    el = stage('login', h('div.qr-card.tg', null, qr, h('div.qr-cap', { text: 'הקוד מתחדש אוטומטית' })), [
      h('div.brand-mark', null, h('img', { src: 'logo.svg', alt: '' }), h('span', { text: 'FLIXGRAM' })),
      h('h1.gate-title', { text: 'סורקים, וזהו' }),
      h('ol.steps', null,
        h('li', null, 'פתחו את טלגרם בטלפון'),
        h('li', null, 'הגדרות, ואז ', h('b', { text: 'מכשירים' })),
        h('li', null, h('b', { text: 'קישור מכשיר שולחני' }), ', וכוונו את המצלמה לקוד')),
      h('p.gate-note', { text: 'Flixgram מציג את המדיה מהערוצים, הקבוצות והצ׳אטים שלכם. שום דבר לא נשמר בטלוויזיה.' }),
      phoneBtn,
    ]);
    root.appendChild(el);
    setRootScope(el, phoneBtn);
    return;
  }
  if (t === 'phone-form' || t === 'authorizationStateWaitPhoneNumber') {
    const f = field('מספר טלפון כולל קידומת מדינה', { inputmode: 'tel', placeholder: '+972 50 123 4567' });
    const go = button('שליחת קוד', async () => {
      const num = f.input.value.replace(/[^\d+]/g, '');
      if (num.length < 8) return toast('צריך מספר מלא, למשל +972501234567');
      try {
        await td.send({ '@type': 'setAuthenticationPhoneNumber', phone_number: num, settings: null });
      } catch (e) {
        if ((e.message || '').toLowerCase().indexOf('unexpected') >= 0) {
          authFlags.pendingPhone = num;
          toast('מעבירים להתחברות עם מספר…');
          td.fire({ '@type': 'logOut' });
        } else toast(errText(e));
      }
    }, { primary: true });
    const back = button('חזרה לקוד QR', () => requestQr());
    el = stage('login', h('div.big-glyph', null, svg(ICON.send, 160)), [
      h('div.brand-mark', null, h('img', { src: 'logo.svg', alt: '' }), h('span', { text: 'FLIXGRAM' })),
      h('h1.gate-title', { text: 'התחברות עם מספר' }),
      h('p.gate-lead', { text: 'טלגרם תשלח קוד לאפליקציה בטלפון או ב־SMS.' }),
      f.wrap, h('div.row', null, go, back)]);
    root.appendChild(el);
    setRootScope(el, f.input);
    f.input.addEventListener('keydown', (e) => { if (e.keyCode === 13) { e.preventDefault(); go._onselect(); } });
    return;
  }
  if (t === 'authorizationStateWaitCode') {
    const info = authState.code_info || {};
    const via = info.type && info.type['@type'] === 'authenticationCodeTypeTelegramMessage' ? 'בהודעה בטלגרם' : 'ב־SMS';
    const f = field('הקוד שקיבלתם', { inputmode: 'numeric', placeholder: '12345' });
    const go = button('אישור', async () => {
      try { await td.send({ '@type': 'checkAuthenticationCode', code: f.input.value.trim() }); } catch (e) { toast(errText(e)); }
    }, { primary: true });
    el = stage('login', h('div.big-glyph', null, svg(ICON.check, 160)), [
      h('div.brand-mark', null, h('img', { src: 'logo.svg', alt: '' }), h('span', { text: 'FLIXGRAM' })),
      h('h1.gate-title', { text: 'הקוד בדרך' }),
      h('p.gate-lead', { text: `שלחנו קוד ${via} למספר ${info.phone_number ? '+' + info.phone_number : ''}` }),
      f.wrap, h('div.row', null, go, button('מספר אחר', () => renderLogin(root, { '@type': 'phone-form' })))]);
    root.appendChild(el);
    setRootScope(el, f.input);
    f.input.addEventListener('keydown', (e) => { if (e.keyCode === 13) { e.preventDefault(); go._onselect(); } });
    return;
  }
  if (t === 'authorizationStateWaitPassword') {
    const f = field('סיסמת אימות דו־שלבי', { type: 'password', placeholder: authState.password_hint ? 'רמז: ' + authState.password_hint : '' });
    const go = button('כניסה', async () => {
      try { await td.send({ '@type': 'checkAuthenticationPassword', password: f.input.value }); } catch (e) { toast(errText(e)); }
    }, { primary: true });
    el = stage('login', h('div.big-glyph', null, svg(ICON.check, 160)), [
      h('div.brand-mark', null, h('img', { src: 'logo.svg', alt: '' }), h('span', { text: 'FLIXGRAM' })),
      h('h1.gate-title', { text: 'עוד צעד אחד' }),
      h('p.gate-lead', { text: 'בחשבון מוגדר אימות דו־שלבי. הקלידו את הסיסמה שלכם בטלגרם.' }),
      f.wrap, go]);
    root.appendChild(el);
    setRootScope(el, f.input);
    f.input.addEventListener('keydown', (e) => { if (e.keyCode === 13) { e.preventDefault(); go._onselect(); } });
    return;
  }
  if (t === 'authorizationStateWaitRegistration') {
    el = stage('login', h('div'), [h('h1.gate-title', { text: 'אין חשבון טלגרם במספר הזה' }),
      h('p.gate-lead', { text: 'צרו חשבון באפליקציית טלגרם בטלפון ואז חזרו לכאן.' }), button('חזרה', () => requestQr(), { primary: true })]);
    root.appendChild(el);
    setRootScope(el);
  }
}

export function requestQr() {
  td.send({ '@type': 'requestQrCodeAuthentication', other_user_ids: [] }).catch((e) => {
    toast(errText(e));
    if ((e.message || '').indexOf('API_ID') >= 0 || (e.message || '').indexOf('API_HASH') >= 0) {
      // keys are baked into the local database: wipe it and ask again
      store.del('api');
      td.fire({ '@type': 'destroy' });
    }
  });
}

export function errText(e) {
  const m = (e && e.message) || '';
  if (m.indexOf('PHONE_CODE_INVALID') >= 0) return 'הקוד לא נכון, נסו שוב';
  if (m.indexOf('PASSWORD_HASH_INVALID') >= 0) return 'הסיסמה לא נכונה';
  if (m.indexOf('PHONE_NUMBER_INVALID') >= 0) return 'המספר לא תקין';
  if (m.indexOf('FLOOD') >= 0) return 'יותר מדי ניסיונות. חכו כמה דקות ונסו שוב';
  if (m.indexOf('API_ID') >= 0) return 'מפתחות ה־API לא תקינים';
  return m || 'משהו השתבש, נסו שוב';
}
