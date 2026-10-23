// Visual themes. 'calm' (soft slate, Netflix-like home) is the default; 'marquee' is the cinema sign look.
import { store } from './util.js';

export const THEMES = [
  { id: 'calm', label: 'ערב רגוע', sub: 'צבעים רכים ושקטים, תמונה גדולה בראש המסך' },
  { id: 'marquee', label: 'מרקיזה', sub: 'שלט קולנוע מואר, ענבר ובורדו' },
];

export function theme() {
  let t = '';
  try { t = new URLSearchParams(location.search).get('theme') || ''; } catch (e) { /* no URL API */ }
  if (!THEMES.some((x) => x.id === t)) t = store.get('theme', 'calm');
  return THEMES.some((x) => x.id === t) ? t : 'calm';
}

export function applyTheme(t) {
  t = t || theme();
  const cl = document.documentElement.classList;
  THEMES.forEach((x) => cl.toggle('t-' + x.id, x.id === t));
}

export function setTheme(t) {
  store.set('theme', t);
  applyTheme(t);
}
