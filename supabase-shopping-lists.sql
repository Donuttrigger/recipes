-- Recipe app: several shopping lists (Grocery, Costco, ...) with sections and drag-to-reorder.
-- Add-on to supabase-setup.sql. Paste this whole file into Supabase > SQL Editor > New query,
-- then press "Run". It is safe to run more than once.

create table if not exists public.shopping_lists (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  position   int not null default 0,   -- tab order
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.shopping_lists to authenticated;
alter table public.shopping_lists enable row level security;
drop policy if exists "household shopping lists" on public.shopping_lists;
create policy "household shopping lists" on public.shopping_lists
  for all to authenticated using (true) with check (true);

do $$
begin
  begin alter publication supabase_realtime add table public.shopping_lists; exception when others then null; end;
end $$;

-- Start with Grocery and Costco (only the first time)
insert into public.shopping_lists (name, position)
select v.name, v.position from (values ('Grocery', 0), ('Costco', 1)) as v(name, position)
where not exists (select 1 from public.shopping_lists);

-- New items with no list (e.g. from a phone still on the old app) go to the first tab
create or replace function public.default_shopping_list()
returns uuid
language sql
stable
security definer
set search_path = public
as $$ select id from shopping_lists order by position, created_at limit 1; $$;

alter table public.shopping_items
  add column if not exists list_id uuid references public.shopping_lists (id) on delete cascade,
  add column if not exists section text not null default '',          -- '' = let the app guess
  add column if not exists position double precision;                -- order within the list

alter table public.shopping_items alter column list_id set default public.default_shopping_list();
-- New items go to the bottom (milliseconds since 1970)
alter table public.shopping_items alter column position set default (extract(epoch from now()) * 1000);

-- Existing items: keep their order, put them all in the first list
update public.shopping_items set position = extract(epoch from created_at) * 1000 where position is null;
update public.shopping_items set list_id = public.default_shopping_list() where list_id is null;

create index if not exists shopping_items_list on public.shopping_items (list_id);
