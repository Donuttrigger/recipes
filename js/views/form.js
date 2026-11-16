// Add or edit a recipe. New recipes can be imported from a website link.
import { $, esc, toast, busy, foodEmoji } from '../lib/dom.js';
import { getRecipe, saveRecipe, uploadPhoto, fetchPage } from '../db.js';
import { extractRecipeFromHtml } from '../lib/importer.js';

export const tab = 'new';

const lines = (s) => s.split('\n').map((l) => l.trim()).filter(Boolean);

export function render(view, id) {
  const existing = id ? getRecipe(id) : null;
  if (id && !existing) {
    view.innerHTML = `<div class="center muted">Recipe not found. <a href="#/">Back</a></div>`;
    return;
  }
  const r = existing || { servings: 4, ingredients: [], steps: [], tags: [] };
  let photoFile = null;
  let photoUrl = r.photo_url || '';

  view.innerHTML = `
    <div class="topbar">
      <a class="btn ghost" href="${id ? `#/recipe/${id}` : '#/'}">‹ Cancel</a>
    </div>
    <h1>${id ? 'Edit recipe' : 'New recipe'}</h1>

    ${id ? '' : `
    <div class="importbox">
      <p><b>Found a recipe online?</b> Paste its link and we'll fill everything in.</p>
      <div class="row">
        <input id="url" type="url" inputmode="url" placeholder="https://…" autocapitalize="off">
        <button class="primary shrink" id="imp" type="button">Import</button>
      </div>
    </div>
    <p class="small muted center" style="padding:6px 0">or type it in yourself</p>`}

    <form id="f" novalidate>
      <label for="title">Name</label>
      <input id="title" required>

      <label>Photo</label>
      <div class="photo-pick">
        <div class="prev" id="prev"></div>
        <div>
          <span class="btn file-btn">📷 Choose photo<input id="photo" type="file" accept="image/*"></span>
          <button type="button" class="ghost small" id="nophoto">Remove</button>
        </div>
      </div>

      <label for="desc">Short description <span class="hint">(optional)</span></label>
      <input id="desc">

      <div class="row">
        <div><label for="servings">Serves</label><input id="servings" type="number" inputmode="decimal" min="0.5" step="0.5"></div>
        <div><label for="prep">Prep time</label><input id="prep" placeholder="15 min"></div>
        <div><label for="cook">Cook time</label><input id="cook" placeholder="30 min"></div>
      </div>

      <label for="ing">Ingredients <span class="hint">(one per line, amount first, like “2 cups flour”)</span></label>
      <textarea id="ing" rows="8"></textarea>

      <label for="steps">Steps <span class="hint">(one per line)</span></label>
      <textarea id="steps" rows="8"></textarea>

      <label for="tags">Tags <span class="hint">(comma separated, like “dinner, quick”)</span></label>
      <input id="tags">

      <label for="notes">Notes <span class="hint">(optional)</span></label>
      <textarea id="notes" rows="3"></textarea>

      <label for="src">Original link <span class="hint">(optional)</span></label>
      <input id="src" type="url" inputmode="url" autocapitalize="off">

      <div class="savebar"><button class="primary block" type="submit" id="save">Save recipe</button></div>
    </form>`;

  const fill = (d) => {
    $('#title', view).value = d.title || '';
    $('#desc', view).value = d.description || '';
    $('#servings', view).value = d.servings || 4;
    $('#prep', view).value = d.prep_time || '';
    $('#cook', view).value = d.cook_time || '';
    $('#ing', view).value = (d.ingredients || []).join('\n');
    $('#steps', view).value = (d.steps || []).join('\n');
    $('#tags', view).value = (d.tags || []).join(', ');
    $('#notes', view).value = d.notes || '';
    $('#src', view).value = d.source_url || '';
    photoUrl = d.photo_url || '';
    photoFile = null;
    showPhoto();
  };

  const showPhoto = () => {
    const src = photoFile ? URL.createObjectURL(photoFile) : photoUrl;
    $('#prev', view).innerHTML = src ? `<img src="${esc(src)}" alt="" onerror="this.remove()">` : foodEmoji($('#title', view).value);
    $('#nophoto', view).hidden = !src;
  };

  $('#photo', view).addEventListener('change', (e) => {
    photoFile = e.target.files[0] || null;
    showPhoto();
  });
  $('#nophoto', view).addEventListener('click', () => { photoFile = null; photoUrl = ''; $('#photo', view).value = ''; showPhoto(); });

  $('#imp', view)?.addEventListener('click', async () => {
    let url = $('#url', view).value.trim();
    if (!url) return toast('Paste a link first');
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    const btn = $('#imp', view);
    busy(btn, true);
    try {
      const html = await fetchPage(url);
      const found = extractRecipeFromHtml(html, url);
      if (!found) throw new Error("Couldn't find a recipe on that page.");
      fill(found);
      toast(found.partial
        ? "Got the name and photo, but this site hides the recipe. Copy the ingredients and steps in by hand."
        : 'Recipe imported! Check it over, then tap Save.', 5000);
    } catch (e) {
      toast(e.message.replace(/^.*?(The website said no)/, '$1'), 5000);
    } finally {
      busy(btn, false);
    }
  });

  $('#f', view).addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = $('#title', view).value.trim();
    if (!title) { $('#title', view).focus(); return toast('Give the recipe a name'); }
    const btn = $('#save', view);
    busy(btn, true, 'Saving…');
    try {
      if (photoFile) photoUrl = await uploadPhoto(photoFile);
      const saved = await saveRecipe({
        id: existing?.id,
        title,
        description: $('#desc', view).value.trim(),
        photo_url: photoUrl,
        servings: parseFloat($('#servings', view).value) || 4,
        prep_time: $('#prep', view).value.trim(),
        cook_time: $('#cook', view).value.trim(),
        ingredients: lines($('#ing', view).value),
        steps: lines($('#steps', view).value),
        tags: $('#tags', view).value.split(',').map((t) => t.trim()).filter(Boolean),
        notes: $('#notes', view).value.trim(),
        source_url: $('#src', view).value.trim(),
      });
      toast('Saved');
      location.hash = `#/recipe/${saved.id}`;
    } catch (err) {
      toast(err.message, 5000);
      busy(btn, false);
    }
  });

  fill(r);
  // The edit screen keeps whatever you've typed even if the other phone changes things.
}
