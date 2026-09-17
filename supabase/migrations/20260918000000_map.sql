-- Phase 9: goals, links between items, and the map.
-- Run after 20260917000000_brain.sql (related_items reads item_embeddings).
--
-- Written to be safe to run again: every statement either uses IF NOT EXISTS
-- or drops what it is about to create. A part-applied run is fixed by simply
-- running the whole file once more.

-- ---------------------------------------------------------------------------
-- A fourth kind: the goal. Other items become steps toward it through
-- item_links, so a goal has no columns of its own.
-- ---------------------------------------------------------------------------

alter table public.items drop constraint if exists items_kind_check;
alter table public.items
  add constraint items_kind_check check (kind in ('task', 'followup', 'note', 'goal'));

-- ---------------------------------------------------------------------------
-- item_links has existed, empty, since the first migration. Give it meaning:
--   related  no direction; stored once, read both ways
--   step     from_item_id is a step toward the goal to_item_id, ordered by position
--   blocks   from_item_id has to be done before to_item_id can start
-- `suggested` links are proposals from the similarity search, drawn dotted
-- until accepted. `dismissed` rows stay so the same pair is not proposed again.
--
-- The columns and their checks are added separately, so a re-run still fixes
-- up a constraint even when the column itself is already there.
-- ---------------------------------------------------------------------------

alter table public.item_links
  add column if not exists kind       text not null default 'related',
  add column if not exists status     text not null default 'confirmed',
  add column if not exists position   integer,
  add column if not exists created_at timestamptz not null default now();

alter table public.item_links drop constraint if exists item_links_kind_check;
alter table public.item_links
  add constraint item_links_kind_check check (kind in ('related', 'step', 'blocks'));

alter table public.item_links drop constraint if exists item_links_status_check;
alter table public.item_links
  add constraint item_links_status_check check (status in ('confirmed', 'suggested', 'dismissed'));

create index if not exists item_links_to_idx on public.item_links (user_id, to_item_id);

-- ---------------------------------------------------------------------------
-- Where each node sits on the map. node_id is "item:<uuid>", "project:<uuid>"
-- or "person:<uuid>". Every laid-out node is saved so the map looks the same
-- on the next visit; `pinned` marks the ones placed by hand, which the layout
-- never moves.
-- ---------------------------------------------------------------------------

create table if not exists public.map_positions (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  node_id     text not null,
  x           double precision not null,
  y           double precision not null,
  pinned      boolean not null default false,
  updated_at  timestamptz not null default now(),
  primary key (user_id, node_id)
);

alter table public.map_positions enable row level security;
drop policy if exists map_positions_owner on public.map_positions;
create policy map_positions_owner on public.map_positions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Items closest in meaning to one item, from its stored embedding. Feeds the
-- suggested links. Security invoker, so row-level security still applies.
-- ---------------------------------------------------------------------------

create or replace function public.related_items(
  source_id uuid,
  match_count integer default 5,
  min_similarity double precision default 0.45
)
returns table (item_id uuid, similarity double precision)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select e.item_id, 1 - (e.embedding <=> s.embedding) as similarity
  from public.item_embeddings s
  join public.item_embeddings e on e.item_id <> s.item_id and e.user_id = s.user_id
  join public.items i on i.id = e.item_id
  where s.item_id = source_id
    and i.status <> 'archived'
    and 1 - (e.embedding <=> s.embedding) >= min_similarity
  order by e.embedding <=> s.embedding
  limit match_count;
$$;
