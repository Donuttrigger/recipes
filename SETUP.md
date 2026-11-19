# Setting up Our Recipes

This takes about 10 minutes. It's free, with no credit card needed.

You do **Part 1** (the database). Then send Claude two pieces of text from it, and Claude does the rest.

---

## Part 1: Create the free database (Supabase)

Supabase stores your recipes, photos and shopping list so both phones see the same thing.

1. Go to **https://supabase.com** and tap **Start your project**.
2. Choose **Continue with GitHub** (you already have a GitHub account), and approve.
3. Tap **New project**.
   - **Name:** `recipes`
   - **Database password:** tap **Generate a password**. You won't need it again, but save it in your notes just in case.
   - **Region:** pick the one closest to you.
   - Tap **Create new project**. Wait a minute or two while it sets up.
4. **Set up the tables.** In the left sidebar, tap **SQL Editor**, then tap **+ New query**.
   Open the file `supabase-setup.sql`, copy **all** of it, paste it in, and tap **Run**.
   You should see "Success. No rows returned".
   Then do the same with `supabase-calendar.sql` (the meal plan calendar), and then `supabase-chores.sql` (chores).
5. **Create your two logins.** In the left sidebar, tap **Authentication** and then **Users**.
   Tap **Add user** → **Create new user**. Enter your email and a password, leave
   **Auto Confirm User** ticked, and tap **Create user**. Do the same for your girlfriend's email.
6. **Stop strangers from signing up.** Still in Authentication, open **Sign In / Providers**
   (on some screens it's called **Providers**, under Configuration). Turn **off** "Allow new users to sign up" and tap **Save**.
7. **Get the two bits of text Claude needs.** Tap **Project Settings** (the gear icon), then **Data API** (or **API**). Copy:
   - **Project URL**, which looks like `https://abcdefgh.supabase.co`
   - the **anon public** key, a long string starting with `eyJ` (it might be under "API Keys"). Don't send the `service_role` key, which is secret.

   Paste both into the chat with Claude. The anon key is designed to be public, so it's safe to share.

---

## Part 2: Put the app online (Claude does most of this)

**If you're using free GitHub Pages hosting:**
1. Go to **https://github.com/new**.
2. **Repository name:** `recipes`. Keep it **Public**, because free GitHub hosting needs that. Your recipes stay private, since they live in the database behind your login and only the app's code is public. Leave everything else as it is and tap **Create repository**.
3. Tell Claude it's done. Claude uploads the app and turns on hosting.
   Your app will be at `https://donuttrigger.github.io/recipes/`.

**If you're using your own server**, see `README.md` → "Hosting it yourself".

---

## Part 3: Put it on both iPhones

1. On the iPhone, open the app's address in **Safari** (it has to be Safari).
2. Tap the **Share** button (the square with an arrow pointing up).
3. Scroll down and tap **Add to Home Screen**, then tap **Add**.
4. Open **Recipes** from the home screen and sign in.

Do the same on the other iPhone. You're done! 🎉

---

## Using the app

- **Add a recipe from a website:** tap **Add**, paste the link, and tap **Import**. Check it over, then tap **Save**.
  A few sites block this. When that happens, type or paste the recipe in yourself.
- **Add a recipe from a photo or PDF:** tap **Add**, then **Scan a photo or PDF**. Take a photo of a recipe card or cookbook page, or pick a PDF.
  For a recipe over two pages, pick both photos at once. The first scan downloads the reader, so it takes a little longer.
  Scanning isn't perfect, so check the fields before tapping **Save**.
- **Move recipes from Recipe Keeper:** in Recipe Keeper, make a backup (Settings → Backup), then in this app tap **Add** → **Import a Recipe Keeper backup** and pick the .zip.
  Running it again skips recipes you already have.
- **Change servings:** on a recipe, use the **− / +** buttons. All the amounts update.
- **Shopping lists:** tabs at the top (Grocery, Costco, ...); **+** adds a list, press and hold a tab to rename or delete it.
  Items group under store sections automatically. Tap **⋯** on an item to move it to another list or change its section;
  drag **☰** to reorder. Tap an item to tick it off; your girlfriend sees it ticked off on her phone too.
  On a recipe, **Add to shopping list** lets you pick which list the ingredients go to.
- **Photos:** when adding or editing a recipe, tap **Choose photo** to take one or pick one from your library.
- **Meal plan:** tap **Plan**, then **+ Add** on a day and pick a recipe (or type something like "Leftovers").
  From a recipe, tap **Add to meal plan**. Use ‹ › to move between weeks.
- **See the plan in the iPhone Calendar app:** on the Plan tab tap **📅 iPhone Calendar**, then **Subscribe on this iPhone**.
  The meals appear as all-day events in a calendar called "Meal plan" and update by themselves.
  Do it once on each iPhone. You change meals in the app, not in the Calendar app.

- **Chores:** tap **Chores** → **+ Add**. Pick an idea or type your own, choose the first day and how often it repeats.
  Tap the circle when it's done: a repeating chore moves to its next date. Tap a chore to change or delete it.
  Chores due today or overdue show a number on the Chores tab, and they appear on the Plan tab and in the iPhone calendar.

## Adding several shopping lists to an app that's already set up

Same as below, but with `supabase-shopping-lists.sql`.

## Adding chores to an app that's already set up

Same as below, but with `supabase-chores.sql`.

## Adding the meal plan to an app that's already set up

1. Open Supabase → **SQL Editor** → **+ New query**.
2. Open `supabase-calendar.sql`, copy **all** of it, paste it in, and tap **Run**. You should see "Success".
3. Close the Recipes app completely and open it again.
