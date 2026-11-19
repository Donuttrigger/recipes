# Our Recipes

A shared recipe app for two people (or a household), installable on iPhone
from Safari ("Add to Home Screen"). It covers recipes with photos, servings scaling, a
shared live shopping list, and importing recipes from websites.

New here? See **SETUP.md** for plain step-by-step setup.

## How it's built

There's no build step and no framework: just HTML, CSS and JavaScript modules.
Any web host that serves static files can run it.

```
index.html              page shell + bottom tab bar
styles.css              all styling (light + dark mode)
sw.js                   offline support; bump VERSION after changing files
manifest.webmanifest    home-screen name, colors, icons
js/config.js            Supabase address + public key
js/app.js               start-up and the list of screens (routes)
js/db.js                every database call (Supabase), offline cache, live sync
js/lib/scale.js         servings scaling ("1 1/2 cups" x2 -> "3 cups")
js/lib/importer.js      reads schema.org Recipe data from a web page
js/lib/scan.js          reads text from photos (Tesseract.js OCR) and PDFs (PDF.js), on the phone
js/lib/textRecipe.js    splits scanned text into title, ingredients, steps, notes
js/lib/recipeKeeper.js  reads a Recipe Keeper backup .zip (JSZip)
js/lib/dom.js           small UI helpers (toast, bottom sheet, escaping)
js/views/*.js           one file per screen: list, detail, form, shop, plan (meal calendar), login
supabase-setup.sql      database tables, security rules, photo storage, import function
supabase-calendar.sql   meal plan table + the iPhone calendar feed (run after supabase-setup.sql)
supabase-chores.sql     chores table, tick-off/undo functions, chores in the calendar feed (run after supabase-calendar.sql)
js/lib/chores.js        chore repeat maths (mirrors chore_step() in the SQL)
js/lib/sections.js      shopping sections + guessing an item's section from its words
supabase-shopping-lists.sql  several shopping lists (tabs), item sections and order
```

**Backend:** Supabase (free tier) provides Postgres, login, photo storage and realtime
sync. Every signed-in user shares the same data. Website import uses a Postgres
function (`fetch_recipe_page`, via the `http` extension) to download the page,
because browsers can't read other websites directly. The app then parses it in the browser.

## Meal plan and the iPhone calendar

The **Plan** tab keeps meals per day in the `meal_plan` table. iPhones show the same plan
through a *subscribed calendar*: `meal_calendar(feed)` is a Postgres function that returns
an `.ics` file (via PostgREST's `"*/*"` media-type domain), called as
`<SUPABASE_URL>/rest/v1/rpc/meal_calendar?feed=<code>&apikey=<anon key>`. A subscribed
calendar can't sign in, so the link carries a long random code (table `calendar_feed`,
readable only through the security-definer functions). "Stop the old link" in the app makes
a new code. The calendar is read-only: changes go in the app, and iPhones pick them up
when they refresh (about hourly).

## Chores

The **Chores** tab (`js/views/chores.js`) keeps one row per chore in `chores`. A repeating
chore has an `anchor` date and a repeat (`repeat_every` × day/week/month/year); its
`next_due` moves forward when it's ticked off. Repeats are counted from the anchor, so
garbage day keeps its weekday and "every 3 months from Jan 31" gives Apr 30, Jul 31...
Ticking off and undo run in the database (`complete_chore`, `undo_chore`), so every
client computes the same next date. Chores also show on the Plan tab and go into the
calendar feed as repeating all-day events with an 8 AM alert.

For an iPhone Shortcut that copies chores into Reminders, `chores_due(feed)` returns the
chores due by tomorrow as JSON and `complete_chore_by_link(feed, chore)` ticks one off;
both use the calendar link's private code.

## Shopping lists

`shopping_lists` holds the tabs (Grocery, Costco, ...); each `shopping_items` row has a
`list_id`, a `section` ('' means the app guesses it with `js/lib/sections.js`) and a
`position` for drag-to-reorder (SortableJS from jsDelivr, loaded only on that screen).
Items from phones on an older app version land in the first list (column default
`default_shopping_list()`). Before `supabase-shopping-lists.sql` is run, the app shows one list.

## Adding a feature

1. Make `js/views/myfeature.js` that exports `render(viewElement, ...params)`.
   It can optionally return `{ update(what), cleanup() }`, where `update` runs when data changes.
2. Add a route to `routes` in `js/app.js`, and a tab in `index.html` if you want one.
3. If it needs new data, add a table to `supabase-setup.sql` (with the same
   "household" policy) and the functions that use it to `js/db.js`.
4. Add the new file to `FILES` in `sw.js` and bump `VERSION`.

## Switching the database later (e.g. PocketBase on a home server)

`js/db.js` is the only file that talks to Supabase. The screens only call its
functions (`loadRecipes`, `saveRecipe`, `uploadPhoto`, `fetchPage`, `addShopping`, and so on)
and listen with `onChange`. To move to PocketBase or another backend, write a new `db.js` with the
same functions, and copy the data across. No screen needs to change.

## Hosting it yourself

The whole app is static files, so any web server works. iPhones need **https** to
install it to the home screen. For example, with Docker:

```
docker run -d --name recipes -p 8080:80 -v "$PWD":/usr/share/nginx/html:ro nginx:alpine
```

Then put it behind your HTTPS reverse proxy (Caddy, Nginx Proxy Manager, Cloudflare Tunnel, etc.).
The database stays on Supabase either way.

## Testing locally

```
python3 -m http.server 8000
```

Then open http://localhost:8000.
