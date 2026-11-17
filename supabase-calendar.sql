-- Recipe app: meal plan calendar (add-on to supabase-setup.sql).
-- Paste this whole file into Supabase > SQL Editor > New query, then press "Run".
-- It is safe to run more than once.

-- What's planned for which day
create table if not exists public.meal_plan (
  id         uuid primary key default gen_random_uuid(),
  day        date not null,
  meal       text not null default 'dinner' check (meal in ('breakfast', 'lunch', 'dinner')),
  recipe_id  uuid references public.recipes (id) on delete set null,
  title      text not null,
  note       text default '',
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists meal_plan_day on public.meal_plan (day);

grant select, insert, update, delete on public.meal_plan to authenticated;
alter table public.meal_plan enable row level security;
drop policy if exists "household meal plan" on public.meal_plan;
create policy "household meal plan" on public.meal_plan
  for all to authenticated using (true) with check (true);

do $$
begin
  begin alter publication supabase_realtime add table public.meal_plan; exception when others then null; end;
end $$;

-- The private calendar link. iPhones can't sign in to a subscribed calendar,
-- so the link carries a long random code instead. Nobody can read this table
-- through the API; only the functions below use it.
create table if not exists public.calendar_feed (
  id    int primary key default 1 check (id = 1),
  token text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
);
alter table public.calendar_feed enable row level security;
revoke all on public.calendar_feed from anon, authenticated;

-- Gives a signed-in user the code for the calendar link (makes one the first time)
create or replace function public.calendar_feed_token()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare t text;
begin
  if auth.uid() is null then raise exception 'Please sign in first'; end if;
  insert into calendar_feed (id) values (1) on conflict (id) do nothing;
  select token into t from calendar_feed where id = 1;
  return t;
end;
$$;

-- Makes a new code, so the old link stops working
create or replace function public.new_calendar_feed_token()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare t text;
begin
  if auth.uid() is null then raise exception 'Please sign in first'; end if;
  insert into calendar_feed (id, token) values (1, replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
  on conflict (id) do update set token = excluded.token
  returning token into t;
  return t;
end;
$$;

revoke execute on function public.calendar_feed_token() from public, anon;
revoke execute on function public.new_calendar_feed_token() from public, anon;
grant execute on function public.calendar_feed_token() to authenticated;
grant execute on function public.new_calendar_feed_token() to authenticated;

-- Lets a function send back any kind of file (here: a calendar file instead of JSON)
do $$
begin
  if not exists (select 1 from pg_type where typname = '*/*' and typnamespace = 'public'::regnamespace) then
    create domain public."*/*" as bytea;
  end if;
end $$;

-- Calendar text needs commas, semicolons and line breaks escaped
create or replace function public.ics_text(s text)
returns text
language sql
immutable
as $$
  select replace(replace(replace(replace(replace(coalesce(s, ''),
    '\', '\\'), ';', '\;'), ',', '\,'), chr(13), ''), chr(10), '\n');
$$;

-- Calendar lines longer than 75 bytes must be split (continuation lines start with a space)
create or replace function public.ics_fold(line text)
returns text
language plpgsql
immutable
as $$
declare
  result text := '';
  chunk text;
  rest text := line;
  first boolean := true;
begin
  while rest <> '' loop
    chunk := substr(rest, 1, case when first then 60 else 59 end);
    rest := substr(rest, length(chunk) + 1);
    result := result || case when first then '' else chr(13) || chr(10) || ' ' end || chunk;
    first := false;
  end loop;
  return result;
end;
$$;

-- The calendar the iPhones subscribe to: every planned meal from 60 days ago onwards,
-- as all-day events. Called as .../rest/v1/rpc/meal_calendar?feed=<code>&apikey=<anon key>
-- supabase-chores.sql replaces this with a version that also does chores: if you re-run
-- this file, run supabase-chores.sql again afterwards.
drop function if exists public.meal_calendar(text, text);
create or replace function public.meal_calendar(feed text)
returns public."*/*"
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  nl constant text := chr(13) || chr(10);
  app constant text := 'https://donuttrigger.github.io/recipes/';
  stamp text := to_char(now() at time zone 'utc', 'YYYYMMDD"T"HH24MISS"Z"');
  out text;
  m record;
  label text;
  descr text;
begin
  if feed is null or not exists (select 1 from calendar_feed where id = 1 and token = feed) then
    raise exception 'Unknown calendar link' using errcode = '42501';
  end if;

  out := 'BEGIN:VCALENDAR' || nl || 'VERSION:2.0' || nl || 'PRODID:-//Our Recipes//Meal plan//EN' || nl
      || 'CALSCALE:GREGORIAN' || nl || 'METHOD:PUBLISH' || nl || 'X-WR-CALNAME:Meal plan' || nl
      || 'X-WR-TIMEZONE:America/Toronto' || nl
      || 'REFRESH-INTERVAL;VALUE=DURATION:PT1H' || nl || 'X-PUBLISHED-TTL:PT1H' || nl;

  for m in
    select * from meal_plan
    where day >= current_date - 60
    order by day, array_position(array['breakfast', 'lunch', 'dinner'], meal), created_at
  loop
    label := case m.meal when 'breakfast' then '🍳 Breakfast' when 'lunch' then '🥪 Lunch' else '🍽️ Dinner' end;
    descr := coalesce(nullif(m.note, ''), '');
    if m.recipe_id is not null then
      descr := descr || case when descr = '' then '' else E'\n\n' end || 'Recipe: ' || app || '#/recipe/' || m.recipe_id;
    end if;
    out := out || 'BEGIN:VEVENT' || nl
      || 'UID:' || m.id || '@our-recipes' || nl
      || 'DTSTAMP:' || stamp || nl
      || 'DTSTART;VALUE=DATE:' || to_char(m.day, 'YYYYMMDD') || nl
      || 'DTEND;VALUE=DATE:' || to_char(m.day + 1, 'YYYYMMDD') || nl
      || ics_fold('SUMMARY:' || ics_text(label || ': ' || m.title)) || nl
      || case when descr <> '' then ics_fold('DESCRIPTION:' || ics_text(descr)) || nl else '' end
      || case when m.recipe_id is not null then ics_fold('URL:' || app || '#/recipe/' || m.recipe_id) || nl else '' end
      || 'TRANSP:TRANSPARENT' || nl
      || 'END:VEVENT' || nl;
  end loop;

  out := out || 'END:VCALENDAR' || nl;

  perform set_config('response.headers',
    '[{"Content-Type": "text/calendar; charset=utf-8"}, {"Content-Disposition": "inline; filename=\"meal-plan.ics\""}, {"Cache-Control": "no-cache"}]',
    true);
  return convert_to(out, 'UTF8');
end;
$$;

revoke execute on function public.meal_calendar(text) from public;
grant execute on function public.meal_calendar(text) to anon, authenticated;
