// "Projection" ambience: the focused artwork's colours spill across the room.
// Uses a tiny upscaled canvas instead of CSS blur, so it's cheap on TV GPUs.
import { resolveSrc } from './td.js';


let layers = null;
let front = 0;
let lastSrc = '';
let pendingSrc = '';
let timer = 0;
const cache = new Map();

export function mountAmbient(root) {
  const a = document.createElement('div');
  a.className = 'amb-layer';
  const b = document.createElement('div');
  b.className = 'amb-layer';
  root.appendChild(a);
  root.appendChild(b);
  layers = [a, b];
}

function soften(img) {
  const w = 40, hgt = 24;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = hgt;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0, w, hgt);
  // a couple of cheap box-blur passes on 960 pixels
  let d;
  try { d = g.getImageData(0, 0, w, hgt); } catch (e) { return { url: c.toDataURL(), rgb: [40, 30, 60] }; }
  const px = d.data;
  for (let pass = 0; pass < 3; pass++) {
    const src = new Uint8ClampedArray(px);
    for (let y = 0; y < hgt; y++) for (let x = 0; x < w; x++) {
      let r = 0, gg = 0, b = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= hgt) continue;
        const i = (yy * w + xx) * 4;
        r += src[i]; gg += src[i + 1]; b += src[i + 2]; n++;
      }
      const o = (y * w + x) * 4;
      px[o] = r / n; px[o + 1] = gg / n; px[o + 2] = b / n;
    }
  }
  // boost saturation a touch, compute mean colour
  let mr = 0, mg = 0, mb = 0;
  for (let i = 0; i < px.length; i += 4) {
    const l = (px[i] + px[i + 1] + px[i + 2]) / 3;
    px[i] = l + (px[i] - l) * 1.35; px[i + 1] = l + (px[i + 1] - l) * 1.35; px[i + 2] = l + (px[i + 2] - l) * 1.35;
    mr += px[i]; mg += px[i + 1]; mb += px[i + 2];
  }
  g.putImageData(d, 0, 0);
  const n = px.length / 4;
  return { url: c.toDataURL('image/jpeg', 0.9), rgb: [mr / n, mg / n, mb / n] };
}

function apply(entry) {
  if (!layers) return;
  const next = layers[1 - front];
  const prev = layers[front];
  next.style.backgroundImage = `url("${entry.url}")`;
  next.classList.add('on');
  prev.classList.remove('on');
  front = 1 - front;
  const [r, g, b] = entry.rgb;
  // keep the ambient tint dark enough for text
  const k = 0.55;
  document.documentElement.style.setProperty('--amb', `${Math.round(r * k)}, ${Math.round(g * k)}, ${Math.round(b * k)}`);
}

export function setAmbient(src) {
  if (!src || src === lastSrc) return;
  pendingSrc = src;
  clearTimeout(timer);
  // wait for the user to settle before repainting the room
  timer = setTimeout(() => {
    const want = pendingSrc;
    if (cache.has(want)) { lastSrc = want; apply(cache.get(want)); return; }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (pendingSrc !== want) return;
      let e;
      try { e = soften(img); } catch (err) { e = { url: want, rgb: [52, 38, 78] }; }
      cache.set(want, e);
      if (cache.size > 80) cache.delete(cache.keys().next().value);
      lastSrc = want;
      apply(e);
    };
    resolveSrc(want, (u) => { if (u && pendingSrc === want) img.src = u; });
  }, 140);
}

export function clearAmbient() {
  lastSrc = '';
  if (layers) layers.forEach((l) => l.classList.remove('on'));
  document.documentElement.style.removeProperty('--amb');
}
