const T = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', mkv: 'video/x-matroska', mp3: 'audio/mpeg', ogg: 'audio/ogg', m4a: 'audio/mp4', pdf: 'application/pdf' };
export default {
  getType(p) { const e = String(p).split('.').pop().toLowerCase(); return T[e] || null; },
  getExtension(m) { for (const k in T) if (T[k] === m) return k; return null; },
  lookup(p) { return this.getType(p); }, extension(m) { return this.getExtension(m); }
};
