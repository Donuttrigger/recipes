// Everything that talks to the shared database (Supabase) lives here.
// Screens call these functions and listen with onChange() for updates.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const configured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
const sb = configured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
const PHOTO_BUCKET = 'recipe-photos';

// ---- change notifications -------------------------------------------------
const listeners = new Set();
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
const emit = (what) => listeners.forEach((fn) => fn(what));

// ---- offline cache (so recipes still open with bad signal in the shop) -----
function cache(key, val) {
  try {
    if (val === undefined) return JSON.parse(localStorage.getItem('rc:' + key));
    localStorage.setItem('rc:' + key, JSON.stringify(val));
  } catch { return null; }
}

export const store = {
  recipes: cache('recipes') || [],
  shopping: cache('shopping') || [],
  lists: cache('lists') || [],
  listsReady: true, // false until supabase-shopping-lists.sql has been run
  meals: cache('meals') || [],
  mealsReady: true, // false until the calendar part of the database is set up
  chores: cache('chores') || [],
  choresReady: true, // false until supabase-chores.sql has been run
};

function check({ data, error }) {
  if (error) throw new Error(error.message || 'Something went wrong');
  return data;
}

// ---- sign in ----------------------------------------------------------------
export async function getSession() {
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session;
}
export function onAuth(fn) {
  if (sb) sb.auth.onAuthStateChange((_event, session) => fn(session));
}
export async function signIn(email, password) {
  check(await sb.auth.signInWithPassword({ email, password }));
}
export async function signOut() {
  await sb.auth.signOut();
  store.recipes = []; store.shopping = []; store.meals = []; store.chores = []; store.lists = [];
  cache('recipes', []); cache('shopping', []); cache('meals', []); cache('chores', []); cache('lists', []);
}

// ---- recipes ----------------------------------------------------------------
export async function loadRecipes() {
  store.recipes = check(await sb.from('recipes').select('*').order('title'));
  cache('recipes', store.recipes);
  emit('recipes');
  return store.recipes;
}

export const getRecipe = (id) => store.recipes.find((r) => r.id === id);

const RECIPE_FIELDS = ['title', 'description', 'photo_url', 'servings', 'prep_time', 'cook_time',
  'ingredients', 'steps', 'notes', 'source_url', 'tags', 'favorite'];

export async function saveRecipe(recipe) {
  const row = { updated_at: new Date().toISOString() };
  for (const f of RECIPE_FIELDS) if (recipe[f] !== undefined) row[f] = recipe[f];
  const q = recipe.id
    ? sb.from('recipes').update(row).eq('id', recipe.id)
    : sb.from('recipes').insert(row);
  const saved = check(await q.select().single());
  store.recipes = [...store.recipes.filter((r) => r.id !== saved.id), saved]
    .sort((a, b) => a.title.localeCompare(b.title));
  cache('recipes', store.recipes);
  emit('recipes');
  return saved;
}

export async function deleteRecipe(id) {
  check(await sb.from('recipes').delete().eq('id', id));
  store.recipes = store.recipes.filter((r) => r.id !== id);
  cache('recipes', store.recipes);
  emit('recipes');
}

// ---- photos -----------------------------------------------------------------
async function shrinkImage(file, max = 1600) {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return await new Promise((res) => canvas.toBlob((b) => res(b || file), 'image/jpeg', 0.85));
  } catch {
    return file;
  }
}

export async function uploadPhoto(file) {
  const blob = await shrinkImage(file);
  const id = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const path = `${id}.jpg`;
  check(await sb.storage.from(PHOTO_BUCKET).upload(path, blob, { contentType: 'image/jpeg' }));
  return sb.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
}

// ---- import from a website ---------------------------------------------------
export async function fetchPage(url) {
  return check(await sb.rpc('fetch_recipe_page', { page_url: url }));
}

// ---- shopping lists -----------------------------------------------------------
// Several lists (Grocery, Costco, ...) shown as tabs. Each item has a list, a store section
// ('' = guessed from its words) and a position for drag-to-reorder. Until
// supabase-shopping-lists.sql has been run, store.listsReady is false and there's one list.
function saveShop() {
  store.shopping.sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.created_at.localeCompare(b.created_at));
  cache('shopping', store.shopping);
  emit('shopping');
}
function saveLists() {
  store.lists.sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at));
  cache('lists', store.lists);
  emit('shopping');
}

export async function loadLists() {
  const { data, error } = await sb.from('shopping_lists').select('*');
  if (error) {
    if (/shopping_lists/.test(error.message || '')) { store.listsReady = false; emit('shopping'); return []; }
    throw new Error(error.message);
  }
  store.listsReady = true;
  store.lists = data;
  saveLists();
  return store.lists;
}

export async function loadShopping() {
  store.shopping = check(await sb.from('shopping_items').select('*').order('created_at'));
  saveShop();
  return store.shopping;
}

// items: [{ text, recipe_title? }]. listId is ignored until the lists exist in the database.
export async function addShopping(items, listId) {
  let rows = items;
  if (store.listsReady && store.lists.length) {
    const list = listId || store.lists[0].id;
    const start = Date.now();
    rows = items.map((it, i) => ({ ...it, list_id: list, position: start + i }));
  }
  const saved = check(await sb.from('shopping_items').insert(rows).select());
  store.shopping = [...store.shopping.filter((i) => !saved.some((r) => r.id === i.id)), ...saved];
  saveShop();
}

async function updateItem(id, fields) {
  const item = store.shopping.find((i) => i.id === id);
  if (item) { Object.assign(item, fields); saveShop(); } // update the screen right away
  check(await sb.from('shopping_items').update(fields).eq('id', id));
}
export const toggleShopping = (id, checked) => updateItem(id, { checked });
export const moveShopping = (id, listId) => updateItem(id, { list_id: listId, position: Date.now() });
export const setSection = (id, section) => updateItem(id, { section });
export const reorderShopping = (id, position, section) => updateItem(id, section ? { position, section } : { position });

export async function deleteShopping(id) {
  store.shopping = store.shopping.filter((i) => i.id !== id);
  saveShop();
  check(await sb.from('shopping_items').delete().eq('id', id));
}

// Clears ticked items from one list (or everything, before lists exist)
export async function clearChecked(listId) {
  const hit = (i) => i.checked && (!listId || i.list_id === listId);
  store.shopping = store.shopping.filter((i) => !hit(i));
  saveShop();
  let q = sb.from('shopping_items').delete().eq('checked', true);
  if (listId) q = q.eq('list_id', listId);
  check(await q);
}

export async function addList(name) {
  const position = Math.max(-1, ...store.lists.map((l) => l.position)) + 1;
  const row = check(await sb.from('shopping_lists').insert({ name, position }).select().single());
  store.lists.push(row);
  saveLists();
  return row;
}
export async function renameList(id, name) {
  const l = store.lists.find((x) => x.id === id);
  if (l) { l.name = name; saveLists(); }
  check(await sb.from('shopping_lists').update({ name }).eq('id', id));
}
// Deletes the list and everything on it
export async function deleteList(id) {
  store.lists = store.lists.filter((l) => l.id !== id);
  store.shopping = store.shopping.filter((i) => i.list_id !== id);
  saveLists();
  saveShop();
  check(await sb.from('shopping_lists').delete().eq('id', id));
}

// ---- meal plan (calendar) ------------------------------------------------------
const MEAL_ORDER = ['breakfast', 'lunch', 'dinner'];
function saveMeals() {
  store.meals.sort((a, b) => a.day.localeCompare(b.day)
    || MEAL_ORDER.indexOf(a.meal) - MEAL_ORDER.indexOf(b.meal)
    || a.created_at.localeCompare(b.created_at));
  cache('meals', store.meals);
  emit('meals');
}

// Dates are plain "YYYY-MM-DD" strings in the phone's own time zone.
export function dayString(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function loadMeals() {
  const since = new Date();
  since.setDate(since.getDate() - 60);
  const { data, error } = await sb.from('meal_plan').select('*').gte('day', dayString(since)).order('day');
  if (error) {
    // Table not created yet: the calendar screen explains the one-time setup.
    if (/meal_plan/.test(error.message || '')) { store.mealsReady = false; emit('meals'); return []; }
    throw new Error(error.message);
  }
  store.mealsReady = true;
  store.meals = data;
  saveMeals();
  return store.meals;
}

export async function addMeal({ day, meal, recipe_id = null, title, note = '' }) {
  const row = check(await sb.from('meal_plan').insert({ day, meal, recipe_id, title, note }).select().single());
  store.meals = [...store.meals.filter((m) => m.id !== row.id), row];
  saveMeals();
  return row;
}

export async function deleteMeal(id) {
  store.meals = store.meals.filter((m) => m.id !== id);
  saveMeals();
  check(await sb.from('meal_plan').delete().eq('id', id));
}

// ---- chores -------------------------------------------------------------------
function saveChores() {
  store.chores.sort((a, b) => a.next_due.localeCompare(b.next_due) || a.title.localeCompare(b.title));
  cache('chores', store.chores);
  emit('chores');
}

// Open chores, plus ones finished in the last two days (so a mis-tap can be undone)
export async function loadChores() {
  const since = new Date(Date.now() - 2 * 86400000).toISOString();
  const { data, error } = await sb.from('chores').select('*')
    .or(`done_at.is.null,last_done_at.gte.${since}`).order('next_due');
  if (error) {
    if (/chores/.test(error.message || '')) { store.choresReady = false; emit('chores'); return []; }
    throw new Error(error.message);
  }
  store.choresReady = true;
  store.chores = data;
  saveChores();
  return store.chores;
}

const CHORE_FIELDS = ['title', 'notes', 'anchor', 'next_due', 'repeat_unit', 'repeat_every'];
export async function saveChore(chore) {
  const row = {};
  for (const f of CHORE_FIELDS) if (chore[f] !== undefined) row[f] = chore[f];
  const q = chore.id
    ? sb.from('chores').update(row).eq('id', chore.id)
    : sb.from('chores').insert(row);
  const saved = check(await q.select().single());
  store.chores = [...store.chores.filter((c) => c.id !== saved.id), saved];
  saveChores();
  return saved;
}

export async function deleteChore(id) {
  store.chores = store.chores.filter((c) => c.id !== id);
  saveChores();
  check(await sb.from('chores').delete().eq('id', id));
}

// Ticking off and undo run in the database, so the app and the iPhone Shortcut agree on the next date
export async function completeChore(id) {
  check(await sb.rpc('complete_chore', { chore: id }));
  return loadChores();
}
export async function undoChore(id) {
  check(await sb.rpc('undo_chore', { chore: id }));
  return loadChores();
}

// The private links iPhones subscribe to (Settings > Calendar > Add Subscribed Calendar):
// one calendar for meals and one for chores, sharing one private code.
function feedUrls(token) {
  const url = (cal) => {
    const u = new URL(`${SUPABASE_URL}/rest/v1/rpc/meal_calendar`);
    u.searchParams.set('feed', token);
    u.searchParams.set('cal', cal);
    u.searchParams.set('apikey', SUPABASE_ANON_KEY);
    return u.toString();
  };
  return { meals: url('meals'), chores: url('chores') };
}
export async function calendarLinks() {
  return feedUrls(check(await sb.rpc('calendar_feed_token')));
}
export async function newCalendarLinks() {
  return feedUrls(check(await sb.rpc('new_calendar_feed_token')));
}

// ---- live sync between phones ---------------------------------------------------
let reloadTimers = {};
function reloadSoon(what, fn) {
  clearTimeout(reloadTimers[what]);
  reloadTimers[what] = setTimeout(() => fn().catch(() => {}), 300);
}

let channel;
export function startSync() {
  if (channel) return;
  channel = sb.channel('household')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'recipes' }, () => reloadSoon('r', loadRecipes))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'shopping_items' }, () => reloadSoon('s', loadShopping))
    .subscribe();
  // Separate channel, so a missing meal_plan table can't stop recipes and shopping from syncing
  sb.channel('household-meals')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'meal_plan' }, () => reloadSoon('m', loadMeals))
    .subscribe();
  sb.channel('household-lists')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'shopping_lists' }, () => reloadSoon('l', loadLists))
    .subscribe();
  sb.channel('household-chores')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'chores' }, () => reloadSoon('c', loadChores))
    .subscribe();
}
export function refreshAll() {
  return Promise.all([loadRecipes(), loadShopping(), loadLists(), loadMeals(), loadChores()]);
}
