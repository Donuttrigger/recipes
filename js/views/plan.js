// Plan: a week at a time, with meals (recipes or anything else) and chores for each day.
// The same plan shows up in the iPhone Calendar app through a subscribed calendar.
import { $, $$, esc, toast, sheet, busy, foodEmoji } from '../lib/dom.js';
import { store, addMeal, deleteMeal, dayString, calendarLink, newCalendarLink } from '../db.js';
import { dueDays } from '../lib/chores.js';
import { choreSheet, tick } from './chores.js';

export const tab = 'plan';
export const MEALS = [
  { id: 'breakfast', label: 'Breakfast', icon: '🍳' },
  { id: 'lunch', label: 'Lunch', icon: '🥪' },
  { id: 'dinner', label: 'Dinner', icon: '🍽️' },
];
const mealInfo = (id) => MEALS.find((m) => m.id === id) || MEALS[2];
const state = { offset: 0 }; // weeks away from this week, remembered while the app is open

function weekStart(offset) {
  const d = new Date();
  d.setHours(12, 0, 0, 0); // midday, so daylight-saving changes never skip a day
  d.setDate(d.getDate() - d.getDay() + offset * 7); // weeks start on Sunday, like the iPhone calendar
  return d;
}

const fmt = (d, opts) => d.toLocaleDateString(undefined, opts);

function weekTitle(start) {
  if (state.offset === 0) return 'This week';
  if (state.offset === 1) return 'Next week';
  if (state.offset === -1) return 'Last week';
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return `${fmt(start, { month: 'short', day: 'numeric' })} – ${fmt(end, { month: 'short', day: 'numeric' })}`;
}

function mealRow(m) {
  const info = mealInfo(m.meal);
  const recipe = m.recipe_id && store.recipes.find((r) => r.id === m.recipe_id);
  const name = recipe
    ? `<a href="#/recipe/${recipe.id}">${esc(m.title)}</a>`
    : `<span>${esc(m.title)}</span>`;
  return `
    <li data-id="${m.id}">
      <span class="mi" title="${info.label}">${info.icon}</span>
      <span class="mt"><span class="ml">${info.label}</span>${name}${m.note ? `<span class="mn">${esc(m.note)}</span>` : ''}</span>
      <button class="x" data-act="del" aria-label="Remove">×</button>
    </li>`;
}

// A chore on a day. Only its next due date can be ticked; later repeats are shown faded.
function choreRow(c, key, today) {
  const late = c.next_due < today;
  const current = key === c.next_due || (key === today && late);
  return `
    <li data-chore="${c.id}" class="${current ? '' : 'later'}">
      <span class="mi">🧹</span>
      <span class="mt" data-act="chore-edit"><span class="ml ${late && key === today ? 'late' : ''}">${late && key === today ? 'Overdue chore' : 'Chore'}</span><span class="cn">${esc(c.title)}</span></span>
      ${current ? `<button class="tick" data-act="tick" aria-label="Mark “${esc(c.title)}” done"></button>` : ''}
    </li>`;
}

// Bottom sheet for choosing what to eat. Used here and from a recipe's page.
export function pickMeal({ day, recipe } = {}) {
  let meal = 'dinner';
  const s = sheet(`
    <h2>${recipe ? `Plan “${esc(recipe.title)}”` : 'Add to the plan'}</h2>
    <label for="pday" style="margin-top:0">Day</label>
    <input type="date" id="pday" value="${day || dayString(new Date())}">
    <div class="seg" id="pmeal">${MEALS.map((m) => `<button type="button" data-meal="${m.id}" class="${m.id === meal ? 'on' : ''}">${m.icon} ${m.label}</button>`).join('')}</div>
    ${recipe ? `
      <label for="pnote">Note <span class="hint">(optional)</span></label>
      <input id="pnote" placeholder="e.g. double batch">
      <div class="row" style="margin-top:18px"><button id="cancel">Cancel</button><button class="primary" id="go">Add to plan</button></div>`
    : `
      <input type="search" id="pq" placeholder="Search your recipes" style="margin-top:14px">
      <ul class="pickrecipes" id="plist"></ul>
      <label for="pother">Or something else</label>
      <form class="shop-add" id="pform">
        <input id="pother" placeholder="e.g. Leftovers, Pizza night" autocomplete="off" enterkeyhint="done">
        <button class="primary" type="submit">Add</button>
      </form>
      <button class="block" id="pchore" style="margin-top:6px">🧹 Add a chore instead</button>`}`);

  $('#pmeal', s.el).addEventListener('click', (e) => {
    const b = e.target.closest('[data-meal]');
    if (!b) return;
    meal = b.dataset.meal;
    $$('[data-meal]', s.el).forEach((x) => x.classList.toggle('on', x === b));
  });

  const save = async (row) => {
    const day = $('#pday', s.el).value;
    if (!day) return toast('Pick a day first');
    s.close();
    try {
      await addMeal({ day, meal, ...row });
      toast(`Added to ${fmt(new Date(day + 'T12:00'), { weekday: 'long', month: 'short', day: 'numeric' })}`);
    } catch (e) { toast(e.message); }
  };

  if (recipe) {
    $('#cancel', s.el).onclick = s.close;
    $('#go', s.el).onclick = () => save({ recipe_id: recipe.id, title: recipe.title, note: $('#pnote', s.el).value.trim() });
    return;
  }

  const drawList = () => {
    const q = $('#pq', s.el).value.trim().toLowerCase();
    const list = store.recipes
      .filter((r) => !q || q.split(/\s+/).every((w) => [r.title, ...(r.tags || [])].join(' ').toLowerCase().includes(w)))
      .sort((a, b) => (b.favorite - a.favorite) || a.title.localeCompare(b.title));
    $('#plist', s.el).innerHTML = list.length
      ? list.map((r) => `<li><button type="button" data-rid="${r.id}"><span class="pe">${foodEmoji(r.title)}</span>${r.favorite ? '★ ' : ''}${esc(r.title)}</button></li>`).join('')
      : `<li class="muted small" style="padding:10px 0">${store.recipes.length ? 'No recipe matches.' : 'No recipes yet.'}</li>`;
  };
  $('#pchore', s.el).onclick = () => { const d = $('#pday', s.el).value; s.close(); choreSheet({ day: d }); };
  $('#pq', s.el).addEventListener('input', drawList);
  $('#plist', s.el).addEventListener('click', (e) => {
    const b = e.target.closest('[data-rid]');
    const r = b && store.recipes.find((x) => x.id === b.dataset.rid);
    if (r) save({ recipe_id: r.id, title: r.title });
  });
  $('#pform', s.el).addEventListener('submit', (e) => {
    e.preventDefault();
    const title = $('#pother', s.el).value.trim();
    if (title) save({ title });
  });
  drawList();
}

function calendarSheet() {
  const s = sheet(`
    <h2>📅 See the plan in your iPhone Calendar</h2>
    <p class="small muted" style="margin-top:-6px">Meals and chores show up as all-day events in their own calendar.
    It updates by itself (the iPhone checks about once an hour). Do this once on each iPhone.
    For chore alerts at 8 AM, turn <b>Remove Alerts</b> off when subscribing.</p>
    <div id="cbody"><p class="center muted"><span class="spinner"></span></p></div>`);

  const draw = (url) => {
    const webcal = url.replace(/^https:/, 'webcal:');
    $('#cbody', s.el).innerHTML = `
      <a class="btn primary block" href="${esc(webcal)}" style="display:flex">Subscribe on this iPhone</a>
      <p class="small muted">Tap it, then tap <b>Subscribe</b> and <b>Add</b>.</p>
      <button class="block" id="copy">Copy the link instead</button>
      <p class="small muted">Then on the iPhone: <b>Settings → Apps → Calendar → Calendar Accounts → Add Account →
      Other → Add Subscribed Calendar</b>, paste the link, tap <b>Next</b>, then <b>Save</b>.</p>
      <p class="small muted">Keep the link private: anyone who has it can see the meal plan (but can't change it).</p>
      <button class="ghost small" id="reset">Stop the old link and make a new one</button>
      <div class="row" style="margin-top:12px"><button id="done">Done</button></div>`;
    $('#done', s.el).onclick = s.close;
    $('#copy', s.el).onclick = async (e) => {
      try { await navigator.clipboard.writeText(url); toast('Link copied'); }
      catch { prompt('Copy this link:', url); }
      e.target.blur();
    };
    $('#reset', s.el).onclick = async (e) => {
      if (!confirm('Make a new link? Any iPhone using the old one stops updating and has to subscribe again.')) return;
      busy(e.target, true);
      try { draw(await newCalendarLink()); toast('New link made'); }
      catch (err) { busy(e.target, false); toast(err.message); }
    };
  };

  calendarLink().then(draw).catch((e) => {
    $('#cbody', s.el).innerHTML = `<p class="err">${esc(e.message)}</p>`;
  });
}

export function render(view) {
  const draw = () => {
    if (!store.mealsReady) {
      view.innerHTML = `
        <h1>Meal plan</h1>
        <div class="empty"><div class="big">🛠️</div>
        <p>The calendar needs a one-time database update before it works.
        Run <b>supabase-calendar.sql</b> in Supabase's SQL Editor (see SETUP.md), then reopen the app.</p></div>`;
      return;
    }
    const start = weekStart(state.offset);
    const today = dayString(new Date());
    const openChores = store.choresReady ? store.chores.filter((c) => !c.done_at) : [];
    let html = '';
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const key = dayString(d);
      const meals = store.meals.filter((m) => m.day === key)
        .sort((a, b) => MEALS.indexOf(mealInfo(a.meal)) - MEALS.indexOf(mealInfo(b.meal)));
      const chores = openChores.filter((c) => dueDays(c, key, key).length || (key === today && c.next_due < today));
      html += `
        <section class="day ${key === today ? 'today' : ''} ${key < today ? 'past' : ''}">
          <div class="dh">
            <span class="dn">${key === today ? 'Today' : fmt(d, { weekday: 'long' })}</span>
            <span class="dd">${fmt(d, { month: 'short', day: 'numeric' })}</span>
            <button class="ghost small add" data-day="${key}" aria-label="Add a meal">+ Add</button>
          </div>
          ${meals.length || chores.length ? `<ul class="meals">${meals.map(mealRow).join('')}${chores.map((c) => choreRow(c, key, today)).join('')}</ul>` : ''}
        </section>`;
    }
    view.innerHTML = `
      <div class="topbar"><h1>Plan</h1>
        <button class="ghost small" id="cal" aria-label="Show in iPhone Calendar">📅 iPhone Calendar</button></div>
      <div class="weeknav">
        <button id="prev" aria-label="Previous week">‹</button>
        <button class="wt" id="now">${weekTitle(start)}</button>
        <button id="next" aria-label="Next week">›</button>
      </div>
      ${html}`;
  };

  // The screen's element is shared with every other screen, so remove this on the way out.
  const onClick = async (e) => {
    const ce = e.target.closest('[data-act="chore-edit"]');
    if (ce) return choreSheet(store.chores.find((c) => c.id === ce.closest('li').dataset.chore));
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.act === 'tick') {
      const c = store.chores.find((x) => x.id === t.closest('li').dataset.chore);
      t.textContent = '✓'; t.classList.add('on');
      if (c) await tick(c);
      return;
    }
    if (t.id === 'prev') { state.offset--; draw(); }
    else if (t.id === 'next') { state.offset++; draw(); }
    else if (t.id === 'now') { state.offset = 0; draw(); }
    else if (t.id === 'cal') calendarSheet();
    else if (t.dataset.day) pickMeal({ day: t.dataset.day });
    else if (t.dataset.act === 'del') {
      const id = t.closest('li[data-id]').dataset.id;
      try { await deleteMeal(id); } catch (err) { toast(err.message); }
    }
  };
  view.addEventListener('click', onClick);

  draw();
  return {
    update: (what) => ['meals', 'recipes', 'chores'].includes(what) && draw(),
    cleanup: () => view.removeEventListener('click', onClick),
  };
}
