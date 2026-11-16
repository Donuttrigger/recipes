// Small helpers shared by every screen.
export const $ = (sel, el = document) => el.querySelector(sel);
export const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

let toastTimer;
export function toast(msg, ms = 2600) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

// Bottom sheet (pop-up panel). Returns the panel element and a close function.
export function sheet(html) {
  const bg = document.createElement('div');
  bg.className = 'sheet-bg';
  bg.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${html}</div>`;
  const close = () => bg.remove();
  bg.addEventListener('click', (e) => { if (e.target === bg) close(); });
  document.body.appendChild(bg);
  return { el: bg.firstElementChild, close };
}

export function busy(button, on, label) {
  if (on) {
    button.dataset.label = button.innerHTML;
    button.innerHTML = `<span class="spinner"></span> ${label || ''}`;
    button.disabled = true;
  } else {
    button.innerHTML = button.dataset.label || button.innerHTML;
    button.disabled = false;
  }
}

const EMOJI = ['🍝', '🥗', '🍲', '🥘', '🍛', '🥞', '🍰', '🌮', '🍜', '🥧', '🍳', '🥙'];
export function foodEmoji(title = '') {
  let h = 0;
  for (const c of title) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return EMOJI[h % EMOJI.length];
}
