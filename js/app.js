// App start-up and screen switching.
// To add a new screen: create js/views/<name>.js exporting render(view, ...params)
// (optionally returning { update, cleanup }) and add a line to `routes` below.
import { $, $$ } from './lib/dom.js';
import * as db from './db.js';
import * as setup from './views/setup.js';
import * as login from './views/login.js';
import * as list from './views/list.js';
import * as detail from './views/detail.js';
import * as form from './views/form.js';
import * as shop from './views/shop.js';
import * as plan from './views/plan.js';
import * as chores from './views/chores.js';

const routes = [
  { path: /^$/, view: list },
  { path: /^recipe\/([\w-]+)$/, view: detail },
  { path: /^new$/, view: form },
  { path: /^edit\/([\w-]+)$/, view: form },
  { path: /^shop$/, view: shop },
  { path: /^plan$/, view: plan },
  { path: /^chores$/, view: chores },
];

const viewEl = $('#view');
const tabs = $('#tabs');
let session = null;
let current = null;

function mount(view, params = []) {
  current?.cleanup?.();
  viewEl.innerHTML = '';
  window.scrollTo(0, 0);
  tabs.hidden = !session;
  $$('a', tabs).forEach((a) => a.classList.toggle('active', a.dataset.tab === view.tab));
  current = view.render(viewEl, ...params) || {};
}

function route() {
  if (!db.configured) return mount(setup);
  if (!session) return mount(login);
  const hash = location.hash.replace(/^#\/?/, '');
  for (const r of routes) {
    const m = hash.match(r.path);
    if (m) return mount(r.view, m.slice(1));
  }
  location.hash = '#/';
}

function updateBadge() {
  const n = db.store.shopping.filter((i) => !i.checked).length;
  const b = $('#shop-badge');
  b.hidden = !n;
  b.textContent = n;
  // Chores due today or overdue
  const today = db.dayString(new Date());
  const c = db.store.chores.filter((x) => !x.done_at && x.next_due <= today).length;
  const cb = $('#chore-badge');
  cb.hidden = !c;
  cb.textContent = c;
}

db.onChange((what) => {
  current?.update?.(what);
  updateBadge();
});

function startData() {
  db.refreshAll().catch(() => {}); // offline? cached copies are already showing
  db.startSync();
}

async function init() {
  window.addEventListener('hashchange', route);
  if (db.configured) {
    session = await db.getSession();
    db.onAuth((s) => {
      const changed = !!s !== !!session;
      session = s;
      if (changed) { if (s) startData(); route(); }
    });
    if (session) startData();
    // Catch up after the phone was locked or the app was in the background
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && session) db.refreshAll().catch(() => {});
    });
  }
  updateBadge();
  route();
}

init();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
