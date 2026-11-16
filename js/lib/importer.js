// Pulls a recipe out of a web page's HTML. Most recipe sites embed a
// schema.org "Recipe" in a <script type="application/ld+json"> tag.
import { parseServings } from './scale.js';

function clean(s) {
  if (s == null) return '';
  const text = new DOMParser().parseFromString(String(s), 'text/html').body.textContent || '';
  return text.replace(/\s+/g, ' ').trim();
}

function types(node) {
  const t = node && node['@type'];
  return Array.isArray(t) ? t : t ? [t] : [];
}

function findRecipe(node, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 6) return null;
  if (Array.isArray(node)) {
    for (const n of node) { const r = findRecipe(n, depth + 1); if (r) return r; }
    return null;
  }
  if (types(node).some((t) => String(t).toLowerCase().endsWith('recipe'))) return node;
  for (const key of ['@graph', 'mainEntity', 'mainEntityOfPage', 'itemListElement', 'item']) {
    const r = findRecipe(node[key], depth + 1);
    if (r) return r;
  }
  return null;
}

function flattenInstructions(ins) {
  if (!ins) return [];
  if (typeof ins === 'string') {
    // Some sites put all steps in one string, with line breaks or <li>/<p> tags
    const parts = ins.split(/<\/(?:li|p)>|<br\s*\/?>|\n+/i).map(clean).filter(Boolean);
    return parts;
  }
  if (Array.isArray(ins)) return ins.flatMap(flattenInstructions);
  if (typeof ins === 'object') {
    if (ins.itemListElement) {
      const steps = flattenInstructions(ins.itemListElement);
      return ins.name && steps.length ? [`— ${clean(ins.name)} —`, ...steps] : steps;
    }
    const t = clean(ins.text || ins.name || ins.description || '');
    return t ? [t] : [];
  }
  return [];
}

function pickImage(img, base) {
  if (!img) return '';
  if (Array.isArray(img)) return pickImage(img[0], base);
  const url = typeof img === 'string' ? img : img.url || img.contentUrl || img['@id'] || '';
  try { return url ? new URL(url, base).href : ''; } catch { return ''; }
}

export function formatDuration(iso) {
  if (!iso || typeof iso !== 'string') return '';
  const m = iso.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:\d+S)?)?$/i);
  if (!m) return clean(iso);
  let [, d, h, min] = m.map((x) => (x ? parseInt(x, 10) : 0));
  h += d * 24;
  if (min >= 60) { h += Math.floor(min / 60); min %= 60; }
  const parts = [];
  if (h) parts.push(`${h} hr`);
  if (min) parts.push(`${min} min`);
  return parts.join(' ');
}

function asList(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v.map((x) => clean(typeof x === 'object' ? x.name : x)).filter(Boolean);
  return String(v).split(',').map(clean).filter(Boolean);
}

export function extractRecipeFromHtml(html, pageUrl) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  let r = null;
  for (const s of doc.querySelectorAll('script[type="application/ld+json"]')) {
    let data = null;
    const raw = s.textContent.trim();
    try { data = JSON.parse(raw); } catch {
      try { data = JSON.parse(raw.replace(/[\u0000-\u001F]+/g, ' ')); } catch { continue; }
    }
    r = findRecipe(data);
    if (r) break;
  }

  const meta = (p) => doc.querySelector(`meta[property="${p}"], meta[name="${p}"]`)?.content || '';

  if (!r) {
    const title = clean(meta('og:title') || doc.title);
    if (!title) return null;
    return {
      partial: true,
      title,
      description: clean(meta('og:description')),
      photo_url: pickImage(meta('og:image'), pageUrl),
      source_url: pageUrl,
      servings: 4, prep_time: '', cook_time: '',
      ingredients: [], steps: [], tags: [], notes: '',
    };
  }

  const tags = [...new Set([...asList(r.recipeCategory), ...asList(r.recipeCuisine), ...asList(r.keywords)])]
    .filter((t) => t.length < 30)
    .slice(0, 8);

  return {
    partial: false,
    title: clean(r.name) || clean(meta('og:title')) || 'Untitled recipe',
    description: clean(r.description),
    photo_url: pickImage(r.image, pageUrl) || pickImage(meta('og:image'), pageUrl),
    source_url: pageUrl,
    servings: parseServings(r.recipeYield) || 4,
    prep_time: formatDuration(r.prepTime),
    cook_time: formatDuration(r.cookTime) || formatDuration(r.totalTime),
    ingredients: (Array.isArray(r.recipeIngredient) ? r.recipeIngredient : r.recipeIngredient ? [r.recipeIngredient] : (r.ingredients || []))
      .map(clean).filter(Boolean),
    steps: flattenInstructions(r.recipeInstructions),
    tags,
    notes: '',
  };
}
