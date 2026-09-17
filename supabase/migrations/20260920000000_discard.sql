-- Phase 11: deleting a capture from the inbox.
--
-- Captures are still never deleted; a deleted one is parked in a new
-- 'discarded' status, so it leaves the inbox and every list that names the
-- statuses it wants, and Undo can put it back. Any item the capture had
-- already produced is archived — the same one-way-but-reversible move
-- Archive makes elsewhere.
--
-- Independent of the other migrations; run in any order after init, and
-- safe to run again.

-- Drop whatever check currently guards the status, by name or by what it
-- says, so a re-run (or a constraint the init named differently) can't leave
-- an older, narrower copy behind to reject 'discarded'.
do $$
declare
  c text;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.inbox_items'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%needs_review%'
  loop
    execute format('alter table public.inbox_items drop constraint %I', c);
  end loop;
end;
$$;

alter table public.inbox_items
  add constraint inbox_items_status_check
  check (status in ('pending', 'processing', 'processed', 'needs_review', 'failed', 'discarded'));
