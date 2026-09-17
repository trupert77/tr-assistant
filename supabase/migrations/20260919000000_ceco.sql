-- Phase 10: the CECO app's scope, mirrored read-only.
-- Independent of the Phase 8 and 9 migrations; run in any order after init.
--
-- Everything here lives in THIS app's database. The assistant reaches CECO
-- only over HTTPS with a bearer token; it holds no credential for CECO's
-- database and nothing in this file touches it.
--
-- Written to be safe to run again: every statement either uses IF NOT EXISTS
-- or drops what it is about to create.

-- ---------------------------------------------------------------------------
-- The last good copy of an outside system's description of itself. For CECO
-- that is GET /api/assistant/scope: areas, pages, recent What's New entries.
-- One row per source. Pages read this copy, never the live endpoint, so the
-- map and the classifier keep working when CECO is down or mid-deploy.
-- ---------------------------------------------------------------------------

create table if not exists public.external_scopes (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  source      text not null,
  payload     jsonb not null,
  fetched_at  timestamptz not null default now(),
  primary key (user_id, source)
);

-- ---------------------------------------------------------------------------
-- Which CECO pages an item is about. The path is CECO's own, e.g.
-- "/trucking/jobboard"; it is the stable id on their side. A page that later
-- disappears from the scope just stops drawing; the row is harmless.
-- ---------------------------------------------------------------------------

create table if not exists public.item_ceco_pages (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  item_id     uuid not null references public.items (id) on delete cascade,
  path        text not null,
  created_at  timestamptz not null default now(),
  primary key (item_id, path)
);

create index if not exists item_ceco_pages_path_idx on public.item_ceco_pages (user_id, path);

do $$
declare
  t text;
begin
  foreach t in array array['external_scopes', 'item_ceco_pages']
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
