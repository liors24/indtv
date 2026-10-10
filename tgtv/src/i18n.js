/* TeleTV — Hebrew / English strings */
import { ls } from './util.js';
const S = {
  he: {
    appName: 'TeleTV', back: 'חזרה', ok: 'אישור', cancel: 'ביטול', save: 'שמירה', next: 'הבא', loading: 'טוען…', retry: 'נסה שוב', close: 'סגור',
    setupTitle: 'חיבור לחשבון טלגרם', setupBody: 'כדי להתחבר לחשבון שלך צריך מפתחות אישיים (חד-פעמי). בטלפון או במחשב: היכנס ל-my.telegram.org ← API development tools ← צור אפליקציה, והעתק את api_id ו-api_hash.',
    apiId: 'api_id (מספר)', apiHash: 'api_hash (32 תווים)', setupBad: 'api_id חייב להיות מספר ו-api_hash 32 תווים (0-9, a-f).',
    loginTitle: 'כניסה לטלגרם', loginQr: 'בטלפון: טלגרם ← הגדרות ← מכשירים ← חיבור מכשיר, וסרוק את הקוד.', loginWait: 'מתחבר לטלגרם…', loginPhone: 'כניסה עם מספר טלפון', loginKeys: 'שינוי מפתחות API',
    phone: 'מספר טלפון (עם קידומת מדינה, למשל +972…)', code: 'קוד שקיבלת בטלגרם', password: 'סיסמת אימות דו-שלבי', passwordHint: 'רמז', send: 'שלח', wrongPass: 'הסיסמה שגויה, נסה שוב', wrongCode: 'הקוד שגוי, נסה שוב', badPhone: 'מספר לא תקין', qrExpired: 'הקוד התחדש', qrBack: 'חזרה לקוד QR',
    chats: 'צ׳אטים', all: 'הכול', users: 'אנשים', groups: 'קבוצות', channels: 'ערוצים', bots: 'בוטים', noChats: 'אין צ׳אטים', unread: 'חדשות',
    media: 'מדיה', videos: 'סרטונים', photos: 'תמונות', music: 'מוזיקה', voice: 'הקלטות', files: 'קבצים', noMedia: 'אין מדיה מסוג זה בצ׳אט', loadMore: 'טוען עוד…',
    settings: 'הגדרות', account: 'חשבון', logout: 'התנתקות', logoutSure: 'להתנתק? לחץ שוב לאישור', changeKeys: 'שינוי מפתחות API', clearCache: 'ניקוי זיכרון מטמון', language: 'שפה', cleared: 'נוקה',
    play: 'נגן', pause: 'השהה', buffering: 'מוריד…', downloading: 'מוריד', ofSize: 'מתוך', tooBig: 'הקובץ גדול מאוד והורדה מלאה עלולה להיכשל בטלוויזיה.', notPlayable: 'סוג הקובץ הזה לא נתמך בנגן', playErr: 'הנגינה נכשלה', netErr: 'שגיאת רשת, נסה שוב',
    sizeLabel: 'גודל', hint: 'חיצים: ניווט · אישור: פתיחה · חזרה: אחורה', seekHint: '◀ ▶ דילוג · אישור: הפעלה/השהיה', conn: 'מתחבר…', connFail: 'אין חיבור לטלגרם. בדוק אינטרנט.', floodWait: 'טלגרם ביקש להמתין', you: 'אתה', photo: 'תמונה', video: 'סרטון', audioMsg: 'הודעה קולית', file: 'קובץ', sticker: 'סטיקר',
    savedMsgs: 'הודעות שמורות', next2: 'הבא', prev2: 'הקודם'
  },
  en: {
    appName: 'TeleTV', back: 'Back', ok: 'OK', cancel: 'Cancel', save: 'Save', next: 'Next', loading: 'Loading…', retry: 'Try again', close: 'Close',
    setupTitle: 'Connect your Telegram account', setupBody: 'To sign in to your own account you need personal API keys (one time). On your phone or computer: open my.telegram.org → API development tools → create an app, and copy api_id and api_hash.',
    apiId: 'api_id (number)', apiHash: 'api_hash (32 characters)', setupBad: 'api_id must be a number and api_hash 32 characters (0-9, a-f).',
    loginTitle: 'Sign in to Telegram', loginQr: 'On your phone: Telegram → Settings → Devices → Link Desktop Device, then scan this code.', loginWait: 'Connecting to Telegram…', loginPhone: 'Sign in with phone number', loginKeys: 'Change API keys',
    phone: 'Phone number (with country code, e.g. +1…)', code: 'Code you received in Telegram', password: 'Two-step verification password', passwordHint: 'Hint', send: 'Send', wrongPass: 'Wrong password, try again', wrongCode: 'Wrong code, try again', badPhone: 'Invalid number', qrExpired: 'Code refreshed', qrBack: 'Back to QR code',
    chats: 'Chats', all: 'All', users: 'People', groups: 'Groups', channels: 'Channels', bots: 'Bots', noChats: 'No chats', unread: 'new',
    media: 'Media', videos: 'Videos', photos: 'Photos', music: 'Music', voice: 'Voice', files: 'Files', noMedia: 'No media of this type in the chat', loadMore: 'Loading more…',
    settings: 'Settings', account: 'Account', logout: 'Log out', logoutSure: 'Log out? Press again to confirm', changeKeys: 'Change API keys', clearCache: 'Clear cache', language: 'Language', cleared: 'Cleared',
    play: 'Play', pause: 'Pause', buffering: 'Downloading…', downloading: 'Downloading', ofSize: 'of', tooBig: 'This file is very large; a full download may fail on a TV.', notPlayable: 'This file type cannot be played here', playErr: 'Playback failed', netErr: 'Network error, try again',
    sizeLabel: 'Size', hint: 'Arrows: move · OK: open · Back: return', seekHint: '◀ ▶ seek · OK: play/pause', conn: 'Connecting…', connFail: 'Cannot reach Telegram. Check your internet.', floodWait: 'Telegram asked to wait', you: 'You', photo: 'Photo', video: 'Video', audioMsg: 'Voice message', file: 'File', sticker: 'Sticker',
    savedMsgs: 'Saved Messages', next2: 'Next', prev2: 'Previous'
  }
};
let lang = ls('lang') || ((navigator.language || 'he').toLowerCase().indexOf('en') === 0 ? 'en' : 'he');
export const I18n = {
  lang: () => lang,
  t: (k) => (S[lang] && S[lang][k]) || S.en[k] || k,
  set(l) { lang = l; ls('lang', l); I18n.apply(); },
  apply() { document.documentElement.lang = lang; document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr'; }
};
export const t = I18n.t;
