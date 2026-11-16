// Reads a Recipe Keeper backup (.zip containing recipes.html + images/).
import { parseServings } from './scale.js';
import { formatDuration } from './importer.js';

const JSZIP = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm';

const BULLET = /^[\s•·▪◦●○■□✓*\-–—]+/;
const STEP_NUM = /^(step\s*)?\d{1,2}\s*[.):]\s+/i;

const text = (el) => (el?.textContent || '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
const meta = (el, prop) => el.querySelector(`meta[itemprop="${prop}"]`)?.getAttribute('content')?.trim() || '';
const metas = (el, prop) => [...el.querySelectorAll(`meta[itemprop="${prop}"]`)].map((m) => m.getAttribute('content')?.trim()).filter(Boolean);
// A paragraph that is all bold ("For the lemon curd") is a sub-heading; ending it
// with ":" makes the recipe screen show it as one.
const paras = (el) => (el ? [...el.querySelectorAll('p')].map((p) => {
  const t = text(p);
  const b = p.querySelector('b, strong');
  return t && b && text(b) === t && !t.endsWith(':') ? `${t}:` : t;
}) : []);

const NUTRITION = [
  ['recipeNutCalories', 'calories', ''], ['recipeNutTotalFat', 'fat', 'g'], ['recipeNutSaturatedFat', 'saturated fat', 'g'],
  ['recipeNutCholesterol', 'cholesterol', 'mg'], ['recipeNutSodium', 'sodium', 'mg'],
  ['recipeNutTotalCarbohydrate', 'carbs', 'g'], ['recipeNutDietaryFiber', 'fiber', 'g'],
  ['recipeNutSugars', 'sugars', 'g'], ['recipeNutProtein', 'protein', 'g'],
];

export function parseRecipeKeeperHtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return [...doc.querySelectorAll('.recipe-details')].map((el) => {
    const ingredients = paras(el.querySelector('[itemprop="recipeIngredients"]'))
      .map((l) => l.replace(BULLET, '').trim())
      .filter((l) => l && !/^ingredients:?$/i.test(l));
    const steps = paras(el.querySelector('[itemprop="recipeDirections"]'))
      .map((l) => l.replace(BULLET, '').replace(STEP_NUM, '').trim())
      .filter((l) => l && !/^(directions|instructions|method):?$/i.test(l));

    const notes = paras(el.querySelector('[itemprop="recipeNotes"]')).filter(Boolean);
    const source = text(el.querySelector('[itemprop="recipeSource"]'));
    const isUrl = /^https?:\/\//i.test(source);
    if (source && !isUrl && !/^recipe keeper$/i.test(source)) notes.push(`Source: ${source}`);

    const nut = NUTRITION.map(([p, label, unit]) => { const v = meta(el, p); return v ? `${v}${unit} ${label}` : ''; }).filter(Boolean);
    if (nut.length) {
      const size = meta(el, 'recipeNutServingSize');
      notes.push(`Nutrition per serving${size ? ` (${size})` : ''}: ${nut.join(', ')}`);
    }

    const tags = [...new Set([
      ...text(el.querySelector('[itemprop="recipeCourse"]')).split(',').map((t) => t.trim()),
      ...metas(el, 'recipeCategory'), ...metas(el, 'recipeCollection'),
    ].filter(Boolean))];

    const yieldText = text(el.querySelector('[itemprop="recipeYield"]'));
    const photos = [...el.querySelectorAll('img[itemprop^="photo"]')].map((i) => i.getAttribute('src'));
    if (!photos.length) { const main = el.querySelector('img.recipe-photo'); if (main) photos.push(main.getAttribute('src')); }

    return {
      title: text(el.querySelector('[itemprop="name"]')) || 'Untitled recipe',
      description: '',
      servings: parseServings(yieldText) || 4,
      prep_time: formatDuration(meta(el, 'prepTime')),
      cook_time: formatDuration(meta(el, 'cookTime')),
      ingredients,
      steps,
      notes: notes.join('\n'),
      source_url: isUrl ? source : '',
      tags,
      favorite: /^true$/i.test(meta(el, 'recipeIsFavourite')),
      photos: photos.filter(Boolean),
    };
  });
}

export async function readRecipeKeeperZip(file) {
  const { default: JSZip } = await import(JSZIP);
  const zip = await JSZip.loadAsync(file);
  const htmlFile = zip.file(/(^|\/)recipes\.html$/i)[0];
  if (!htmlFile) throw new Error("This doesn't look like a Recipe Keeper backup (no recipes.html inside).");
  const base = htmlFile.name.replace(/recipes\.html$/i, '');
  const recipes = parseRecipeKeeperHtml(await htmlFile.async('string'));
  const getImage = async (src) => {
    const f = zip.file(base + src) || zip.file(src);
    return f ? new Blob([await f.async('uint8array')], { type: 'image/jpeg' }) : null;
  };
  return { recipes, getImage };
}
