-- Recipe app: chores (add-on, run after supabase-calendar.sql).
-- Paste this whole file into Supabase > SQL Editor > New query, then press "Run".
-- It is safe to run more than once.

-- One row per chore. A repeating chore keeps one row; ticking it off moves next_due forward.
create table if not exists public.chores (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  notes        text default '',
  anchor       date not null,              -- first date; repeats are counted from here (keeps garbage day on its weekday)
  next_due     date not null,
  prev_due     date,                       -- for "undo"
  repeat_unit  text check (repeat_unit in ('day', 'week', 'month', 'year')), -- null = one time
  repeat_every int not null default 1 check (repeat_every between 1 and 365),
  done_at      timestamptz,                -- set when a one-time chore is finished
  last_done_at timestamptz,
  last_done_by text default '',
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now()
);
create index if not exists chores_next_due on public.chores (next_due);

grant select, insert, update, delete on public.chores to authenticated;
alter table public.chores enable row level security;
drop policy if exists "household chores" on public.chores;
create policy "household chores" on public.chores
  for all to authenticated using (true) with check (true);

do $$
begin
  begin alter publication supabase_realtime add table public.chores; exception when others then null; end;
end $$;

-- "Today" in Kade's time zone (the database clock is UTC)
create or replace function public.home_today()
returns date
language sql
stable
as $$ select (now() at time zone 'America/Toronto')::date; $$;

-- The date k repeats after the anchor
create or replace function public.chore_step(anchor date, unit text, every int, k int)
returns date
language sql
immutable
as $$
  select (anchor + case unit
    when 'day' then make_interval(days => every * k)
    when 'week' then make_interval(weeks => every * k)
    when 'month' then make_interval(months => every * k)
    else make_interval(years => every * k) end)::date;
$$;

-- Ticks a chore off: a one-time chore is finished; a repeating one moves to its next date after today.
create or replace function public._complete_chore(chore uuid, who text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c chores%rowtype;
  bound date;
  k int := 0;
  nxt date;
begin
  select * into c from chores where id = chore for update;
  if not found then raise exception 'That chore no longer exists'; end if;
  if c.repeat_unit is null then
    if c.done_at is null then
      update chores set done_at = now(), last_done_at = now(), last_done_by = who where id = chore;
    end if;
    return;
  end if;
  bound := greatest(c.next_due, home_today());
  loop
    nxt := chore_step(c.anchor, c.repeat_unit, c.repeat_every, k);
    exit when nxt > bound or k > 20000;
    k := k + 1;
  end loop;
  update chores set prev_due = c.next_due, next_due = nxt, last_done_at = now(), last_done_by = who where id = chore;
end;
$$;
revoke execute on function public._complete_chore(uuid, text) from public, anon, authenticated;

-- Called by the app
create or replace function public.complete_chore(chore uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Please sign in first'; end if;
  perform _complete_chore(chore, split_part(coalesce(auth.jwt() ->> 'email', ''), '@', 1));
end;
$$;

-- Puts back the last tick (in case of a mis-tap)
create or replace function public.undo_chore(chore uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Please sign in first'; end if;
  update chores set
    done_at = null,
    next_due = case when repeat_unit is not null and prev_due is not null then prev_due else next_due end,
    prev_due = null,
    last_done_at = null,
    last_done_by = ''
  where id = chore;
end;
$$;

revoke execute on function public.complete_chore(uuid) from public, anon;
revoke execute on function public.undo_chore(uuid) from public, anon;
grant execute on function public.complete_chore(uuid) to authenticated;
grant execute on function public.undo_chore(uuid) to authenticated;

-- For an iPhone Shortcut that copies chores into the Reminders app: open chores due by tomorrow, as JSON.
-- Uses the same private code as the calendar link.
create or replace function public.chores_due(feed text)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if feed is null or not exists (select 1 from calendar_feed where id = 1 and token = feed) then
    raise exception 'Unknown calendar link' using errcode = '42501';
  end if;
  return coalesce((
    select json_agg(json_build_object('id', id, 'title', title, 'due', next_due, 'notes', notes) order by next_due, title)
    from chores
    where done_at is null and next_due <= home_today() + 1
  ), '[]'::json);
end;
$$;

-- For the same Shortcut: ticks a chore off when it's completed in Reminders
create or replace function public.complete_chore_by_link(feed text, chore uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if feed is null or not exists (select 1 from calendar_feed where id = 1 and token = feed) then
    raise exception 'Unknown calendar link' using errcode = '42501';
  end if;
  perform _complete_chore(chore, 'iPhone Reminders');
end;
$$;

revoke execute on function public.chores_due(text) from public;
revoke execute on function public.complete_chore_by_link(text, uuid) from public;
grant execute on function public.chores_due(text) to anon, authenticated;
grant execute on function public.complete_chore_by_link(text, uuid) to anon, authenticated;

-- The calendar the iPhones subscribe to, now with chores: meals as before, plus each open chore
-- as an all-day event (repeating chores repeat in the calendar too) with an 8 AM alert.
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
      || 'CALSCALE:GREGORIAN' || nl || 'METHOD:PUBLISH' || nl || 'X-WR-CALNAME:Meals & chores' || nl
      || 'X-WR-TIMEZONE:America/Toronto' || nl
      || 'REFRESH-INTERVAL;VALUE=DURATION:PT1H' || nl || 'X-PUBLISHED-TTL:PT1H' || nl;

  for m in
    select * from meal_plan
    where day >= home_today() - 60
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

  for m in select * from chores where done_at is null order by next_due, title loop
    out := out || 'BEGIN:VEVENT' || nl
      || 'UID:chore-' || m.id || '@our-recipes' || nl
      || 'DTSTAMP:' || stamp || nl
      || 'DTSTART;VALUE=DATE:' || to_char(m.next_due, 'YYYYMMDD') || nl
      || 'DTEND;VALUE=DATE:' || to_char(m.next_due + 1, 'YYYYMMDD') || nl
      || case when m.repeat_unit is not null then
           'RRULE:FREQ=' || case m.repeat_unit when 'day' then 'DAILY' when 'week' then 'WEEKLY' when 'month' then 'MONTHLY' else 'YEARLY' end
           || ';INTERVAL=' || m.repeat_every || nl
         else '' end
      || ics_fold('SUMMARY:' || ics_text('🧹 ' || m.title)) || nl
      || ics_fold('DESCRIPTION:' || ics_text(coalesce(nullif(m.notes, '') || E'\n\n', '') || 'Tick it off in the app: ' || app || '#/chores')) || nl
      || ics_fold('URL:' || app || '#/chores') || nl
      || 'TRANSP:TRANSPARENT' || nl
      || 'BEGIN:VALARM' || nl || 'ACTION:DISPLAY' || nl || ics_fold('DESCRIPTION:' || ics_text(m.title)) || nl
      || 'TRIGGER:PT8H' || nl || 'END:VALARM' || nl
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
