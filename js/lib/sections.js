// Store sections for the shopping list, in roughly the order you walk a store,
// and a guess at the section from an item's words ("chicken thighs" → Meat & Seafood).

export const SECTIONS = ['Produce', 'Meat & Seafood', 'Dairy & Eggs', 'Bakery', 'Frozen', 'Pantry', 'Drinks', 'Household', 'Other'];

// Frozen and Household words win outright ("frozen peas", "dish soap"). Otherwise the longest matching
// phrase wins ("hamburger buns" → Bakery, "bell pepper" → Produce, "chicken broth" → Pantry);
// ties go to the section listed first.
const WORDS = [
  ['Frozen', ['frozen', 'ice cream', 'popsicle', 'freezer']],
  ['Household', ['paper towel', 'toilet paper', 'tissue', 'napkin', 'detergent', 'dish soap', 'dishwasher', 'soap', 'shampoo',
    'conditioner', 'toothpaste', 'deodorant', 'garbage bag', 'trash bag', 'foil', 'plastic wrap', 'ziploc', 'zip lock',
    'sandwich bag', 'parchment', 'bleach', 'cleaner', 'sponge', 'batteries', 'light bulb', 'diaper', 'wipes', 'razor',
    'lotion', 'pet food', 'dog food', 'cat food', 'litter']],
  ['Pantry', ['chicken broth', 'beef broth', 'vegetable broth', 'chicken stock', 'beef stock', 'black pepper',
    'chicken bouillon', 'broth', 'stock', 'bouillon', 'canned', 'can of', 'tin of', 'flour', 'sugar', 'salt', 'pepper', 'spice',
    'cumin', 'paprika', 'oregano', 'basil leaves dried', 'cinnamon', 'nutmeg', 'chili powder', 'garlic powder', 'onion powder',
    'baking soda', 'baking powder', 'yeast', 'vanilla', 'oil', 'vinegar', 'soy sauce', 'sauce', 'ketchup', 'mustard', 'mayo',
    'mayonnaise', 'relish', 'salsa', 'pasta', 'spaghetti', 'macaroni', 'noodle', 'rice', 'quinoa', 'oats', 'oatmeal', 'cereal',
    'granola', 'beans', 'lentils', 'chickpeas', 'tomato paste', 'crushed tomatoes', 'diced tomatoes', 'peanut butter', 'jam',
    'jelly', 'honey', 'syrup', 'maple', 'chips', 'crackers', 'cookies', 'nuts', 'almonds', 'walnuts', 'pecans', 'raisins',
    'chocolate chips', 'cocoa', 'breadcrumbs', 'bread crumbs', 'panko', 'cornstarch', 'stuffing', 'taco seasoning',
    'seasoning', 'dressing', 'tortilla chips', 'popcorn', 'coconut milk', 'evaporated milk', 'condensed milk', 'gravy']],
  ['Meat & Seafood', ['chicken', 'beef', 'steak', 'pork', 'bacon', 'ham', 'sausage', 'turkey', 'lamb', 'veal', 'ground',
    'mince', 'ribs', 'roast', 'brisket', 'chops', 'tenderloin', 'wings', 'thighs', 'drumsticks', 'breast', 'salami',
    'pepperoni', 'prosciutto', 'hot dog', 'wieners', 'fish', 'salmon', 'tuna', 'cod', 'tilapia', 'halibut', 'shrimp', 'prawn',
    'scallop', 'crab', 'lobster', 'mussels', 'clams', 'deli meat', 'meatballs', 'chorizo', 'pulled pork']],
  ['Dairy & Eggs', ['milk', 'cream', 'butter', 'cheese', 'cheddar', 'mozzarella', 'parmesan', 'feta', 'ricotta', 'yogurt',
    'yoghurt', 'sour cream', 'cottage cheese', 'cream cheese', 'egg', 'margarine', 'half and half', 'half-and-half', 'kefir']],
  ['Bakery', ['bread', 'bun', 'buns', 'roll', 'rolls', 'bagel', 'baguette', 'croissant', 'muffin', 'tortilla', 'wrap', 'pita',
    'naan', 'english muffin', 'cake', 'pie crust', 'donut', 'doughnut', 'loaf']],
  ['Drinks', ['orange juice', 'apple juice', 'juice', 'pop', 'soda', 'coffee', 'tea', 'water', 'sparkling', 'beer', 'wine', 'gatorade', 'kombucha', 'coke',
    'pepsi', 'sprite', 'ginger ale', 'lemonade', 'iced tea']],
  ['Produce', ['apple', 'banana', 'orange', 'lemon', 'lime', 'grape', 'berries', 'strawberr', 'blueberr', 'raspberr',
    'blackberr', 'cherr', 'peach', 'pear', 'plum', 'mango', 'pineapple', 'melon', 'watermelon', 'kiwi', 'avocado', 'tomato',
    'potato', 'sweet potato', 'onion', 'garlic', 'shallot', 'scallion', 'green onion', 'leek', 'carrot', 'celery', 'pepper',
    'bell pepper', 'jalapeno', 'jalapeño', 'cucumber', 'zucchini', 'squash', 'pumpkin', 'lettuce', 'spinach', 'kale',
    'arugula', 'cabbage', 'broccoli', 'cauliflower', 'asparagus', 'green beans', 'peas', 'corn', 'mushroom', 'eggplant',
    'radish', 'beet', 'herbs', 'cilantro', 'parsley', 'basil', 'mint', 'dill', 'rosemary', 'thyme', 'ginger', 'salad',
    'sprouts', 'fruit', 'vegetable', 'veggie']],
];

// Whole-word-ish match: "pop" shouldn't match "popcorn" (Pantry wins earlier anyway), "ham" shouldn't match "shampoo".
const matches = (text, word) => new RegExp(`(^|[^a-z])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(text);

const OVERRIDE = ['Frozen', 'Household'];

export function guessSection(text = '') {
  const t = text.toLowerCase();
  let best = 'Other';
  let bestLen = 0;
  for (const [section, words] of WORDS) {
    const hit = words.filter((w) => matches(t, w));
    if (!hit.length) continue;
    if (OVERRIDE.includes(section)) return section;
    const len = Math.max(...hit.map((w) => w.length));
    if (len > bestLen) { best = section; bestLen = len; }
  }
  return best;
}

// The section an item shows under: the one picked by hand, else the guess
export const sectionOf = (item) => (SECTIONS.includes(item.section) ? item.section : guessSection(item.text));
