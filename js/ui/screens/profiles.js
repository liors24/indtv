/* INDTV — "Who's watching?": profile picker, sign-up for new people, avatar chooser and profile editing.
 * Shown on every launch before anything else loads, so each person lands in their own INDTV. */
(function (root) {
  'use strict';
  var INDTV = root.INDTV = root.INDTV || {};
  var U = INDTV.Util, t = function (k) { return INDTV.I18n.t(k); };

  INDTV.I18n.extend({
    en: {
      pfWho: 'Who’s watching?', pfAdd: 'New profile', pfManage: 'Manage profiles', pfDone: 'Done',
      pfWelcome: 'Welcome to INDTV', pfWelcomeBody: 'Create a profile and INDTV keeps your favourites, recordings and history apart from everyone else at home.',
      pfNewTitle: 'New profile', pfName: 'Your name', pfNameHint: 'Press OK to type', pfPick: 'Pick your character',
      pfCreate: 'Create profile', pfNext: 'Next', pfBack: 'Back', pfCancel: 'Cancel', pfEdit: 'Edit profile', pfSave: 'Save',
      pfDelete: 'Delete profile', pfDeleteTitle: 'Delete this profile?', pfDeleteBody: 'Its favourites, history and recordings will be removed from this TV.',
      pfNeedName: 'Type a name first', pfNameTaken: 'Someone already uses that name', pfSwitch: 'Switch profile',
      pfSwitchRecTitle: 'A recording is running', pfSwitchRecBody: 'Switching profile stops it. Switch anyway?',
      pfHello: 'Hi', pfEditHint: 'Choose a profile to edit'
    },
    he: {
      pfWho: 'מי צופה?', pfAdd: 'משתמש חדש', pfManage: 'ניהול פרופילים', pfDone: 'סיום',
      pfWelcome: 'ברוכים הבאים ל־INDTV', pfWelcomeBody: 'צרו פרופיל, ו־INDTV ישמור לכם מועדפים, הקלטות והיסטוריה משלכם, בנפרד מכל השאר בבית.',
      pfNewTitle: 'פרופיל חדש', pfName: 'השם שלך', pfNameHint: 'לחצו OK כדי להקליד', pfPick: 'בחרו דמות',
      pfCreate: 'יצירת פרופיל', pfNext: 'המשך', pfBack: 'חזרה', pfCancel: 'ביטול', pfEdit: 'עריכת פרופיל', pfSave: 'שמירה',
      pfDelete: 'מחיקת הפרופיל', pfDeleteTitle: 'למחוק את הפרופיל?', pfDeleteBody: 'המועדפים, ההיסטוריה וההקלטות שלו יימחקו מהטלוויזיה.',
      pfNeedName: 'צריך להקליד שם קודם', pfNameTaken: 'כבר יש פרופיל בשם הזה', pfSwitch: 'החלפת פרופיל',
      pfSwitchRecTitle: 'יש הקלטה פעילה', pfSwitchRecBody: 'החלפת פרופיל תעצור אותה. להחליף בכל זאת?',
      pfHello: 'היי', pfEditHint: 'בחרו פרופיל לעריכה'
    }
  });

  function avatar(id, cls) { return INDTV.Avatars.render(id, cls); }

  var Gate = {
    el: null, resolve: null, manage: false, handler: null,

    /** Resolves once a profile is active. */
    open: function () {
      return new Promise(function (resolve) {
        Gate.resolve = resolve;
        Gate.el = U.el('div', { class: 'pf-gate', role: 'dialog', 'aria-modal': 'true' });
        Gate.el.appendChild(U.el('div', { class: 'pf-room' }));
        Gate.body = U.el('div', { class: 'pf-body' });
        Gate.el.appendChild(Gate.body);
        document.body.appendChild(Gate.el);
        document.documentElement.classList.add('pf-open');
        INDTV.Focus.scope = Gate.el;
        Gate.handler = { onBack: function () { return Gate.back(); } };
        INDTV.Focus.pushHandler(Gate.handler);
        if (INDTV.Profiles.list().length) Gate.picker(); else Gate.signup({ first: true });
      });
    },

    close: function () {
      INDTV.Focus.popHandler(Gate.handler);
      INDTV.Focus.scope = null;
      document.documentElement.classList.remove('pf-open');
      var el = Gate.el;
      el.classList.add('is-leaving');
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 420);
    },

    back: function () {
      if (Gate.view === 'signup' || Gate.view === 'edit') {
        if (INDTV.Profiles.list().length) Gate.picker();
        return true;
      }
      if (Gate.manage) { Gate.manage = false; Gate.picker(); return true; }
      return true; // nothing behind this screen
    },

    enter: function (p) {
      INDTV.Profiles.use(p.id).then(function () {
        var tile = Gate.body.querySelector('[data-pid="' + p.id + '"]');
        if (tile) tile.classList.add('is-chosen');
        Gate.el.classList.add('is-chosen');
        setTimeout(function () { Gate.close(); Gate.resolve(p); }, 520);
      });
    },

    /* ---------- "Who's watching?" ---------- */
    picker: function () {
      Gate.view = 'picker';
      var list = INDTV.Profiles.list();
      var last = INDTV.Profiles.lastId();
      Gate.body.innerHTML = '';
      Gate.body.appendChild(U.el('div', { class: 'pf-brand', html: INDTV.wordmark() }));
      Gate.body.appendChild(U.el('h1', { class: 'pf-title', text: Gate.manage ? t('pfEditHint') : t('pfWho') }));
      var row = U.el('div', { class: 'pf-row' + (list.length > 5 ? ' is-many' : ''), 'data-fgroup': 'pf-row' });
      var focusEl = null;
      list.forEach(function (p) {
        var tile = U.el('button', { class: 'fx pf-tile', type: 'button', dataset: { pid: p.id, key: 'pf:' + p.id } });
        tile.innerHTML = '<span class="pf-av">' + avatar(p.avatar) + (Gate.manage ? '<span class="pf-pen">' + '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>' + '</span>' : '') + '</span>' +
          '<span class="pf-name" dir="auto">' + U.escapeHtml(p.name) + '</span>';
        tile.addEventListener('click', function () { if (Gate.manage) Gate.edit(p); else Gate.enter(p); });
        row.appendChild(tile);
        if (p.id === last) focusEl = tile;
      });
      if (!Gate.manage) {
        var add = U.el('button', { class: 'fx pf-tile pf-add', type: 'button', dataset: { key: 'pf:add' } });
        add.innerHTML = '<span class="pf-av pf-av-add"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg></span><span class="pf-name">' + U.escapeHtml(t('pfAdd')) + '</span>';
        add.addEventListener('click', function () { Gate.signup({}); });
        row.appendChild(add);
      }
      Gate.body.appendChild(row);
      var manage = INDTV.UI.button(Gate.manage ? t('pfDone') : t('pfManage'), Gate.manage ? 'check' : 'settings', null, { cls: 'btn-ghost pf-manage' });
      manage.addEventListener('click', function () { Gate.manage = !Gate.manage; Gate.picker(); });
      Gate.body.appendChild(U.el('div', { class: 'pf-foot' }, [manage]));
      Gate.anim();
      INDTV.Focus.focus(focusEl || row.querySelector('.fx'));
    },

    /* ---------- sign up / edit ---------- */
    signup: function (opts) { Gate.form({ mode: 'signup', first: !!opts.first }); },
    edit: function (p) { Gate.form({ mode: 'edit', profile: p }); },

    form: function (o) {
      Gate.view = o.mode;
      var p = o.profile || {};
      var chosen = p.avatar || INDTV.Avatars.random();
      Gate.body.innerHTML = '';
      var preview = U.el('div', { class: 'pf-preview' });
      var previewName = U.el('div', { class: 'pf-preview-name', dir: 'auto' });
      var paint = function () {
        preview.innerHTML = avatar(chosen, 'pf-big');
        previewName.textContent = (input.value || '').trim() || t('pfName');
        previewName.classList.toggle('is-empty', !(input.value || '').trim());
      };
      var input = U.el('input', { class: 'fx pf-input', type: 'text', id: 'pf-name', maxlength: '24', autocomplete: 'off', spellcheck: 'false',
        placeholder: t('pfNameHint'), 'aria-label': t('pfName'), dataset: { key: 'pf:name' } });
      input.value = p.name || '';
      ['input', 'change'].forEach(function (ev) { input.addEventListener(ev, paint); });

      var grid = U.el('div', { class: 'pf-grid', 'data-fgroup': 'pf-avatars' });
      INDTV.Avatars.ids.forEach(function (id) {
        var b = U.el('button', { class: 'fx pf-pick' + (id === chosen ? ' is-on' : ''), type: 'button', 'aria-label': INDTV.Avatars.name(id), dataset: { av: id, key: 'pf:av:' + id } });
        b.innerHTML = avatar(id);
        b.addEventListener('focus', function () { preview.innerHTML = avatar(id, 'pf-big'); });
        b.addEventListener('blur', function () { preview.innerHTML = avatar(chosen, 'pf-big'); });
        b.addEventListener('click', function () {
          chosen = id;
          Array.prototype.forEach.call(grid.children, function (x) { x.classList.toggle('is-on', x === b); });
          paint();
          INDTV.Focus.focus(save);
        });
        grid.appendChild(b);
      });

      var save = INDTV.UI.button(o.mode === 'edit' ? t('pfSave') : t('pfCreate'), 'check', null, { cls: 'btn-primary pf-save' });
      save.addEventListener('click', function () {
        var name = (input.value || '').trim();
        if (!name) { INDTV.UI.toast(t('pfNeedName')); INDTV.Focus.focus(input); return; }
        var clash = INDTV.Profiles.list().some(function (x) { return x.name.toLowerCase() === name.toLowerCase() && x.id !== p.id; });
        if (clash) { INDTV.UI.toast(t('pfNameTaken')); INDTV.Focus.focus(input); return; }
        if (o.mode === 'edit') {
          INDTV.Profiles.update(p.id, { name: name, avatar: chosen });
          Gate.manage = false;
          Gate.picker();
          return;
        }
        Gate.enter(INDTV.Profiles.create(name, chosen));
      });
      var actions = [save];
      if (!o.first) {
        var cancel = INDTV.UI.button(t('pfCancel'), null, null, { cls: 'btn-ghost' });
        cancel.addEventListener('click', function () { Gate.back(); });
        actions.push(cancel);
      }
      if (o.mode === 'edit') {
        var del = INDTV.UI.button(t('pfDelete'), 'trash', null, { cls: 'btn-ghost btn-danger' });
        del.addEventListener('click', function () {
          UIconfirm(t('pfDeleteTitle'), p.name + ' — ' + t('pfDeleteBody'), t('pfDelete'), function () {
            INDTV.Profiles.remove(p.id);
            Gate.manage = INDTV.Profiles.list().length > 0 && Gate.manage;
            if (INDTV.Profiles.list().length) Gate.picker(); else Gate.signup({ first: true });
          }, true);
        });
        actions.push(del);
      }

      var copy = U.el('div', { class: 'pf-copy' }, [
        U.el('div', { class: 'pf-brand', html: INDTV.wordmark() }),
        U.el('h1', { class: 'pf-title pf-title-left', text: o.first ? t('pfWelcome') : (o.mode === 'edit' ? t('pfEdit') : t('pfNewTitle')) }),
        o.first ? U.el('p', { class: 'pf-lead', text: t('pfWelcomeBody') }) : null,
        U.el('label', { class: 'pf-label', for: 'pf-name', text: t('pfName') }),
        input,
        U.el('div', { class: 'pf-label', text: t('pfPick') }),
        grid,
        U.el('div', { class: 'pf-actions' }, actions)
      ]);
      Gate.body.appendChild(U.el('div', { class: 'pf-form' }, [copy, U.el('div', { class: 'pf-stage' }, [preview, previewName])]));
      paint();
      Gate.anim();
      INDTV.Focus.focus(o.mode === 'edit' ? grid.querySelector('.is-on') || input : input);
    },

    anim: function () {
      Gate.body.classList.remove('is-in');
      void Gate.body.offsetWidth;
      Gate.body.classList.add('is-in');
    }
  };

  /* A small confirm dialog (also used when switching profile during a recording). */
  function UIconfirm(title, body, okLabel, onOk, danger) {
    var prevScope = INDTV.Focus.scope;
    var back = document.activeElement;
    var wrap = U.el('div', { class: 'pf-confirm', role: 'alertdialog' });
    var ok = INDTV.UI.button(okLabel, null, null, { cls: danger ? 'btn-ghost btn-danger' : 'btn-primary' });
    var no = INDTV.UI.button(t('pfCancel'), null, null, { cls: 'btn-ghost' });
    var panel = U.el('div', { class: 'pf-confirm-panel' }, [U.el('h2', { text: title }), U.el('p', { text: body }), U.el('div', { class: 'pf-actions' }, [ok, no])]);
    wrap.appendChild(panel);
    document.body.appendChild(wrap);
    var h = { onBack: function () { done(); return true; } };
    INDTV.Focus.pushHandler(h);
    INDTV.Focus.scope = wrap;
    function done() {
      INDTV.Focus.popHandler(h);
      INDTV.Focus.scope = prevScope;
      if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
      if (back) INDTV.Focus.focus(back);
    }
    ok.addEventListener('click', function () { done(); onOk(); });
    no.addEventListener('click', done);
    INDTV.Focus.focus(no);
  }
  INDTV.UI = INDTV.UI || {};
  INDTV.UI.confirm = UIconfirm;

  INDTV.ProfileGate = Gate;
})(typeof window !== 'undefined' ? window : globalThis);
