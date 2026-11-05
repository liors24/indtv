/* INDTV — typing dock.
 * Text fields never open the TV keyboard just because they are highlighted. Pressing OK on a field
 * opens a large, zoomed copy of it at the top of the screen; the on-screen keyboard appears below it,
 * the rest of the page stays where it is. Enter / Save keeps the text, Back cancels. */
(function (root) {
  'use strict';
  var INDTV = root.INDTV = root.INDTV || {};
  var U = INDTV.Util, t = function (k) { return INDTV.I18n.t(k); };

  function isTextField(el) {
    if (!el || !el.tagName) return false;
    if (el.tagName === 'TEXTAREA') return true;
    if (el.tagName !== 'INPUT') return false;
    return ['text', 'search', 'url', 'password', 'email', 'number', 'tel', ''].indexOf((el.getAttribute('type') || '').toLowerCase()) >= 0;
  }
  function labelFor(field) {
    var lbl = field.id ? document.querySelector('label[for="' + field.id + '"]') : null;
    return (lbl && lbl.textContent) || field.getAttribute('aria-label') || field.getAttribute('placeholder') || '';
  }

  var Dock = {
    el: null, field: null, input: null, handler: null,

    isTextField: isTextField,
    isOpen: function () { return !!(Dock.el && !Dock.el.hidden); },

    open: function (field) {
      if (!isTextField(field) || Dock.isOpen()) return;
      Dock.field = field;
      if (!Dock.el) { Dock.el = U.el('div', { class: 'edit-dock', hidden: true, role: 'dialog', 'aria-modal': 'true' }); document.body.appendChild(Dock.el); }
      var multi = field.tagName === 'TEXTAREA';
      Dock.el.innerHTML = '';
      var panel = U.el('div', { class: 'edit-panel' });
      panel.appendChild(U.el('div', { class: 'edit-label', text: labelFor(field) }));
      var input = multi
        ? U.el('textarea', { class: 'fx edit-input edit-area', rows: '5', spellcheck: 'false', dataset: { key: 'dock:input' } })
        : U.el('input', { class: 'fx edit-input', type: field.type === 'password' ? 'password' : 'text', autocomplete: 'off', spellcheck: 'false', dataset: { key: 'dock:input' } });
      input.value = field.value;
      var dir = field.getAttribute('dir');
      if (dir) input.setAttribute('dir', dir);
      if (field.placeholder) input.placeholder = field.placeholder;
      if (field.maxLength > 0) input.maxLength = field.maxLength;
      input.addEventListener('keydown', function (e) {
        if ((e.key === 'Enter' || e.keyCode === 13) && !multi) { e.preventDefault(); e.stopPropagation(); Dock.save(); }
      });
      Dock.input = input;
      panel.appendChild(input);
      panel.appendChild(U.el('div', { class: 'edit-actions' }, [
        INDTV.UI.button(t('save'), 'check', function () { Dock.save(); }, { cls: 'btn-primary', key: 'dock:save' }),
        INDTV.UI.button(t('cancel'), null, function () { Dock.close(); }, { cls: 'btn-ghost', key: 'dock:cancel' })
      ]));
      panel.appendChild(U.el('p', { class: 'edit-hint', text: INDTV.I18n.lang() === 'he' ? 'הקלידו במקלדת · Enter לשמירה · חזרה לביטול' : 'Type with the keyboard · Enter to save · Back to cancel' }));
      Dock.el.appendChild(panel);
      Dock.el.hidden = false;
      Dock._prevScope = INDTV.Focus.scope;
      INDTV.Focus.scope = Dock.el;
      Dock.handler = { onBack: function () { Dock.close(); return true; } };
      INDTV.Focus.pushHandler(Dock.handler);
      // real focus on the zoomed field: this is what brings up the TV keyboard
      setTimeout(function () {
        try { input.focus(); var n = input.value.length; input.setSelectionRange(n, n); } catch (e) { input.focus(); }
      }, 30);
    },

    save: function () {
      var f = Dock.field;
      if (f && Dock.input) {
        f.value = Dock.input.value;
        f.dispatchEvent(new Event('input', { bubbles: true }));
        f.dispatchEvent(new Event('change', { bubbles: true }));
      }
      Dock.close();
    },

    close: function () {
      if (!Dock.isOpen()) return;
      try { Dock.input.blur(); } catch (e) { /* ignore */ }
      Dock.el.hidden = true;
      INDTV.Focus.scope = Dock._prevScope || null;
      INDTV.Focus.popHandler(Dock.handler);
      var f = Dock.field;
      Dock.field = null; Dock.input = null;
      if (f && f.isConnected) INDTV.Focus.focus(f);
    },

    start: function () {
      // Highlighting a field never starts typing: page fields stay read-only until OK opens the dock.
      document.addEventListener('focusin', function (e) {
        var el = e.target;
        if (isTextField(el) && !(Dock.el && Dock.el.contains(el))) el.readOnly = true;
      }, true);
      document.addEventListener('click', function (e) {
        var el = e.target;
        if (isTextField(el) && !(Dock.el && Dock.el.contains(el))) { e.preventDefault(); Dock.open(el); }
      }, true);
    }
  };

  INDTV.EditDock = Dock;
})(typeof window !== 'undefined' ? window : globalThis);
