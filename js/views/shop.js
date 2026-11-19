// Shared shopping lists (Grocery, Costco, ...) as tabs. Items group under store sections
// (guessed from their words) and can be dragged into any order. Ticks show on the other phone too.
import { $, $$, esc, toast, sheet } from '../lib/dom.js';
import {
  store, addShopping, toggleShopping, deleteShopping, clearChecked, moveShopping, setSection, reorderShopping,
  addList, renameList, deleteList,
} from '../db.js';
import { SECTIONS, sectionOf } from '../lib/sections.js';

export const tab = 'shop';
const SORTABLE = 'https://cdn.jsdelivr.net/npm/sortablejs@1.15.6/modular/sortable.esm.js';

// The tab you were on last (also used as the default list when adding from a recipe)
export function lastListId() {
  try { return localStorage.getItem('rc:shopTab'); } catch { return null; }
}
export function rememberList(id) {
  try { localStorage.setItem('rc:shopTab', id); } catch { /* private mode */ }
}
export function currentList() {
  const id = lastListId();
  return store.lists.find((l) => l.id === id) || store.lists[0] || null;
}
const listOf = (i) => i.list_id || store.lists[0]?.id;

function row(i, ready) {
  return `
    <li class="${i.checked ? 'done' : ''}" data-id="${i.id}">
      <span class="box" data-act="toggle">${i.checked ? '✓' : ''}</span>
      <span class="txt" data-act="toggle">${esc(i.text)}${i.recipe_title ? `<span class="from">for ${esc(i.recipe_title)}</span>` : ''}</span>
      ${ready
        ? `<button class="more" data-act="menu" aria-label="Move, change section or delete">⋯</button>${i.checked ? '' : '<span class="drag" aria-label="Drag to reorder">☰</span>'}`
        : '<button class="x" data-act="del" aria-label="Remove">×</button>'}
    </li>`;
}

function itemMenu(item) {
  const others = store.lists.filter((l) => l.id !== listOf(item));
  const cur = sectionOf(item);
  const s = sheet(`
    <h2 style="margin-bottom:4px">${esc(item.text)}</h2>
    ${others.length ? `<label style="margin-top:12px">Move to</label>
      <div class="chips wrap">${others.map((l) => `<button class="chip" data-move="${l.id}">${esc(l.name)}</button>`).join('')}</div>` : ''}
    <label style="margin-top:12px">Section</label>
    <div class="chips wrap">${SECTIONS.map((sec) => `<button class="chip ${sec === cur ? 'on' : ''}" data-sec="${esc(sec)}">${esc(sec)}</button>`).join('')}</div>
    <div class="row" style="margin-top:18px"><button id="cancel">Close</button><button class="danger" id="del">Delete</button></div>`);
  $('#cancel', s.el).onclick = s.close;
  s.el.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    try {
      if (b.dataset.move) {
        s.close();
        await moveShopping(item.id, b.dataset.move);
        toast(`Moved to ${store.lists.find((l) => l.id === b.dataset.move)?.name}`);
      } else if (b.dataset.sec) {
        s.close();
        await setSection(item.id, b.dataset.sec);
      } else if (b.id === 'del') {
        s.close();
        await deleteShopping(item.id);
      }
    } catch (err) { toast(err.message); }
  });
}

function newListSheet(onDone) {
  const s = sheet(`
    <h2>New list</h2>
    <form class="shop-add" id="nf"><input id="nn" placeholder="e.g. Costco, Walmart" autocomplete="off" enterkeyhint="done">
    <button class="primary" type="submit">Add</button></form>
    <button class="block" id="cancel">Cancel</button>`);
  $('#cancel', s.el).onclick = s.close;
  $('#nf', s.el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('#nn', s.el).value.trim();
    if (!name) return;
    s.close();
    try { const l = await addList(name); rememberList(l.id); onDone(); } catch (err) { toast(err.message); }
  });
  setTimeout(() => $('#nn', s.el).focus(), 50);
}

function listMenu(list, onDone) {
  const n = store.shopping.filter((i) => listOf(i) === list.id).length;
  const s = sheet(`
    <h2>${esc(list.name)}</h2>
    <form class="shop-add" id="rf"><input id="rn" value="${esc(list.name)}" autocomplete="off" enterkeyhint="done">
    <button class="primary" type="submit">Rename</button></form>
    ${store.lists.length > 1 ? `<button class="danger block" id="del">Delete this list${n ? ` and its ${n} item${n === 1 ? '' : 's'}` : ''}</button>` : ''}
    <button class="block" id="cancel" style="margin-top:8px">Close</button>`);
  $('#cancel', s.el).onclick = s.close;
  $('#rf', s.el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('#rn', s.el).value.trim();
    s.close();
    if (name && name !== list.name) try { await renameList(list.id, name); } catch (err) { toast(err.message); }
  });
  $('#del', s.el)?.addEventListener('click', async () => {
    if (!confirm(`Delete “${list.name}”${n ? ` and the ${n} item${n === 1 ? '' : 's'} on it` : ''} for both of you?`)) return;
    s.close();
    try { await deleteList(list.id); onDone(); toast('List deleted'); } catch (err) { toast(err.message); }
  });
}

export function render(view) {
  let dragging = false;
  let pending = false;
  let sortables = [];

  view.innerHTML = `
    <h1>Shopping</h1>
    <div class="chips listtabs" id="tabs"></div>
    <form class="shop-add" id="add">
      <input id="item" placeholder="Add an item, like “milk”" autocomplete="off" enterkeyhint="done">
      <button class="primary" type="submit">Add</button>
    </form>
    <div id="list"></div>`;

  const draw = () => {
    if (dragging) { pending = true; return; }
    const ready = store.listsReady && store.lists.length > 0;
    const list = ready ? currentList() : null;
    const items = ready ? store.shopping.filter((i) => listOf(i) === list.id) : store.shopping;

    $('#tabs', view).innerHTML = ready ? store.lists.map((l) => {
      const n = store.shopping.filter((i) => listOf(i) === l.id && !i.checked).length;
      return `<button class="chip ${l.id === list.id ? 'on' : ''}" data-list="${l.id}">${esc(l.name)}${n ? ` <span class="n">${n}</span>` : ''}</button>`;
    }).join('') + '<button class="chip add" id="newlist" aria-label="New list">+</button>' : '';
    $('#item', view).placeholder = ready ? `Add to ${list.name}, like “milk”` : 'Add an item, like “milk”';

    const todo = items.filter((i) => !i.checked);
    const done = items.filter((i) => i.checked);
    const groups = SECTIONS.map((sec) => [sec, todo.filter((i) => sectionOf(i) === sec)]);
    $('#list', view).innerHTML = !items.length
      ? `<div class="empty"><div class="big">🛒</div><p>${ready ? `${esc(list.name)} is empty.` : 'Your list is empty.'} Add items here, or from any recipe.</p></div>`
      : `${todo.length
          ? groups.map(([sec, list2]) => list2.length
            ? `<div class="secgroup"><h3 class="sec">${esc(sec)}</h3>
               <ul class="shop" data-sec="${esc(sec)}">${list2.map((i) => row(i, ready)).join('')}</ul></div>` : '').join('')
          : `<p class="muted center">All done! 🎉</p>`}
         ${done.length ? `
           <div class="row" style="margin:22px 0 8px"><h2 style="margin:0">In the cart (${done.length})</h2>
           <button class="shrink ghost" id="clear">Clear</button></div>
           <ul class="shop">${done.map((i) => row(i, ready)).join('')}</ul>` : ''}`;

    sortables.forEach((x) => x.destroy());
    sortables = [];
    if (ready && todo.length > 1) setupDrag();
  };

  // Drag by the ☰ handle, within a section or into another one (which changes the item's section)
  async function setupDrag() {
    let Sortable;
    try { ({ default: Sortable } = await import(SORTABLE)); } catch { return; } // offline: no dragging
    $$('ul.shop[data-sec]', view).forEach((ul) => {
      sortables.push(Sortable.create(ul, {
        group: 'shop',
        handle: '.drag',
        forceFallback: true, // same touch-style dragging on every device (iPhone Safari's native drag is unreliable)
        fallbackTolerance: 3,
        animation: 150,
        delay: 0,
        onStart: () => { dragging = true; view.classList.add('dragging'); },
        onEnd: async (e) => {
          dragging = false;
          view.classList.remove('dragging');
          const li = e.item;
          const item = store.shopping.find((i) => i.id === li.dataset.id);
          const pos = (el) => store.shopping.find((i) => i.id === el?.dataset.id)?.position;
          const before = pos(li.previousElementSibling);
          const after = pos(li.nextElementSibling);
          const position = before != null && after != null ? (before + after) / 2
            : before != null ? before + 1000 : after != null ? after - 1000 : Date.now();
          const sec = e.to.dataset.sec;
          if (item && (e.oldIndex !== e.newIndex || e.from !== e.to)) {
            try { await reorderShopping(item.id, position, sec !== sectionOf(item) ? sec : null); } catch (err) { toast(err.message); }
          }
          if (pending || e.from !== e.to) { pending = false; draw(); }
        },
      }));
    });
  }

  $('#add', view).addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = $('#item', view);
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    try { await addShopping([{ text }], currentList()?.id); } catch (err) { toast(err.message); input.value = text; }
  });

  // Tabs: tap to switch, press and hold (or right-click) to rename or delete
  const tabs = $('#tabs', view);
  let holdTimer = null;
  let held = false;
  tabs.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('[data-list]');
    if (!b) return;
    held = false;
    holdTimer = setTimeout(() => {
      held = true;
      const l = store.lists.find((x) => x.id === b.dataset.list);
      if (l) listMenu(l, draw);
    }, 550);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => tabs.addEventListener(ev, () => clearTimeout(holdTimer)));
  tabs.addEventListener('contextmenu', (e) => e.preventDefault());
  tabs.addEventListener('click', (e) => {
    if (held) { held = false; return; }
    if (e.target.closest('#newlist')) return newListSheet(draw);
    const b = e.target.closest('[data-list]');
    if (b) { rememberList(b.dataset.list); draw(); }
  });

  $('#list', view).addEventListener('click', async (e) => {
    try {
      if (e.target.id === 'clear') return await clearChecked(store.listsReady ? currentList()?.id : null);
      const li = e.target.closest('li[data-id]');
      const act = e.target.closest('[data-act]');
      if (!li || !act) return;
      const item = store.shopping.find((i) => i.id === li.dataset.id);
      if (!item) return;
      if (act.dataset.act === 'menu') itemMenu(item);
      else if (act.dataset.act === 'del') await deleteShopping(item.id);
      else await toggleShopping(item.id, !item.checked);
    } catch (err) { toast(err.message); }
  });

  draw();
  return {
    update: (what) => what === 'shopping' && draw(),
    cleanup: () => { sortables.forEach((x) => x.destroy()); clearTimeout(holdTimer); },
  };
}
