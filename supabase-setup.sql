-- Recipe app: one-time database setup.
-- Paste this whole file into Supabase > SQL Editor > New query, then press "Run".
-- It is safe to run more than once.

-- Lets the database download recipe web pages for "Import from a website"
create extension if not exists http with schema extensions;

create table if not exists public.recipes (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  description text default '',
  photo_url   text default '',
  servings    numeric default 4,
  prep_time   text default '',
  cook_time   text default '',
  ingredients text[] not null default '{}',
  steps       text[] not null default '{}',
  notes       text default '',
  source_url  text default '',
  tags        text[] not null default '{}',
  favorite    boolean not null default false,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.shopping_items (
  id           uuid primary key default gen_random_uuid(),
  text         text not null,
  checked      boolean not null default false,
  recipe_title text default '',
  created_at   timestamptz not null default now()
);

grant select, insert, update, delete on public.recipes, public.shopping_items to authenticated;

-- Only people signed in to the app can see or change anything.
-- Everyone signed in shares the same recipes and shopping list.
alter table public.recipes enable row level security;
alter table public.shopping_items enable row level security;

drop policy if exists "household recipes" on public.recipes;
create policy "household recipes" on public.recipes
  for all to authenticated using (true) with check (true);

drop policy if exists "household shopping" on public.shopping_items;
create policy "household shopping" on public.shopping_items
  for all to authenticated using (true) with check (true);

-- Live sync: changes on one phone show up on the other right away
do $$
begin
  begin alter publication supabase_realtime add table public.recipes; exception when others then null; end;
  begin alter publication supabase_realtime add table public.shopping_items; exception when others then null; end;
end $$;

-- Photo storage
insert into storage.buckets (id, name, public)
values ('recipe-photos', 'recipe-photos', true)
on conflict (id) do nothing;

drop policy if exists "household photo upload" on storage.objects;
create policy "household photo upload" on storage.objects
  for insert to authenticated with check (bucket_id = 'recipe-photos');

drop policy if exists "household photo change" on storage.objects;
create policy "household photo change" on storage.objects
  for update to authenticated using (bucket_id = 'recipe-photos');

drop policy if exists "household photo delete" on storage.objects;
create policy "household photo delete" on storage.objects
  for delete to authenticated using (bucket_id = 'recipe-photos');

-- Downloads a recipe page so the app can read the recipe out of it
create or replace function public.fetch_recipe_page(page_url text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  resp extensions.http_response;
  host text;
begin
  if auth.uid() is null then
    raise exception 'Please sign in first';
  end if;
  if page_url !~* '^https?://' then
    raise exception 'That does not look like a web address';
  end if;
  host := lower(substring(page_url from '^https?://([^/:?#]+)'));
  if host ~ '^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2[0-9]|3[01])\.|0\.|\[)' then
    raise exception 'That address is not allowed';
  end if;

  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT', '20');
  select * into resp from extensions.http((
    'GET',
    page_url,
    array[
      extensions.http_header('User-Agent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'),
      extensions.http_header('Accept', 'text/html,application/xhtml+xml'),
      extensions.http_header('Accept-Language', 'en-US,en;q=0.9')
    ],
    null,
    null
  )::extensions.http_request);

  if resp.status >= 400 then
    raise exception 'The website said no (error %). Try copying the recipe in by hand.', resp.status;
  end if;
  return resp.content;
end;
$$;

revoke execute on function public.fetch_recipe_page(text) from public, anon;
grant execute on function public.fetch_recipe_page(text) to authenticated;
