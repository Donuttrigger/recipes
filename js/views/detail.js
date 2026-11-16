// One recipe: photo, servings scaling, ingredients, steps, add to shopping list.
import { $, $$, esc, toast, sheet, foodEmoji } from '../lib/dom.js';
import { getRecipe, saveRecipe, deleteRecipe, addShopping } from '../db.js';
import { scaleIngredient, formatQty } from '../lib/scale.js';

export const tab = 'home';
const servingsFor = {}; // remembers chosen servings per recipe while the app is open
const doneSteps = {};
let wakeLock = null;

const isSection = (line) => /^—.*—$/.test(line) || /:\s*$/.test(line);
const sectionText = (line) => line.replace(/^—\s*|\s*—$/g, '').replace(/:\s*$/, '');

export function render(view, id) {
  const draw = () => {
    const r = getRecipe(id);
    if (!r) { view.innerHTML = `<div class="center muted">Loading…</div>`; return; }
    const base = Number(r.servings) || 4;
    const n = servingsFor[id] ?? base;
    const factor = n / base;
    const done = (doneSteps[id] ||= new Set());
    let stepNo = 0;

    view.innerHTML = `
      <div class="topbar">
        <a class="btn ghost" href="#/">‹ Recipes</a>
        <button class="ghost" id="fav" aria-label="Favorite" style="font-size:22px">${r.favorite ? '★' : '☆'}</button>
      </div>
      <div class="hero">${r.photo_url ? `<img src="${esc(r.photo_url)}" alt="" onerror="this.remove()">` : foodEmoji(r.title)}</div>
      <h1 style="margin-top:16px">${esc(r.title)}</h1>
      ${r.description ? `<p class="muted" style="margin-top:-6px">${esc(r.description)}</p>` : ''}
      <div class="meta">
        ${r.prep_time ? `<span>🔪 Prep ${esc(r.prep_time)}</span>` : ''}
        ${r.cook_time ? `<span>🔥 Cook ${esc(r.cook_time)}</span>` : ''}
        ${r.source_url ? `<a href="${esc(r.source_url)}" target="_blank" rel="noopener">Original recipe ↗</a>` : ''}
      </div>
      ${r.tags?.length ? `<div class="tags">${r.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}

      <div class="row" style="margin-top:22px">
        <h2 style="margin:0">Ingredients</h2>
        <div class="stepper shrink">
          <button id="less" aria-label="Fewer servings">−</button>
          <span class="n" id="srv">${formatQty(n)} serving${n === 1 ? '' : 's'}</span>
          <button id="more" aria-label="More servings">+</button>
        </div>
      </div>
      ${factor !== 1 ? `<p class="small muted" style="margin:8px 0 0">Scaled from ${formatQty(base)} servings · <a href="#" id="reset">reset</a></p>` : ''}
      <ul class="ing" style="margin-top:8px">
        ${(r.ingredients || []).map((l) => isSection(l)
          ? `<li class="section">${esc(sectionText(l))}</li>`
          : `<li>${esc(scaleIngredient(l, factor))}</li>`).join('') || '<li class="muted">No ingredients listed.</li>'}
      </ul>
      ${r.ingredients?.length ? `<button class="block" id="toshop" style="margin-top:14px">🛒 Add to shopping list</button>` : ''}

      <h2>Steps</h2>
      <ol class="steps">
        ${(r.steps || []).map((s, i) => isSection(s)
          ? `<li class="section">${esc(sectionText(s))}</li>`
          : `<li class="step ${done.has(i) ? 'done' : ''}" data-i="${i}">${esc(s)}</li>`).join('') || '<li class="muted">No steps yet.</li>'}
      </ol>
      ${r.steps?.length ? `<p class="small muted">Tip: tap a step to tick it off.</p>` : ''}
      ${'wakeLock' in navigator ? `<label class="switch">Keep screen on while cooking <input type="checkbox" id="wake" ${wakeLock ? 'checked' : ''}></label>` : ''}

      ${r.notes ? `<h2>Notes</h2><div class="notes">${esc(r.notes)}</div>` : ''}

      <div class="actions">
        <a class="btn" href="#/edit/${r.id}">✏️ Edit</a>
        <button class="danger" id="del">Delete</button>
      </div>`;

    const setN = (v) => { servingsFor[id] = Math.max(0.5, v); draw(); };
    const step = n < 2 ? 0.5 : 1;
    $('#less', view).onclick = () => setN(n - step);
    $('#more', view).onclick = () => setN(n + (n < 1 ? 0.5 : 1));
    $('#reset', view)?.addEventListener('click', (e) => { e.preventDefault(); setN(base); });

    $('#fav', view).onclick = () => saveRecipe({ id: r.id, favorite: !r.favorite }).catch((e) => toast(e.message));

    $$('.step', view).forEach((li) => li.addEventListener('click', () => {
      const i = +li.dataset.i;
      done.has(i) ? done.delete(i) : done.add(i);
      li.classList.toggle('done');
    }));

    $('#wake', view)?.addEventListener('change', async (e) => {
      try {
        if (e.target.checked) wakeLock = await navigator.wakeLock.request('screen');
        else { await wakeLock?.release(); wakeLock = null; }
      } catch { e.target.checked = false; toast('Your phone did not allow that.'); }
    });

    $('#toshop', view)?.addEventListener('click', () => {
      const lines = r.ingredients.filter((l) => !isSection(l)).map((l) => scaleIngredient(l, factor));
      const s = sheet(`
        <h2>Add to shopping list</h2>
        <p class="small muted" style="margin-top:-6px">Untick anything you already have.</p>
        <ul class="picklist">${lines.map((l, i) => `<li><label><input type="checkbox" checked value="${i}"> ${esc(l)}</label></li>`).join('')}</ul>
        <div class="row"><button id="cancel">Cancel</button><button class="primary" id="go">Add items</button></div>`);
      $('#cancel', s.el).onclick = s.close;
      $('#go', s.el).onclick = async () => {
        const picked = $$('input:checked', s.el).map((c) => ({ text: lines[+c.value], recipe_title: r.title }));
        s.close();
        if (!picked.length) return;
        try { await addShopping(picked); toast(`Added ${picked.length} item${picked.length === 1 ? '' : 's'} to the list`); }
        catch (e) { toast(e.message); }
      };
    });

    $('#del', view).onclick = async () => {
      if (!confirm(`Delete “${r.title}” for both of you? This can't be undone.`)) return;
      try { await deleteRecipe(r.id); location.hash = '#/'; toast('Recipe deleted'); }
      catch (e) { toast(e.message); }
    };
  };

  draw();
  return {
    update: (what) => what === 'recipes' && draw(),
    cleanup: () => { wakeLock?.release().catch(() => {}); wakeLock = null; },
  };
}
