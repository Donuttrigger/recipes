// Ingredient scaling: finds the amount at the start of a line ("1 1/2 cups flour",
// "½ tsp salt", "2-3 cloves garlic") and multiplies it.

const UNICODE = {
  '½': 1 / 2, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 1 / 4, '¾': 3 / 4,
  '⅕': 1 / 5, '⅖': 2 / 5, '⅗': 3 / 5, '⅘': 4 / 5, '⅙': 1 / 6,
  '⅚': 5 / 6, '⅛': 1 / 8, '⅜': 3 / 8, '⅝': 5 / 8, '⅞': 7 / 8,
};
const U = Object.keys(UNICODE).join('');
const NUM = `(?:\\d+\\s+\\d+\\/\\d+|\\d+\\s*[${U}]|\\d+\\/\\d+|\\d*\\.\\d+|\\d+|[${U}])`;
const QTY_RE = new RegExp(`^(\\s*)(${NUM})(?:(\\s*(?:-|–|—|to)\\s*)(${NUM}))?`);

export function parseNum(s) {
  s = s.trim();
  let m;
  if ((m = s.match(/^(\d+)\s+(\d+)\/(\d+)$/))) return +m[1] + m[2] / m[3];
  if ((m = s.match(new RegExp(`^(\\d+)\\s*([${U}])$`)))) return +m[1] + UNICODE[m[2]];
  if ((m = s.match(/^(\d+)\/(\d+)$/))) return m[1] / m[2];
  if (UNICODE[s] != null) return UNICODE[s];
  return parseFloat(s);
}

const FRACTIONS = [
  [0, ''], [1 / 8, '⅛'], [1 / 4, '¼'], [1 / 3, '⅓'], [3 / 8, '⅜'], [1 / 2, '½'],
  [5 / 8, '⅝'], [2 / 3, '⅔'], [3 / 4, '¾'], [7 / 8, '⅞'], [1, ''],
];

export function formatQty(n) {
  if (!isFinite(n)) return '';
  if (n >= 20) return String(Math.round(n));
  let whole = Math.floor(n);
  const frac = n - whole;
  let best = FRACTIONS[0], diff = Infinity;
  for (const f of FRACTIONS) {
    const d = Math.abs(frac - f[0]);
    if (d < diff) { diff = d; best = f; }
  }
  if (diff > 0.04 && n < 10) {
    return String(Math.round(n * 100) / 100);
  }
  if (best[0] === 1) whole += 1;
  if (whole === 0 && best[1] === '') return n > 0 ? '⅛' : '0';
  return `${whole || ''}${best[1]}` || '0';
}

export function scaleIngredient(line, factor) {
  if (!line || factor === 1 || !isFinite(factor) || factor <= 0) return line;
  const m = line.match(QTY_RE);
  if (!m) return line;
  const [all, lead, a, sep, b] = m;
  let out = lead + formatQty(parseNum(a) * factor);
  if (b) out += sep + formatQty(parseNum(b) * factor);
  return out + line.slice(all.length);
}

// "Serves 4-6", "4 servings", ["4", "4 servings"], 8 -> first number found
export function parseServings(y) {
  if (Array.isArray(y)) y = y.find((v) => /\d/.test(String(v))) ?? y[0];
  if (typeof y === 'number') return y;
  const m = String(y ?? '').match(/\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}
