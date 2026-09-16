-- Initial schema for TR Assistant.
-- Every table is owned by one user and protected by row-level security.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Workspaces: top-level areas of life. Seeded per user, editable in the UI.
-- ---------------------------------------------------------------------------

create table public.workspaces (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null,
  slug        text not null,
  color       text,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  unique (user_id, slug)
);

-- ---------------------------------------------------------------------------
-- Projects
-- ---------------------------------------------------------------------------

create table public.projects (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  workspace_id  uuid references public.workspaces (id) on delete set null,
  name          text not null,
  description   text,
  status        text not null default 'active' check (status in ('active', 'archived')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Organizations and people
-- ---------------------------------------------------------------------------

create table public.organizations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now()
);

create table public.people (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name             text not null,
  aliases          text[] not null default '{}',
  organization_id  uuid references public.organizations (id) on delete set null,
  notes            text,
  created_at       timestamptz not null default now()
);

-- "Matt" always resolves to one row per user.
create unique index people_user_name_key on public.people (user_id, lower(name));

-- ---------------------------------------------------------------------------
-- Inbox: every capture lands here first and is never deleted.
-- item_id is added after items exists (circular reference).
-- ---------------------------------------------------------------------------

create table public.inbox_items (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  raw_text       text not null,
  source         text not null default 'web' check (source in ('web', 'api', 'voice')),
  status         text not null default 'pending'
                 check (status in ('pending', 'processing', 'processed', 'needs_review', 'failed')),
  ai_result      jsonb,
  ai_confidence  numeric(4, 3) check (ai_confidence between 0 and 1),
  ai_model       text,
  ai_error       text,
  created_at     timestamptz not null default now(),
  processed_at   timestamptz
);

create index inbox_items_user_status_idx
  on public.inbox_items (user_id, status, created_at desc);

-- ---------------------------------------------------------------------------
-- Items: tasks, follow-ups, and notes in one table.
-- ---------------------------------------------------------------------------

create table public.items (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind             text not null check (kind in ('task', 'followup', 'note')),
  title            text not null,
  body             text,
  source_text      text,
  status           text not null default 'open'
                   check (status in ('open', 'waiting', 'done', 'archived')),
  priority         text check (priority in ('low', 'normal', 'high')),
  due_at           timestamptz,
  workspace_id     uuid references public.workspaces (id) on delete set null,
  project_id       uuid references public.projects (id) on delete set null,
  organization_id  uuid references public.organizations (id) on delete set null,
  category         text,
  tags             text[] not null default '{}',
  inbox_item_id    uuid references public.inbox_items (id) on delete set null,
  completed_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  search           tsvector generated always as (
                     to_tsvector(
                       'english',
                       coalesce(title, '') || ' ' ||
                       coalesce(body, '') || ' ' ||
                       coalesce(source_text, '')
                     )
                   ) stored
);

create trigger items_set_updated_at
  before update on public.items
  for each row execute function public.set_updated_at();

create index items_user_status_due_idx on public.items (user_id, status, due_at);
create index items_user_project_idx   on public.items (user_id, project_id);
create index items_search_idx         on public.items using gin (search);
create index items_tags_idx           on public.items using gin (tags);

alter table public.inbox_items
  add column item_id uuid references public.items (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Relations
-- ---------------------------------------------------------------------------

create table public.item_people (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  item_id    uuid not null references public.items (id) on delete cascade,
  person_id  uuid not null references public.people (id) on delete cascade,
  role       text not null default 'mentioned' check (role in ('waiting_on', 'mentioned', 'owner')),
  primary key (item_id, person_id, role)
);

create index item_people_person_idx on public.item_people (user_id, person_id);

create table public.item_links (
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  from_item_id  uuid not null references public.items (id) on delete cascade,
  to_item_id    uuid not null references public.items (id) on delete cascade,
  primary key (from_item_id, to_item_id),
  check (from_item_id <> to_item_id)
);

-- ---------------------------------------------------------------------------
-- Row-level security: each user sees and writes only their own rows.
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'workspaces', 'projects', 'organizations', 'people',
    'inbox_items', 'items', 'item_people', 'item_links'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (user_id = auth.uid()) with check (user_id = auth.uid())',
      t || '_owner', t
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Seed default workspaces when a user is created.
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.workspaces (user_id, name, slug, sort_order) values
    (new.id, 'Personal',           'personal',           1),
    (new.id, 'Carleton Equipment', 'carleton-equipment', 2),
    (new.id, 'CECO',               'ceco',               3),
    (new.id, 'Home',               'home',               4),
    (new.id, 'Development',        'development',        5);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
