// Turns plain text (from a scanned card, cookbook page or PDF) into recipe fields.
// It's best-effort: the result is always shown for checking before it's saved.

const H_ING = /^(ingredients?|you('| wi)ll need|what you('| wi)ll need|what you need|shopping list)\b\s*:?/i;
const H_STEP = /^(directions?|instructions?|method|preparation|steps|how to make( it)?|to make|procedure)\b\s*:?/i;
const H_NOTE = /^(notes?|tips?|cook'?s notes?|variations?|storage)\b\s*:?/i;
const H_META = /^(serves|servings|yield|makes|prep|cook|total|time|calories|nutrition)\b/i;

const QTY_START = /^(\d|[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]|(a\s+(pinch|handful|few|dash)|one|two|three|four|half)\b)/i;
const UNIT = /\b(cups?|c\.|tbsps?|tablespoons?|tsps?|teaspoons?|oz|ounces?|lbs?|pounds?|g|grams?|kg|ml|l|litres?|liters?|pinch|cloves?|cans?|sticks?|slices?|bunch|packages?|pkg)\b/i;
const BULLET = /^[•·▪◦●○■□✓*\-–—]\s*/;
const STEP_NUM = /^(step\s*)?\d{1,2}\s*[.):]\s*/i;

function tidy(line) {
  return line
    .replace(/[|]/g, 'I')
    .replace(/\s+/g, ' ')
    .replace(/^l(?=\s+(cups?|tbsp|tsp|tablespoons?|teaspoons?|lbs?|oz|pound|can|stick)\b)/i, '1')
    .replace(/(\d)\s*\/\s*(\d)/g, '$1/$2')
    .trim();
}

function findTime(text, word) {
  const m = text.match(new RegExp(`${word}[a-z]*\\s*(?:time)?\\s*:?\\s*((?:\\d+\\s*(?:hours?|hrs?|h|minutes?|mins?|m)\\b\\s*(?:and\\s*)?){1,2})`, 'i'));
  return m ? m[1].replace(/\s+/g, ' ').replace(/\band\s*$/i, '').trim() : '';
}

const looksLikeIngredient = (l) => l.length < 70 && (QTY_START.test(l) || (UNIT.test(l) && l.length < 45));

// Join lines that were wrapped onto the next line.
function joinSteps(lines) {
  const numbered = lines.filter((l) => STEP_NUM.test(l)).length >= 2;
  const out = [];
  for (const raw of lines) {
    const l = raw.replace(BULLET, '');
    if (numbered) {
      if (STEP_NUM.test(l) || !out.length) out.push(l.replace(STEP_NUM, ''));
      else out[out.length - 1] += ' ' + l;
    } else {
      const prev = out[out.length - 1];
      if (prev && !/[.!?:)]$/.test(prev)) out[out.length - 1] += ' ' + l;
      else out.push(l);
    }
  }
  return out.map((s) => s.trim()).filter((s) => s.length > 1);
}

function joinIngredients(lines) {
  const out = [];
  for (const raw of lines) {
    const l = raw.replace(BULLET, '');
    const prev = out[out.length - 1];
    // a line starting in lowercase with no amount is usually the end of the previous one
    if (prev && /^[a-z(]/.test(l) && !QTY_START.test(l) && !BULLET.test(raw)) out[out.length - 1] += ' ' + l;
    else out.push(l);
  }
  return out.filter((s) => s.length > 1);
}

export function parseRecipeText(text) {
  const all = text.split(/\r?\n/).map(tidy);
  const lines = all.filter(Boolean);
  const flat = lines.join('\n');

  const servingsM = flat.match(/(?:serves|servings|yield|makes)\s*:?\s*(?:about\s*)?(\d+(?:\.\d+)?)/i);
  const result = {
    title: '',
    servings: servingsM ? parseFloat(servingsM[1]) : 4,
    prep_time: findTime(flat, 'prep'),
    cook_time: findTime(flat, 'cook') || findTime(flat, 'bake') || findTime(flat, 'total'),
    ingredients: [], steps: [], notes: '', description: '', tags: [],
  };

  const iIng = lines.findIndex((l) => H_ING.test(l) && l.length < 40);
  const iStep = lines.findIndex((l, i) => H_STEP.test(l) && l.length < 40 && i !== iIng);
  const iNote = lines.findIndex((l, i) => H_NOTE.test(l) && l.length < 40 && i > Math.max(iIng, iStep));

  // Title: first real line before everything else
  const firstSection = [iIng, iStep, iNote].filter((i) => i >= 0).reduce((a, b) => Math.min(a, b), lines.length);
  const titleLine = lines.slice(0, firstSection).find((l) =>
    l.length > 2 && l.length < 80 && !H_META.test(l) && /[a-z]/i.test(l) && !looksLikeIngredient(l));
  result.title = titleLine ? titleLine.replace(/[.:]$/, '') : '';

  const section = (start, ends) => {
    if (start < 0) return [];
    const end = ends.filter((e) => e > start).reduce((a, b) => Math.min(a, b), lines.length);
    const first = lines[start].replace(H_ING, '').replace(H_STEP, '').replace(H_NOTE, '').trim();
    return [...(first ? [first] : []), ...lines.slice(start + 1, end)].filter((l) => !H_META.test(l) || l.length > 40);
  };

  if (iIng >= 0 || iStep >= 0) {
    result.ingredients = joinIngredients(section(iIng, [iStep, iNote]));
    let stepLines = section(iStep, [iNote, iIng > iStep ? iIng : -1]);
    if (iStep < 0 && iIng >= 0) {
      // no "Directions" heading: the steps follow the ingredient list
      const ing = section(iIng, [iNote]);
      const cut = ing.findIndex((l, i) => i > 0 && !looksLikeIngredient(l) && l.length > 45);
      if (cut > 0) { result.ingredients = joinIngredients(ing.slice(0, cut)); stepLines = ing.slice(cut); }
    }
    result.steps = joinSteps(stepLines);
    if (iNote >= 0) result.notes = section(iNote, []).join('\n');
  } else {
    // No headings at all: amounts at the start of a line mean ingredients
    const body = lines.filter((l) => l !== titleLine && !(H_META.test(l) && l.length < 40));
    result.ingredients = joinIngredients(body.filter(looksLikeIngredient));
    result.steps = joinSteps(body.filter((l) => !looksLikeIngredient(l)));
  }

  if (!result.ingredients.length && !result.steps.length) result.notes = text.trim();
  return result;
}
