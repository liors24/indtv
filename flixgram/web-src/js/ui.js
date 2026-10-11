// Shared overlay primitives: toast, confirm dialog, option sheet.
import { h, svg, ICON } from './util.js';
import { pushScope, popScope } from './focus.js';

let toastTimer = 0;
export function toast(text, ms) {
  const t = document.getElementById('toast');
  t.textContent = text;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), ms || 2600);
}

const modalStack = [];

export function modalOpen() {
  return modalStack.length > 0;
}

export function closeModal() {
  const m = modalStack.pop();
  if (!m) return false;
  m.el.classList.remove('on');
  popScope(m.panel);
  setTimeout(() => m.el.remove(), 260);
  if (m.onclose) m.onclose();
  return true;
}

function openModal(panel, onclose, cls) {
  const el = h('div.modal' + (cls ? '.' + cls : ''), null, h('div.modal-scrim'), panel);
  document.getElementById('overlay').appendChild(el);
  modalStack.push({ el, panel, onclose });
  requestAnimationFrame(() => el.classList.add('on'));
  pushScope(panel);
  return el;
}

export function confirmDialog(title, body, okLabel, onOk, opts) {
  opts = opts || {};
  const ok = h('div.btn.fx' + (opts.danger ? '.danger' : '.primary'), { onselect: () => { closeModal(); onOk(); } }, h('span', { text: okLabel }));
  const cancel = h('div.btn.fx.is-default', { onselect: () => closeModal() }, h('span', { text: 'ביטול' }));
  const panel = h('div.dialog', null, h('h2', { text: title }), body ? h('p', { text: body }) : null, h('div.dialog-actions', null, ok, cancel));
  openModal(panel);
}

// A side sheet with a list of choices. options: [{label, sub, value, selected}]
export function sheet(title, options, onPick) {
  const list = h('div.sheet-list');
  options.forEach((o) => {
    const row = h('div.sheet-row.fx' + (o.selected ? '.is-default.sel' : ''), {
      onselect: () => { closeModal(); onPick(o.value); },
    }, h('span.sheet-label', { text: o.label }), o.sub ? h('span.sheet-sub', { text: o.sub }) : null, o.selected ? svg(ICON.check, 26) : null);
    list.appendChild(row);
  });
  const panel = h('div.sheet', { 'data-vscroll': '0' }, h('div.sheet-inner', null, h('h2', { text: title }), list));
  openModal(panel, null, 'side');
}
