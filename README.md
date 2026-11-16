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
js/lib/dom.js           small UI helpers (toast, bottom sheet, escaping)
js/views/*.js           one file per screen: list, detail, form, shop, login
supabase-setup.sql      database tables, security rules, photo storage, import function
```

**Backend:** Supabase (free tier) provides Postgres, login, photo storage and realtime
sync. Every signed-in user shares the same data. Website import uses a Postgres
function (`fetch_recipe_page`, via the `http` extension) to download the page,
because browsers can't read other websites directly. The app then parses it in the browser.

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
