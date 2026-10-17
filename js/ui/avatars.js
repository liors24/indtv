/* INDTV — profile avatars. Hand-drawn SVG characters (no images to download), each on its own
 * coloured "room" so a profile is recognisable from across the living room. */
(function (root) {
  'use strict';
  var INDTV = root.INDTV = root.INDTV || {};

  var INK = '#1b1220';
  var LAMP = '#fff3dd';

  // [id, english name, hebrew name, background from, background to, drawing]
  var LIST = [
    ['tiger', 'Tiger', 'נמר', '#ff9f43', '#c2410c',
      '<circle cx="50" cy="56" r="27" fill="#ffb54d"/><circle cx="29" cy="33" r="9" fill="#ffb54d"/><circle cx="71" cy="33" r="9" fill="#ffb54d"/>' +
      '<circle cx="29" cy="33" r="4.5" fill="' + INK + '" opacity=".55"/><circle cx="71" cy="33" r="4.5" fill="' + INK + '" opacity=".55"/>' +
      '<path d="M50 30v9M40 32l3 8M60 32l-3 8M24 52h9M24 60h8M76 52h-9M76 60h-8" stroke="' + INK + '" stroke-width="3.2" stroke-linecap="round"/>' +
      '<ellipse cx="50" cy="66" rx="13" ry="9" fill="' + LAMP + '"/><circle cx="41" cy="51" r="3.4" fill="' + INK + '"/><circle cx="59" cy="51" r="3.4" fill="' + INK + '"/>' +
      '<path d="M46 62h8l-4 4z" fill="' + INK + '"/><path d="M50 66v3M45 70q5 3 10 0" stroke="' + INK + '" stroke-width="2" fill="none" stroke-linecap="round"/>'],
    ['elephant', 'Elephant', 'פיל', '#94a3ff', '#4338ca',
      '<ellipse cx="26" cy="48" rx="15" ry="19" fill="#c7cdff"/><ellipse cx="74" cy="48" rx="15" ry="19" fill="#c7cdff"/>' +
      '<ellipse cx="26" cy="49" rx="9" ry="12" fill="#f9a8d4" opacity=".7"/><ellipse cx="74" cy="49" rx="9" ry="12" fill="#f9a8d4" opacity=".7"/>' +
      '<circle cx="50" cy="46" r="22" fill="#dfe3ff"/><path d="M50 56q-7 12 -2 22q3 5 8 2" stroke="#dfe3ff" stroke-width="10" fill="none" stroke-linecap="round"/>' +
      '<circle cx="42" cy="44" r="3.2" fill="' + INK + '"/><circle cx="58" cy="44" r="3.2" fill="' + INK + '"/><path d="M37 62q-4 4 -2 9M63 62q4 4 2 9" stroke="' + LAMP + '" stroke-width="4" stroke-linecap="round" fill="none"/>'],
    ['peacock', 'Peacock', 'טווס', '#2dd4bf', '#0f5f7a',
      '<g fill="#34d399" opacity=".95"><ellipse cx="50" cy="26" rx="7" ry="13"/><ellipse cx="31" cy="32" rx="7" ry="13" transform="rotate(-38 31 32)"/><ellipse cx="69" cy="32" rx="7" ry="13" transform="rotate(38 69 32)"/><ellipse cx="22" cy="49" rx="6" ry="12" transform="rotate(-70 22 49)"/><ellipse cx="78" cy="49" rx="6" ry="12" transform="rotate(70 78 49)"/></g>' +
      '<g fill="#1e3a8a"><circle cx="50" cy="22" r="4"/><circle cx="29" cy="29" r="3.6"/><circle cx="71" cy="29" r="3.6"/><circle cx="18" cy="47" r="3.2"/><circle cx="82" cy="47" r="3.2"/></g>' +
      '<g fill="#fde047"><circle cx="50" cy="22" r="1.8"/><circle cx="29" cy="29" r="1.6"/><circle cx="71" cy="29" r="1.6"/></g>' +
      '<path d="M44 82q-2-22 6-32q8 10 6 32z" fill="#2563eb"/><circle cx="50" cy="47" r="9" fill="#2563eb"/><circle cx="52" cy="45" r="2" fill="' + LAMP + '"/><path d="M57 48l7 2-7 2z" fill="#f59e0b"/><path d="M48 38l-2-6M51 38l1-7M54 39l3-6" stroke="#2563eb" stroke-width="1.6" stroke-linecap="round"/>'],
    ['lotus', 'Lotus', 'לוטוס', '#f472b6', '#9d174d',
      '<path d="M50 74q-14-16 0-42q14 26 0 42z" fill="#fbcfe8"/><path d="M50 74q-26-6 -30-30q22 4 30 30z" fill="#f9a8d4"/><path d="M50 74q26-6 30-30q-22 4 -30 30z" fill="#f9a8d4"/>' +
      '<path d="M50 76q-30 2 -38-14q22-6 38 14zM50 76q30 2 38-14q-22-6 -38 14z" fill="#ec4899"/><ellipse cx="50" cy="80" rx="24" ry="4" fill="#065f46" opacity=".6"/>'],
    ['diya', 'Diya lamp', 'דיה', '#fbbf24', '#7c2d12',
      '<path d="M50 20q12 14 0 30q-12-16 0-30z" fill="' + LAMP + '"/><path d="M50 30q6 8 0 17q-6-9 0-17z" fill="#fb923c"/>' +
      '<path d="M22 56h56q-4 20 -28 20q-24 0 -28-20z" fill="#b45309"/><path d="M22 56h56" stroke="#fcd34d" stroke-width="4" stroke-linecap="round"/><g fill="#fcd34d"><circle cx="36" cy="64" r="2.4"/><circle cx="50" cy="66" r="2.4"/><circle cx="64" cy="64" r="2.4"/></g>'],
    ['chai', 'Chai', 'צ׳אי', '#d6a77a', '#5b3a29',
      '<path d="M40 24q-6 6 0 12t0 12M52 22q-6 6 0 12t0 12M64 24q-6 6 0 12t0 12" stroke="' + LAMP + '" stroke-width="3" fill="none" stroke-linecap="round" opacity=".8"/>' +
      '<path d="M28 50h44l-5 28h-34z" fill="' + LAMP + '"/><path d="M72 56h4a7 7 0 0 1 0 14h-6" stroke="' + LAMP + '" stroke-width="4" fill="none"/><path d="M30 52h40l-1 6h-38z" fill="#b45309"/><ellipse cx="50" cy="80" rx="26" ry="3.5" fill="' + INK + '" opacity=".35"/>'],
    ['kite', 'Kite', 'עפיפון', '#38bdf8', '#1d4ed8',
      '<path d="M50 14l24 28-24 32-24-32z" fill="#facc15"/><path d="M50 14l24 28h-48z" fill="#f43f5e"/><path d="M50 14v60M26 42h48" stroke="' + INK + '" stroke-width="1.4" opacity=".4"/>' +
      '<path d="M50 74q-8 6 -2 12q6 6 -2 12" stroke="' + LAMP + '" stroke-width="2" fill="none"/><path d="M45 82l-5-2 1 5zM52 90l5-1-2 5z" fill="#f43f5e"/>'],
    ['mango', 'Mango', 'מנגו', '#a3e635', '#3f6212',
      '<path d="M52 26q24 4 22 30q-2 24 -26 24q-22 0 -22-22q0-28 26-32z" fill="#fb923c"/><path d="M52 26q24 4 22 30q-6-20 -28-26z" fill="#facc15" opacity=".9"/>' +
      '<path d="M52 26q2-6 6-8" stroke="#3f6212" stroke-width="3" stroke-linecap="round"/><path d="M57 20q14-6 20 4q-12 6 -20-4z" fill="#22c55e"/><ellipse cx="40" cy="48" rx="5" ry="8" fill="' + LAMP + '" opacity=".35"/>'],
    ['cricket', 'Cricket', 'קריקט', '#4ade80', '#14532d',
      '<rect x="44" y="16" width="12" height="52" rx="5" fill="#fde68a" transform="rotate(32 50 42)"/><rect x="47" y="58" width="6" height="22" rx="3" fill="#92400e" transform="rotate(32 50 42)"/>' +
      '<circle cx="70" cy="70" r="10" fill="#dc2626"/><path d="M62 66q8 4 16 0M62 74q8-4 16 0" stroke="' + LAMP + '" stroke-width="1.4" fill="none" stroke-dasharray="2 2"/>'],
    ['tabla', 'Tabla', 'טבלה', '#c084fc', '#581c87',
      '<ellipse cx="36" cy="44" rx="15" ry="5" fill="#fde68a"/><path d="M21 44v24q15 8 30 0v-24" fill="#7c2d12"/><ellipse cx="36" cy="44" rx="6" ry="2" fill="' + INK + '"/>' +
      '<ellipse cx="66" cy="50" rx="13" ry="4.5" fill="#fde68a"/><path d="M53 50q-2 20 13 24q15-4 13-24" fill="#a16207"/><ellipse cx="66" cy="50" rx="5" ry="1.8" fill="' + INK + '"/>' +
      '<path d="M24 50v16M30 52v16M42 52v16M48 50v16" stroke="#fde68a" stroke-width="1.2" opacity=".6"/>'],
    ['rocket', 'Rocket', 'טיל', '#818cf8', '#1e1b4b',
      '<g fill="' + LAMP + '"><circle cx="20" cy="22" r="1.6"/><circle cx="80" cy="30" r="1.4"/><circle cx="74" cy="78" r="1.6"/><circle cx="16" cy="70" r="1.2"/></g>' +
      '<path d="M50 14q16 14 12 44h-24q-4-30 12-44z" fill="' + LAMP + '"/><circle cx="50" cy="36" r="6" fill="#38bdf8" stroke="#1e3a8a" stroke-width="2"/>' +
      '<path d="M38 50l-10 14 12-2zM62 50l10 14-12-2z" fill="#f43f5e"/><path d="M42 58h16l-3 6h-10z" fill="#94a3b8"/><path d="M44 64q6 18 12 0z" fill="#fb923c"/><path d="M47 64q3 10 6 0z" fill="#fde047"/>'],
    ['moon', 'Moon', 'ירח', '#6366f1', '#0f172a',
      '<path d="M60 18a32 32 0 1 0 22 50a26 26 0 1 1 -22-50z" fill="' + LAMP + '"/><circle cx="40" cy="50" r="4" fill="#e2d6be"/><circle cx="50" cy="66" r="3" fill="#e2d6be"/>' +
      '<path d="M74 24l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#fde047"/><path d="M82 46l1.4 3 3 1.4-3 1.4-1.4 3-1.4-3-3-1.4 3-1.4z" fill="#fde047"/>'],
    ['popcorn', 'Popcorn', 'פופקורן', '#fb7185', '#881337',
      '<g fill="' + LAMP + '"><circle cx="36" cy="34" r="9"/><circle cx="50" cy="28" r="10"/><circle cx="64" cy="34" r="9"/><circle cx="43" cy="40" r="8"/><circle cx="57" cy="40" r="8"/></g>' +
      '<path d="M28 42h44l-7 40h-30z" fill="#ef4444"/><path d="M38 42l3 40M50 42v40M62 42l-3 40" stroke="' + LAMP + '" stroke-width="5"/>'],
    ['clapper', 'Clapper', 'קלאפר', '#fcd34d', '#78350f',
      '<rect x="22" y="44" width="56" height="34" rx="4" fill="' + INK + '"/><path d="M22 44l52-14 4 10-52 14z" fill="' + INK + '"/>' +
      '<path d="M30 42l8-12M44 38l8-12M58 34l8-12" stroke="' + LAMP + '" stroke-width="5"/><rect x="28" y="54" width="44" height="3" fill="' + LAMP + '" opacity=".6"/><rect x="28" y="62" width="30" height="3" fill="' + LAMP + '" opacity=".6"/>'],
    ['cat', 'Cat', 'חתול', '#a78bfa', '#4c1d95',
      '<path d="M26 40l4-20 14 12zM74 40l-4-20-14 12z" fill="#f5d0fe"/><circle cx="50" cy="54" r="26" fill="#f5d0fe"/>' +
      '<ellipse cx="40" cy="52" rx="4" ry="6" fill="' + INK + '"/><ellipse cx="60" cy="52" rx="4" ry="6" fill="' + INK + '"/><circle cx="41" cy="50" r="1.4" fill="' + LAMP + '"/><circle cx="61" cy="50" r="1.4" fill="' + LAMP + '"/>' +
      '<path d="M47 62h6l-3 3z" fill="#f472b6"/><path d="M50 65q-3 4 -7 2M50 65q3 4 7 2M24 58h12M24 64l12-2M76 58h-12M76 64l-12-2" stroke="' + INK + '" stroke-width="1.6" fill="none" stroke-linecap="round"/>'],
    ['owl', 'Owl', 'ינשוף', '#fdba74', '#7c2d12',
      '<path d="M30 30l6 8M70 30l-6 8" stroke="#92400e" stroke-width="4" stroke-linecap="round"/><ellipse cx="50" cy="56" rx="26" ry="28" fill="#b45309"/><ellipse cx="50" cy="64" rx="15" ry="16" fill="#fde68a"/>' +
      '<circle cx="39" cy="46" r="10" fill="' + LAMP + '"/><circle cx="61" cy="46" r="10" fill="' + LAMP + '"/><circle cx="40" cy="47" r="5" fill="' + INK + '"/><circle cx="60" cy="47" r="5" fill="' + INK + '"/>' +
      '<path d="M46 54l4 6 4-6z" fill="#f59e0b"/><path d="M42 68q2 2 4 0M48 72q2 2 4 0M54 68q2 2 4 0" stroke="#b45309" stroke-width="1.6" fill="none"/>'],
    ['sun', 'Sun', 'שמש', '#fde047', '#ea580c',
      '<g stroke="' + LAMP + '" stroke-width="5" stroke-linecap="round"><path d="M50 12v10M50 78v10M12 50h10M78 50h10M23 23l7 7M70 70l7 7M77 23l-7 7M30 70l-7 7"/></g>' +
      '<circle cx="50" cy="50" r="20" fill="' + LAMP + '"/><circle cx="43" cy="47" r="2.6" fill="' + INK + '"/><circle cx="57" cy="47" r="2.6" fill="' + INK + '"/><path d="M42 56q8 7 16 0" stroke="' + INK + '" stroke-width="2.6" fill="none" stroke-linecap="round"/>'],
    ['robot', 'Robot', 'רובוט', '#5eead4', '#134e4a',
      '<path d="M50 16v10" stroke="' + LAMP + '" stroke-width="3"/><circle cx="50" cy="15" r="4" fill="#f43f5e"/><rect x="26" y="26" width="48" height="40" rx="12" fill="' + LAMP + '"/>' +
      '<rect x="32" y="36" width="36" height="16" rx="8" fill="' + INK + '"/><circle cx="42" cy="44" r="4" fill="#5eead4"/><circle cx="58" cy="44" r="4" fill="#5eead4"/>' +
      '<rect x="20" y="40" width="6" height="12" rx="3" fill="#99f6e4"/><rect x="74" y="40" width="6" height="12" rx="3" fill="#99f6e4"/><path d="M40 72h20v10H40z" fill="#99f6e4"/><path d="M44 58h12" stroke="#f43f5e" stroke-width="3" stroke-linecap="round"/>']
  ];

  var byId = {};
  LIST.forEach(function (a) { byId[a[0]] = a; });

  var n = 0;
  function render(id, cls) {
    var a = byId[id] || LIST[0];
    var g = 'av' + (++n);
    return '<svg class="avatar-svg' + (cls ? ' ' + cls : '') + '" viewBox="0 0 100 100" aria-hidden="true">' +
      '<defs><radialGradient id="' + g + '" cx=".3" cy=".25" r=".95"><stop offset="0" stop-color="' + a[3] + '"/><stop offset="1" stop-color="' + a[4] + '"/></radialGradient></defs>' +
      '<rect width="100" height="100" rx="26" fill="url(#' + g + ')"/>' + a[5] + '</svg>';
  }

  INDTV.Avatars = {
    ids: LIST.map(function (a) { return a[0]; }),
    render: render,
    name: function (id) { var a = byId[id]; if (!a) return ''; return INDTV.I18n && INDTV.I18n.lang() === 'he' ? a[2] : a[1]; },
    color: function (id) { var a = byId[id] || LIST[0]; return a[3]; },
    random: function () { return LIST[Math.floor(Math.random() * LIST.length)][0]; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
