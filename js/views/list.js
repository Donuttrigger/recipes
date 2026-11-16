// Home screen: all recipes, with search and tag filters.
import { $, esc, foodEmoji } from '../lib/dom.js';
import { store, signOut } from '../db.js';

export const tab = 'home';
const state = { q: '', tag: '' }; // remembered while the app is open

function matches(r) {
  if (state.tag === '★' && !r.favorite) return false;
  if (state.tag && state.tag !== '★' && !(r.tags || []).includes(state.tag)) return false;
  if (!state.q) return true;
  const hay = [r.title, r.description, ...(r.tags || []), ...(r.ingredients || [])].join(' ').toLowerCase();
  return state.q.toLowerCase().split(/\s+/).every((w) => hay.includes(w));
}

function card(r) {
  const time = [r.prep_time, r.cook_time].filter(Boolean).join(' + ');
  return `
    <a class="card" href="#/recipe/${r.id}">
      <div class="ph">${r.photo_url ? `<img src="${esc(r.photo_url)}" alt="" loading="lazy" onerror="this.remove()">` : foodEmoji(r.title)}</div>
      <div class="body">
        <div class="t">${r.favorite ? '★ ' : ''}${esc(r.title)}</div>
        ${time ? `<div class="m">⏱ ${esc(time)}</div>` : ''}
      </div>
    </a>`;
}

export function render(view) {
  view.innerHTML = `
    <div class="topbar"><h1>Our Recipes</h1><button class="ghost small" id="out">Sign out</button></div>
    <div class="search"><input type="search" id="q" placeholder="Search recipes or ingredients" value="${esc(state.q)}"></div>
    <div class="chips" id="chips"></div>
    <div id="results"></div>`;

  const draw = () => {
    const tags = [...new Set(store.recipes.flatMap((r) => r.tags || []))].sort();
    const hasFav = store.recipes.some((r) => r.favorite);
    const chips = ['', ...(hasFav ? ['★'] : []), ...tags];
    $('#chips', view).innerHTML = chips.length > 1 ? chips.map((t) => `
      <button class="chip ${state.tag === t ? 'on' : ''}" data-tag="${esc(t)}">${t === '' ? 'All' : t === '★' ? '★ Favorites' : esc(t)}</button>`).join('') : '';

    const list = store.recipes.filter(matches);
    $('#results', view).innerHTML = !store.recipes.length
      ? `<div class="empty"><div class="big">🧑‍🍳</div><p>No recipes yet.</p><a class="btn primary" href="#/new">Add your first recipe</a></div>`
      : !list.length
        ? `<div class="empty"><p>Nothing matches “${esc(state.q || state.tag)}”.</p></div>`
        : `<div class="grid">${list.map(card).join('')}</div>`;
  };

  $('#q', view).addEventListener('input', (e) => { state.q = e.target.value.trim(); draw(); });
  $('#chips', view).addEventListener('click', (e) => {
    const b = e.target.closest('[data-tag]');
    if (b) { state.tag = b.dataset.tag; draw(); }
  });
  $('#out', view).addEventListener('click', () => { if (confirm('Sign out of the app on this phone?')) signOut(); });
  draw();
  return { update: draw };
}
