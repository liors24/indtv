/* INDTV — favorite shows (programmes). A show is remembered by its title; INDTV scans the
 * programme guide of every channel to find when and where it is on, and announces it when it starts. */
(function (root) {
  'use strict';
  var INDTV = root.INDTV = root.INDTV || {};
  var Store = INDTV.Store, Bus = INDTV.Bus;

  function epg() { return INDTV.EpgRepository; }
  function keyOf(title) { return epg().titleKey(title || ''); }

  var ShowFavorites = {
    state: new INDTV.StateFlow([]),
    _alerted: {},

    load: function () {
      return Store.get('shows').then(function (rows) {
        ShowFavorites.state.set(Array.isArray(rows) ? rows.filter(function (r) { return r && r.key && r.title; }) : []);
      });
    },
    all: function () { return ShowFavorites.state.get(); },
    has: function (title) {
      var k = keyOf(title);
      return !!k && ShowFavorites.all().some(function (r) { return r.key === k; });
    },
    /** Add or remove a show. Returns true when it was added. */
    toggle: function (programme, channel) {
      var k = keyOf(programme.title);
      if (!k) return false;
      var rows = ShowFavorites.all().slice();
      var i = -1;
      rows.forEach(function (r, idx) { if (r.key === k) i = idx; });
      if (i >= 0) rows.splice(i, 1);
      else rows.unshift({ key: k, title: programme.title, channelId: channel ? channel.id : null, channelName: channel ? channel.name : null, addedAt: Date.now() });
      ShowFavorites.state.set(rows);
      Store.set('shows', rows);
      Bus.emit('shows', rows);
      return i < 0;
    },
    remove: function (key) {
      var rows = ShowFavorites.all().filter(function (r) { return r.key !== key; });
      ShowFavorites.state.set(rows);
      Store.set('shows', rows);
      Bus.emit('shows', rows);
    },

    /**
     * Where is this show now or next? Prefers the channel it was saved from, then scans all channels.
     * @returns {{live:boolean, channel:Object, programme:Object}|null}
     */
    status: function (fav) {
      var CR = INDTV.ChannelRepository;
      var t = Date.now();
      var best = null;
      function consider(ch) {
        var list = ch ? epg().listFor(ch) : null;
        if (!list) return;
        for (var i = 0; i < list.length; i++) {
          var p = list[i];
          if (p.stop <= t) continue;
          if (p._k === undefined) p._k = keyOf(p.title);
          if (p._k !== fav.key) continue;
          var live = p.start <= t;
          if (!best || (live && !best.live) || (live === best.live && p.start < best.programme.start)) {
            best = { live: live, channel: ch, programme: p };
          }
          return;   // first future airing on this channel is enough
        }
      }
      if (fav.channelId) consider(CR.get(fav.channelId));
      if (best && best.live) return best;
      CR.all().forEach(consider);
      return best;
    },

    /** Announce favorite shows that just started (checked every minute). */
    startWatcher: function () {
      setInterval(function () {
        var t = Date.now();
        ShowFavorites.all().forEach(function (fav) {
          var st = ShowFavorites.status(fav);
          if (!st || !st.live) return;
          var id = fav.key + '@' + st.programme.start;
          if (ShowFavorites._alerted[id] || t - st.programme.start > 3 * 60000) return;
          ShowFavorites._alerted[id] = true;
          INDTV.UI.toast('★ ' + fav.title + ' ' + INDTV.I18n.t('showStarting') + st.channel.name);
          Bus.emit('show-starting', st);
        });
      }, 60000);
    }
  };

  INDTV.ShowFavorites = ShowFavorites;
})(typeof window !== 'undefined' ? window : globalThis);
