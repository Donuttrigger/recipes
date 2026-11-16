// Shared shopping list. Ticking an item shows up on the other phone too.
import { $, esc, toast } from '../lib/dom.js';
import { store, addShopping, toggleShopping, deleteShopping, clearChecked } from '../db.js';

export const tab = 'shop';

function row(i) {
  return `
    <li class="${i.checked ? 'done' : ''}" data-id="${i.id}">
      <span class="box">${i.checked ? '✓' : ''}</span>
      <span class="txt" data-act="toggle">${esc(i.text)}${i.recipe_title ? `<span class="from">for ${esc(i.recipe_title)}</span>` : ''}</span>
      <button class="x" data-act="del" aria-label="Remove">×</button>
    </li>`;
}

export function render(view) {
  view.innerHTML = `
    <h1>Shopping list</h1>
    <form class="shop-add" id="add">
      <input id="item" placeholder="Add an item, like “milk”" autocomplete="off" enterkeyhint="done">
      <button class="primary" type="submit">Add</button>
    </form>
    <div id="list"></div>`;

  const draw = () => {
    const todo = store.shopping.filter((i) => !i.checked);
    const done = store.shopping.filter((i) => i.checked);
    $('#list', view).innerHTML = !store.shopping.length
      ? `<div class="empty"><div class="big">🛒</div><p>Your list is empty. Add items here, or from any recipe.</p></div>`
      : `${todo.length ? `<ul class="shop">${todo.map(row).join('')}</ul>` : `<p class="muted center">All done! 🎉</p>`}
         ${done.length ? `
           <div class="row" style="margin:22px 0 8px"><h2 style="margin:0">In the cart (${done.length})</h2>
           <button class="shrink ghost" id="clear">Clear</button></div>
           <ul class="shop">${done.map(row).join('')}</ul>` : ''}`;
  };

  $('#add', view).addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = $('#item', view);
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    try { await addShopping([{ text }]); } catch (err) { toast(err.message); input.value = text; }
  });

  $('#list', view).addEventListener('click', async (e) => {
    try {
      if (e.target.id === 'clear') return await clearChecked();
      const li = e.target.closest('li[data-id]');
      if (!li) return;
      const id = li.dataset.id;
      if (e.target.closest('[data-act="del"]')) return await deleteShopping(id);
      const item = store.shopping.find((i) => i.id === id);
      if (item) await toggleShopping(id, !item.checked);
    } catch (err) { toast(err.message); }
  });

  draw();
  return { update: (what) => what === 'shopping' && draw() };
}
