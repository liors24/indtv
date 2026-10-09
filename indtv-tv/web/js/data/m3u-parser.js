/* INDTV — M3U channel playlist parser.
 * Input is untrusted text. Output is a list of normalized entries; nothing in the text is executed.
 * Distinguishes a channel playlist (.m3u with #EXTINF entries) from a single HLS stream manifest (.m3u8). */
(function (root) {
  'use strict';
  var INDTV = root.INDTV = root.INDTV || {};
  var U = INDTV.Util;

  var LIMITS = { name: 200, attr: 2048, url: 4096, entries: 50000 };

  var HLS_MARKERS = /^#EXT-X-(TARGETDURATION|MEDIA-SEQUENCE|STREAM-INF|VERSION|KEY|MAP|PLAYLIST-TYPE|INDEPENDENT-SEGMENTS|MEDIA:|PART-INF|SERVER-CONTROL)/m;

  /** Classify playlist text: 'channels' | 'hls' | 'invalid'. */
  function classify(text) {
    if (typeof text !== 'string') return 'invalid';
    var head = text.replace(/^﻿/, '').slice(0, 200000);
    if (!/^\s*#EXTM3U/.test(head)) return 'invalid';
    var hasExtinf = /^#EXTINF/m.test(head);
    if (HLS_MARKERS.test(head)) {
      // A media/master manifest of one stream. EXTINF lines there are segments, not channels.
      return 'hls';
    }
    return hasExtinf ? 'channels' : 'invalid';
  }

  /** Split "#EXTINF:-1 a="b" c="d",Display Name" into attribute text and display name,
   *  using the first comma that is outside double quotes. */
  function splitExtinf(line) {
    var body = line.slice(line.indexOf(':') + 1);
    var inQuote = false;
    for (var i = 0; i < body.length; i++) {
      var ch = body.charAt(i);
      if (ch === '"') inQuote = !inQuote;
      else if (ch === ',' && !inQuote) return { attrs: body.slice(0, i), title: body.slice(i + 1) };
    }
    return { attrs: body, title: '' };
  }

  function parseAttrs(text) {
    var attrs = {};
    var re = /([A-Za-z0-9_\-]{1,40})\s*=\s*"([^"]*)"/g;
    var m, count = 0;
    while ((m = re.exec(text)) && count < 40) {
      attrs[m[1].toLowerCase()] = U.cleanText(m[2], LIMITS.attr);
      count++;
    }
    return attrs;
  }

  /** Pull "(1080p)", "[Not 24/7]", "[Geo-blocked]" decorations out of a display name. */
  function parseTitle(raw) {
    var title = U.cleanText(raw, LIMITS.name);
    var quality = null, notAlways = false, geoBlocked = false;
    var q = title.match(/\((\d{3,4}p|4K|UHD|FHD|HD|SD)\)/i);
    if (q) quality = q[1].toLowerCase() === '4k' ? '2160p' : q[1];
    if (/\[\s*not\s*24\/7\s*\]/i.test(title)) notAlways = true;
    if (/\[\s*geo[-\s]?blocked\s*\]/i.test(title)) geoBlocked = true;
    var clean = title
      .replace(/\((\d{3,4}p|4K|UHD|FHD|HD|SD)\)/ig, '')
      .replace(/\[[^\]]{0,40}\]/g, '')
      .replace(/\s+/g, ' ').trim();
    return { name: clean || title, quality: quality, notAlways: notAlways, geoBlocked: geoBlocked };
  }

  function splitGroups(group) {
    if (!group) return [];
    return group.split(/[;|]/).map(function (g) { return U.cleanText(g, 60); })
      .filter(function (g) { return g && !/^undefined$/i.test(g); });
  }

  /**
   * Parse a channel playlist.
   * @returns {{kind:string, entries:Array, stats:Object, header:Object}}
   */
  function parse(text, sourceMeta) {
    sourceMeta = sourceMeta || {};
    var kind = classify(text);
    var stats = {
      lines: 0, extinf: 0, entries: 0, skippedNoUrl: 0, skippedBadUrl: 0, unsupportedScheme: 0,
      withTvgId: 0, withTvgName: 0, withLogo: 0, withGroup: 0, withName: 0
    };
    if (kind !== 'channels') return { kind: kind, entries: [], stats: stats, header: {} };

    var lines = text.replace(/^﻿/, '').split(/\r?\n/);
    stats.lines = lines.length;
    var header = {};
    var headerMatch = lines[0] ? parseAttrs(lines[0]) : {};
    if (headerMatch['x-tvg-url'] || headerMatch['url-tvg']) {
      header.epgUrl = U.safeHttpUrl(headerMatch['x-tvg-url'] || headerMatch['url-tvg']);
    }

    var entries = [];
    var pending = null;
    var vlcopt = {};
    var extgrp = null;

    for (var i = 1; i < lines.length && entries.length < LIMITS.entries; i++) {
      var line = lines[i].trim();
      if (!line) continue;

      if (line.indexOf('#EXTINF') === 0) {
        stats.extinf++;
        if (pending) stats.skippedNoUrl++;
        var parts = splitExtinf(line);
        var attrs = parseAttrs(parts.attrs);
        var t = parseTitle(parts.title || attrs['tvg-name'] || '');
        pending = { attrs: attrs, title: t, rawTitle: U.cleanText(parts.title, LIMITS.name) };
        vlcopt = {};
        extgrp = null;
        continue;
      }
      if (line.indexOf('#EXTVLCOPT:') === 0) {
        var opt = line.slice(11);
        var eq = opt.indexOf('=');
        if (eq > 0) {
          var k = opt.slice(0, eq).trim().toLowerCase();
          var v = U.cleanText(opt.slice(eq + 1), 512);
          if (k === 'http-user-agent') vlcopt.userAgent = v;
          if (k === 'http-referrer' || k === 'http-referer') vlcopt.referrer = v;
        }
        continue;
      }
      if (line.indexOf('#EXTGRP:') === 0) {
        extgrp = U.cleanText(line.slice(8), 60);
        continue;
      }
      if (line.charAt(0) === '#') continue;

      // URL line
      if (!pending) continue;
      var rawUrl = U.cleanText(line, LIMITS.url);
      var url = U.safeHttpUrl(rawUrl, LIMITS.url);
      if (!url) {
        if (/^(rtmp|rtsp|udp|rtp|mms|srt):/i.test(rawUrl)) stats.unsupportedScheme++;
        else stats.skippedBadUrl++;
        pending = null;
        continue;
      }

      var a = pending.attrs;
      var tvgId = a['tvg-id'] ? U.cleanText(a['tvg-id'], 120) : null;
      var tvgName = a['tvg-name'] ? U.cleanText(a['tvg-name'], LIMITS.name) : null;
      var logo = a['tvg-logo'] ? U.safeHttpUrl(a['tvg-logo'], LIMITS.url) : null;
      var groupRaw = a['group-title'] || extgrp || null;
      var name = pending.title.name || tvgName || '';
      if (!name) { pending = null; stats.skippedBadUrl++; continue; }

      if (tvgId) stats.withTvgId++;
      if (tvgName) stats.withTvgName++;
      if (a['tvg-logo']) stats.withLogo++;
      if (groupRaw) stats.withGroup++;
      stats.withName++;

      entries.push({
        tvgId: tvgId,
        tvgName: tvgName,
        name: name,
        rawTitle: pending.rawTitle,
        logoUrl: logo,
        rawLogo: a['tvg-logo'] || null,
        groupTitle: groupRaw ? U.cleanText(groupRaw, 200) : null,
        groups: splitGroups(groupRaw),
        language: a['tvg-language'] ? U.cleanText(a['tvg-language'], 80) : null,
        country: a['tvg-country'] ? U.cleanText(a['tvg-country'], 80) : null,
        quality: pending.title.quality,
        notAlways: pending.title.notAlways,
        geoBlocked: pending.title.geoBlocked,
        userAgent: vlcopt.userAgent || a['user-agent'] || null,
        referrer: vlcopt.referrer || a['http-referrer'] || null,
        url: url,
        sourceId: sourceMeta.id || null,
        sourceName: sourceMeta.name || null,
        order: entries.length
      });
      stats.entries++;
      pending = null;
      vlcopt = {};
      extgrp = null;
    }
    if (pending) stats.skippedNoUrl++;
    return { kind: kind, entries: entries, stats: stats, header: header };
  }

  /** Stable logical identity: tvg-id (feed suffix removed) → normalized tvg-name → normalized name. */
  function identityOf(entry) {
    if (entry.tvgId) {
      var base = entry.tvgId.split('@')[0].toLowerCase();
      if (base) return 'id:' + base;
    }
    var n = U.normalizeName(entry.tvgName || '');
    if (n) return 'nm:' + n;
    var d = U.normalizeName(entry.name || '');
    if (d) return 'nm:' + d;
    return 'url:' + U.hash(entry.url);
  }

  INDTV.M3UParser = { parse: parse, classify: classify, identityOf: identityOf, parseTitle: parseTitle };
})(typeof window !== 'undefined' ? window : globalThis);
