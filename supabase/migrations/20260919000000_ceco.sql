-- Phase 10: the CECO app's scope, mirrored read-only.
-- Independent of the Phase 8 and 9 migrations; run in any order after init.

-- ---------------------------------------------------------------------------
-- The last good copy of an outside system's description of itself. For CECO
-- that is GET /api/assistant/scope: areas, pages, recent What's New entries.
-- One row per source. Pages read this copy, never the live endpoint, so the
-- map and the classifier keep working when CECO is down or mid-deploy.
-- ---------------------------------------------------------------------------

create table public.external_scopes (
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

create table public.item_ceco_pages (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  item_id     uuid not null references public.items (id) on delete cascade,
  path        text not null,
  created_at  timestamptz not null default now(),
  primary key (item_id, path)
);

create index item_ceco_pages_path_idx on public.item_ceco_pages (user_id, path);

do $$
declare
  t text;
begin
  foreach t in array array['external_scopes', 'item_ceco_pages']
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
