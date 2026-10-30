import { h, fmtSize, store } from '../util.js';
import * as td from '../td.js';
import { state } from '../state.js';
import { avatar } from '../components.js';
import { confirmDialog, toast, sheet } from '../ui.js';
import { focus } from '../focus.js';
import * as quality from '../quality.js';
import * as preview from '../preview.js';
import { THEMES, theme, setTheme } from '../theme.js';

export function settingsScreen(app) {
  const list = h('div.set-list', { 'data-flist': '', data: { fgroup: 'set' } });
  const detail = h('div.set-detail');
  const el = h('div.screen.settings', null, h('div.set-col', { 'data-vscroll': '0' }, list), detail);

  function row(title, value, onselect, opts) {
    opts = opts || {};
    const v = h('span.set-value', { text: value || '', dir: 'auto' });
    const r = h('div.set-row.fx' + (opts.danger ? '.danger' : ''), { onselect }, h('span.set-title', { text: title }), v,
      opts.toggle != null ? h('span.toggle' + (opts.toggle ? '.on' : ''), null, h('i')) : null);
    r._onfocus = () => explain(opts.explain || '', title);
    r._value = v;
    return r;
  }

  function explain(text, title) {
    detail.innerHTML = '';
    detail.appendChild(h('h2', { text: title }));
    if (text) detail.appendChild(h('p', { text }));
  }

  async function storageSize(r) {
    try {
      const s = await td.send({ '@type': 'getStorageStatisticsFast' });
      r._value.textContent = fmtSize(s.files_size);
    } catch (e) { r._value.textContent = ''; }
  }

  function build() {
    list.innerHTML = '';
    const me = state.me;
    if (me) {
      const fake = { id: me.id, title: (me.first_name + ' ' + (me.last_name || '')).trim(), photo: me.profile_photo ? { small: me.profile_photo.small, minithumbnail: me.profile_photo.minithumbnail } : null };
      const acct = h('div.set-account', null, avatar(fake, 88), h('div', null, h('div.acct-name', { text: fake.title }), h('div.acct-phone', { text: me.phone_number ? '+' + me.phone_number : '' })));
      list.appendChild(acct);
    }
    list.appendChild(h('h3.set-group', { text: 'צפייה' }));
    const auto = store.get('autoplay', true);
    const autoRow = row('ניגון אוטומטי של הפרק הבא', '', () => {
      const v = !store.get('autoplay', true);
      store.set('autoplay', v);
      autoRow.querySelector('.toggle').classList.toggle('on', v);
    }, { toggle: auto, explain: 'בסוף פרק, הפרק הבא בסדרה מתחיל לבד אחרי ספירה של 6 שניות. אפשר לבטל בכל רגע עם כפתור חזרה.' });
    list.appendChild(autoRow);
    const pvRow = row('תצוגה מקדימה חיה', '', () => {
      const v = !preview.enabled();
      preview.setEnabled(v);
      pvRow.querySelector('.toggle').classList.toggle('on', v);
    }, { toggle: preview.enabled(), explain: 'כשעוצרים על סרטון לשנייה וחצי, הוא מתחיל להתנגן בשקט מאחורי המסך. לחיצה על OK ממשיכה אותו מאותה שנייה, עם קול. התצוגה מורידה מעט נתונים מטלגרם בזמן הדפדוף.' });
    list.appendChild(pvRow);
    const fullRow = row('תצוגה מקדימה במסך מלא', '', () => {
      const v = !preview.fullEnabled();
      preview.setFullEnabled(v);
      fullRow.querySelector('.toggle').classList.toggle('on', v);
    }, { toggle: preview.fullEnabled(), explain: 'שנייה וחצי אחרי שהתצוגה המקדימה מתחילה, היא נפתחת לכל המסך מאחורי השורה, כמו בנטפליקס. כל תזוזה בשלט מחזירה את המסך.' });
    list.appendChild(fullRow);
    const themeName = () => (THEMES.find((x) => x.id === theme()) || THEMES[0]).label;
    const themeRow = row('ערכת עיצוב', themeName(), () => {
      sheet('ערכת עיצוב', THEMES.map((x) => ({ label: x.label, sub: x.sub, value: x.id, selected: x.id === theme() })), (t) => {
        setTheme(t);
        themeRow._value.textContent = themeName();
      });
    }, { explain: 'המראה של כל האפליקציה. ״ערב רגוע״ נעים לעיניים בצפייה ארוכה; ״מרקיזה״ הוא שלט הקולנוע המואר.' });
    if (THEMES.length > 1) list.appendChild(themeRow);
    const sp = store.get('speed', 1);
    const speedRow = row('מהירות ברירת מחדל', sp === 1 ? 'רגילה' : sp + 'x', () => {
      sheet('מהירות ברירת מחדל', [0.75, 1, 1.25, 1.5, 2].map((s) => ({ label: s === 1 ? 'רגילה' : s + 'x', value: s, selected: s === store.get('speed', 1) })), (s) => {
        store.set('speed', s);
        speedRow._value.textContent = s === 1 ? 'רגילה' : s + 'x';
      });
    }, { explain: 'המהירות שבה כל סרטון מתחיל. אפשר לשנות גם תוך כדי צפייה.' });
    list.appendChild(speedRow);
    const qn = quality.pinnedCount();
    const qRow = row('איכות קבועה לצ׳אטים', qn ? `${qn} צ׳אטים` : 'אין', () => {
      if (!quality.pinnedCount()) return toast('אפשר לקבע איכות מתוך הנגן, בכפתור האיכות');
      confirmDialog('לבטל את כל קיבועי האיכות?', 'כל הצ׳אטים יחזרו לנגן את הסרטון שבחרתם, באיכות שבה הועלה.', 'ביטול הקיבועים', () => {
        quality.clearPins();
        qRow._value.textContent = 'אין';
        toast('קיבועי האיכות בוטלו');
      });
    }, { explain: 'בנגן, בכפתור האיכות, אפשר לבחור רזולוציה אחרת של אותו סרטון (כשהערוץ העלה כמה גרסאות) ולקבע אותה לצ׳אט מסוים. כאן מבטלים את כל הקיבועים.' });
    list.appendChild(qRow);
    list.appendChild(row('איפוס "המשך צפייה"', '', () => {
      confirmDialog('לאפס את רשימת המשך הצפייה?', 'המיקומים השמורים בכל הסרטונים יימחקו מהטלוויזיה.', 'איפוס', () => {
        store.del('progress');
        app.markStale('home');
        toast('הרשימה אופסה');
      });
    }, { explain: 'Flixgram זוכר איפה עצרתם בכל סרטון, רק על המכשיר הזה.' }));

    list.appendChild(h('h3.set-group', { text: 'אחסון' }));
    const storeRow = row('מטמון זמני', '…', () => {
      confirmDialog('לנקות את המטמון?', 'תמונות ממוזערות ונתונים זמניים יימחקו. הסרטונים עצמם לא נשמרים בטלוויזיה בכל מקרה.', 'ניקוי', async () => {
        try {
          await td.send({ '@type': 'optimizeStorage', size: 0, ttl: 0, count: 0, immunity_delay: 0, file_types: [], chat_ids: [], exclude_chat_ids: [], return_deleted_file_statistics: false, chat_limit: 0 });
        } catch (e) { /* ignore */ }
        storageSize(storeRow);
        toast('המטמון נוקה');
      });
    }, { explain: 'סרטונים מוזרמים ישירות מטלגרם ונמחקים מיד כשיוצאים מהנגן, כך שהאחסון של הטלוויזיה נשאר פנוי. כאן נשמרות רק תמונות ממוזערות.' });
    list.appendChild(storeRow);
    storageSize(storeRow);

    list.appendChild(h('h3.set-group', { text: 'חשבון' }));
    list.appendChild(row('מכשיר', `${td.info.model || ''}`, () => {}, { explain: `${td.info.system || ''}, Flixgram ${td.info.version || ''}` }));
    list.appendChild(row('התנתקות מטלגרם', '', () => {
      confirmDialog('להתנתק מטלגרם?', 'תצטרכו לסרוק שוב קוד QR כדי להתחבר.', 'התנתקות', () => {
        td.fire({ '@type': 'logOut' });
      }, { danger: true });
    }, { danger: true, explain: 'ההתנתקות מוחקת את החיבור מהטלוויזיה בלבד. החשבון שלכם בטלגרם נשאר כמו שהוא.' }));
    list.appendChild(row('החלפת מפתחות API', '', () => {
      confirmDialog('להחליף את מפתחות ה־API?', 'Flixgram יתנתק ויבקש api_id ו־api_hash חדשים.', 'החלפה', () => {
        store.del('api');
        td.fire({ '@type': 'logOut' });
      }, { danger: true });
    }, { explain: 'המפתחות מ־my.telegram.org שאיתם Flixgram מתחבר לטלגרם.' }));
    explain('בחרו הגדרה מהרשימה כדי לראות כאן הסבר.', 'הגדרות');
  }

  return {
    el,
    show() { build(); },
    focusContent() { const f = list.querySelector('.fx'); if (f) focus(f); },
  };
}

