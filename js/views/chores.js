// Shared chores list: one-time and repeating jobs (garbage day, furnace filter, pool...).
// Ticking one off moves a repeating chore to its next date. They also show on the Plan tab
// and in the subscribed iPhone calendar.
import { $, esc, toast, sheet, busy } from '../lib/dom.js';
import { store, dayString, saveChore, deleteChore, completeChore, undoChore } from '../db.js';
import { REPEATS, IDEAS, repeatValue, repeatLabel, parseDay } from '../lib/chores.js';
import { calendarSheet } from './plan.js';

export const tab = 'chores';

const fmtDay = (s, opts = { weekday: 'short', month: 'short', day: 'numeric' }) => parseDay(s).toLocaleDateString(undefined, opts);

function addDays(s, n) {
  const d = parseDay(s);
  d.setDate(d.getDate() + n);
  return dayString(d);
}

export function whenLabel(day, today = dayString(new Date())) {
  if (day === today) return 'Today';
  if (day === addDays(today, 1)) return 'Tomorrow';
  if (day === addDays(today, -1)) return 'Yesterday';
  return fmtDay(day);
}

// Add or change a chore. Pass a chore to edit it, or { day } to start a new one on that day.
export function choreSheet(chore = {}) {
  const editing = !!chore.id;
  const s = sheet(`
    <h2>${editing ? 'Change chore' : 'New chore'}</h2>
    ${editing ? '' : `<div class="chips" id="ideas">${IDEAS.map((i, n) => `<button type="button" class="chip" data-idea="${n}">${esc(i.title)}</button>`).join('')}</div>`}
    <label for="ctitle" style="margin-top:${editing ? 0 : 6}px">What needs doing</label>
    <input id="ctitle" value="${esc(chore.title || '')}" placeholder="e.g. Change furnace filter" autocomplete="off">
    <div class="row">
      <div><label for="cday">${editing ? 'Next due' : 'First day'}</label>
        <input type="date" id="cday" value="${chore.next_due || chore.day || dayString(new Date())}"></div>
      <div><label for="crep">Repeat</label>
        <select id="crep">${REPEATS.map((r) => `<option value="${r.value}" ${r.value === repeatValue(chore) ? 'selected' : ''}>${r.label}</option>`).join('')}
        ${chore.repeat_unit && !REPEATS.some((r) => r.value === repeatValue(chore)) ? `<option value="${repeatValue(chore)}" selected>${esc(repeatLabel(chore))}</option>` : ''}</select></div>
    </div>
    <label for="cnotes">Notes <span class="hint">(optional)</span></label>
    <input id="cnotes" value="${esc(chore.notes || '')}" placeholder="e.g. 16x25x1 filter, garage shelf">
    <div class="row" style="margin-top:18px"><button id="cancel">Cancel</button><button class="primary" id="save">Save</button></div>
    ${editing ? `<button class="danger block" id="del" style="margin-top:10px">Delete chore</button>` : ''}`);

  $('#ideas', s.el)?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-idea]');
    if (!b) return;
    const idea = IDEAS[+b.dataset.idea];
    $('#ctitle', s.el).value = idea.title;
    $('#crep', s.el).value = idea.repeat;
    if (/day$/i.test(idea.title)) toast('Set the first day to your next pickup day');
  });

  $('#cancel', s.el).onclick = s.close;
  $('#save', s.el).onclick = async (e) => {
    const title = $('#ctitle', s.el).value.trim();
    const day = $('#cday', s.el).value;
    const [every, unit] = $('#crep', s.el).value.split(' ');
    if (!title) return toast('Give the chore a name');
    if (!day) return toast('Pick a day');
    const row = { id: chore.id, title, notes: $('#cnotes', s.el).value.trim(), repeat_unit: unit || null, repeat_every: +every || 1 };
    // A new date or repeat starts the pattern again from that day
    if (!editing || day !== chore.next_due || repeatValue(row) !== repeatValue(chore)) {
      row.anchor = day;
      row.next_due = day;
    }
    busy(e.target, true);
    try {
      await saveChore(row);
      s.close();
      toast(editing ? 'Chore saved' : `Added for ${whenLabel(day)}`);
    } catch (err) { busy(e.target, false); toast(err.message); }
  };
  $('#del', s.el)?.addEventListener('click', async () => {
    if (!confirm(`Delete “${chore.title}” for both of you?`)) return;
    s.close();
    try { await deleteChore(chore.id); toast('Chore deleted'); } catch (err) { toast(err.message); }
  });
  if (!editing) setTimeout(() => $('#ctitle', s.el).focus(), 50);
}

// Ticks a chore off and says when it's due next
export async function tick(c) {
  try {
    await completeChore(c.id);
    const now = store.chores.find((x) => x.id === c.id);
    toast(now && !now.done_at && now.repeat_unit ? `Done! Next: ${whenLabel(now.next_due)}` : 'Done!');
  } catch (err) { toast(err.message); }
}

function row(c, today) {
  const late = c.next_due < today;
  return `
    <li data-id="${c.id}">
      <button class="box" data-act="tick" aria-label="Mark “${esc(c.title)}” done"></button>
      <span class="txt" data-act="edit">${esc(c.title)}
        <span class="from ${late ? 'late' : ''}">${late ? 'Overdue · ' : ''}${whenLabel(c.next_due, today)}${c.repeat_unit ? ` · ${esc(repeatLabel(c).toLowerCase())}` : ''}${c.notes ? ` · ${esc(c.notes)}` : ''}</span></span>
    </li>`;
}

function doneRow(c) {
  return `
    <li class="done" data-id="${c.id}">
      <span class="box">✓</span>
      <span class="txt">${esc(c.title)}<span class="from">Done${c.last_done_by ? ` by ${esc(c.last_done_by)}` : ''}${!c.done_at && c.repeat_unit ? ` · next ${whenLabel(c.next_due)}` : ''}</span></span>
      <button class="ghost small" data-act="undo">Undo</button>
    </li>`;
}

export function render(view) {
  const draw = () => {
    if (!store.choresReady) {
      view.innerHTML = `
        <h1>Chores</h1>
        <div class="empty"><div class="big">🛠️</div>
        <p>Chores need a one-time database update before they work.
        Run <b>supabase-chores.sql</b> in Supabase's SQL Editor (see SETUP.md), then reopen the app.</p></div>`;
      return;
    }
    const today = dayString(new Date());
    const week = addDays(today, 6);
    const open = store.chores.filter((c) => !c.done_at);
    const groups = [
      ['Overdue', open.filter((c) => c.next_due < today)],
      ['Today', open.filter((c) => c.next_due === today)],
      ['This week', open.filter((c) => c.next_due > today && c.next_due <= week)],
      ['Later', open.filter((c) => c.next_due > week)],
    ].filter(([, list]) => list.length);
    const doneToday = store.chores.filter((c) => c.last_done_at && dayString(new Date(c.last_done_at)) === today);

    view.innerHTML = `
      <div class="topbar"><h1>Chores</h1><button class="primary small" id="add">+ Add</button></div>
      ${!open.length && !doneToday.length ? `
        <div class="empty"><div class="big">🧹</div>
        <p>No chores yet. Add things like garbage day, the furnace filter or pool jobs, and they'll repeat by themselves.</p>
        <button class="primary" id="add2">Add your first chore</button></div>` : ''}
      ${groups.map(([name, list]) => `
        <h2 class="${name === 'Overdue' ? 'late' : ''}">${name}</h2>
        <ul class="shop chores">${list.map((c) => row(c, today)).join('')}</ul>`).join('')}
      ${doneToday.length ? `<h2>Done today</h2><ul class="shop chores">${doneToday.map(doneRow).join('')}</ul>` : ''}
      <button class="block" id="cal" style="margin-top:22px">📅 Show chores in the iPhone Calendar</button>
      <p class="small muted">Chores also show on the Plan tab next to your meals.</p>`;
  };

  const onClick = async (e) => {
    if (e.target.closest('#add, #add2')) return choreSheet();
    if (e.target.closest('#cal')) return calendarSheet();
    const act = e.target.closest('[data-act]');
    const li = e.target.closest('li[data-id]');
    const c = li && store.chores.find((x) => x.id === li.dataset.id);
    if (!act || !c) return;
    if (act.dataset.act === 'tick') {
      li.classList.add('done');
      act.textContent = '✓';
      await tick(c);
    } else if (act.dataset.act === 'edit') choreSheet(c);
    else if (act.dataset.act === 'undo') {
      try { await undoChore(c.id); toast('Put back'); } catch (err) { toast(err.message); }
    }
  };
  view.addEventListener('click', onClick);

  draw();
  return {
    update: (what) => what === 'chores' && draw(),
    cleanup: () => view.removeEventListener('click', onClick),
  };
}
