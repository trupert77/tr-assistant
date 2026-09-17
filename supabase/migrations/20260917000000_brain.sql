-- Phase 8: notifications, recurrence, attachments, semantic search.
-- Runs on top of 20260916000000_init.sql.
--
-- Written to be safe to run again: every statement either uses IF NOT EXISTS
-- or drops what it is about to create. A part-applied run is fixed by simply
-- running the whole file once more.

-- ---------------------------------------------------------------------------
-- Recurring items. Completing one spawns the next; `recurred_from` makes the
-- spawn idempotent (complete → undo → complete never doubles up).
-- ---------------------------------------------------------------------------

alter table public.items
  add column if not exists recurrence text,
  add column if not exists recurred_from uuid references public.items (id) on delete set null;

alter table public.items drop constraint if exists items_recurrence_check;
alter table public.items
  add constraint items_recurrence_check
  check (recurrence in ('daily', 'weekdays', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'));

create unique index if not exists items_recurred_from_key
  on public.items (recurred_from) where recurred_from is not null;

-- ---------------------------------------------------------------------------
-- Due-time reminders: set when the push for this due time has gone out.
-- Cleared by the app whenever due_at changes.
-- ---------------------------------------------------------------------------

alter table public.items add column if not exists reminded_at timestamptz;

-- ---------------------------------------------------------------------------
-- Photo captures. The file lives in the private `captures` bucket under
-- <user id>/<uuid>.jpg; both rows keep the path.
-- ---------------------------------------------------------------------------

alter table public.inbox_items add column if not exists attachment_path text;
alter table public.items       add column if not exists attachment_path text;

alter table public.inbox_items drop constraint if exists inbox_items_source_check;
alter table public.inbox_items
  add constraint inbox_items_source_check
  check (source in ('web', 'api', 'voice', 'share'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('captures', 'captures', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists captures_owner_select on storage.objects;
create policy captures_owner_select on storage.objects
  for select to authenticated
  using (bucket_id = 'captures' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists captures_owner_insert on storage.objects;
create policy captures_owner_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'captures' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists captures_owner_update on storage.objects;
create policy captures_owner_update on storage.objects
  for update to authenticated
  using (bucket_id = 'captures' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- Web push subscriptions, one per installed device.
-- ---------------------------------------------------------------------------

create table if not exists public.push_subscriptions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint         text not null unique,
  p256dh           text not null,
  auth             text not null,
  user_agent       text,
  created_at       timestamptz not null default now(),
  last_success_at  timestamptz
);

-- One row per (user, kind, local day). The unique key is the lock: whichever
-- cron run inserts first sends the digest, every other run that day skips.
create table if not exists public.notification_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind        text not null,
  local_date  date not null,
  sent_at     timestamptz not null default now(),
  unique (user_id, kind, local_date)
);

-- ---------------------------------------------------------------------------
-- Semantic search. Embeddings sit in their own table so `select *` on items
-- never drags 1536 floats along. `content_hash` says when one is stale.
-- ---------------------------------------------------------------------------

create extension if not exists vector with schema extensions;

alter table public.items
  add column if not exists content_hash text generated always as (
    md5(coalesce(title, '') || chr(10) || coalesce(body, '') || chr(10) || coalesce(source_text, ''))
  ) stored;

create table if not exists public.item_embeddings (
  item_id       uuid primary key references public.items (id) on delete cascade,
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  content_hash  text not null,
  embedding     extensions.vector(1536) not null,
  updated_at    timestamptz not null default now()
);

create index if not exists item_embeddings_hnsw_idx
  on public.item_embeddings using hnsw (embedding extensions.vector_cosine_ops);

-- Items whose embedding is missing or out of date, oldest first.
create or replace function public.items_to_embed(max_count integer default 25)
returns table (id uuid, user_id uuid, title text, body text, source_text text, content_hash text)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select i.id, i.user_id, i.title, i.body, i.source_text, i.content_hash
  from public.items i
  left join public.item_embeddings e on e.item_id = i.id
  where i.status <> 'archived'
    and (e.item_id is null or e.content_hash <> i.content_hash)
  order by i.created_at
  limit max_count;
$$;

-- Nearest items to a query embedding. Security invoker, so RLS still applies.
create or replace function public.match_items(
  query_embedding extensions.vector(1536),
  match_count integer default 20,
  min_similarity double precision default 0.25
)
returns table (item_id uuid, similarity double precision)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select e.item_id, 1 - (e.embedding <=> query_embedding) as similarity
  from public.item_embeddings e
  join public.items i on i.id = e.item_id
  where i.status <> 'archived'
    and 1 - (e.embedding <=> query_embedding) >= min_similarity
  order by e.embedding <=> query_embedding
  limit match_count;
$$;

-- ---------------------------------------------------------------------------
-- Row-level security for the new tables.
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['push_subscriptions', 'notification_log', 'item_embeddings']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_owner', t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (user_id = auth.uid()) with check (user_id = auth.uid())',
      t || '_owner', t
    );
  end loop;
end;
$$;
