// Visual theme: one modern streaming design ('calm'). The html class t-calm scopes its styles.
import { store } from './util.js';

// The cinema-sign look ("marquee") was retired: everyone gets the modern streaming design.
export const THEMES = [
  { id: 'calm', label: 'Flixgram', sub: 'עיצוב מודרני ורך' },
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
  cl.remove('t-marquee');
  THEMES.forEach((x) => cl.toggle('t-' + x.id, x.id === t));
}

export function setTheme(t) {
  store.set('theme', t);
  applyTheme(t);
}
