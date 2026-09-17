import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { ArrowRightIcon, MapIcon } from "@/components/icons";
import { ItemRow } from "@/components/item-row";
import { ui } from "@/components/ui";
import { isCecoConfigured, loadCecoScope, type CecoPage, type CecoUpdate } from "@/lib/ceco";
import { createSupabaseServerClient } from "@/lib/db/server";
import { getServerEnv } from "@/lib/env";
import { formatRelative } from "@/lib/format";
import { loadPeopleFor, loadProjectNames } from "@/lib/items/queries";
import { CecoSyncButton } from "./sync-button";

/**
 * The CECO portal from the outside: every area and page it has, what shipped
 * to each lately, and which of Travis's own items are about it. The data is
 * the copy synced from CECO's read-only scope endpoint; nothing here reads or
 * changes CECO itself.
 */
export default async function CecoPage({ searchParams }: PageProps<"/ceco">) {
  const { page } = await searchParams;
  const selectedPath = (Array.isArray(page) ? page[0] : page) || null;

  const db = await createSupabaseServerClient();
  const stored = await loadCecoScope(db);
  const timeZone = getServerEnv().APP_TIMEZONE;

  if (!stored) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className={ui.pageTitle}>CECO</h1>
        <EmptyState title={isCecoConfigured() ? "Not synced yet" : "Not connected"}>
          {isCecoConfigured()
            ? "The connection is set up. Pull the first copy of CECO's pages and areas."
            : "Set CECO_API_URL and CECO_API_TOKEN here, and ASSISTANT_API_TOKEN in CECO, then sync. The guide has the steps."}
        </EmptyState>
        {isCecoConfigured() && <CecoSyncButton label="Sync from CECO" />}
      </div>
    );
  }

  const { scope, fetchedAt } = stored;
  const { data: links } = await db.from("item_ceco_pages").select("item_id, path");
  const linkedIds = [...new Set((links ?? []).map((l) => l.item_id))];
  const { data: items } = linkedIds.length
    ? await db.from("items").select().in("id", linkedIds).in("status", ["open", "waiting"])
    : { data: [] };
  const openById = new Map((items ?? []).map((i) => [i.id, i]));
  const openByPath = new Map<string, string[]>();
  for (const link of links ?? []) {
    if (!openById.has(link.item_id)) continue;
    openByPath.set(link.path, [...(openByPath.get(link.path) ?? []), link.item_id]);
  }

  const lastShipped = new Map<string, string>();
  for (const update of scope.updates) {
    for (const path of update.pages) if (!lastShipped.has(path)) lastShipped.set(path, update.date);
  }

  const selected = selectedPath ? scope.pages.find((p) => p.path === selectedPath) ?? null : null;

  if (selected) {
    const mine = (openByPath.get(selected.path) ?? []).map((id) => openById.get(id)!);
    const [people, projects] = await Promise.all([
      loadPeopleFor(db, mine.map((i) => i.id)),
      loadProjectNames(db),
    ]);
    return (
      <PageDetail
        page={selected}
        areaLabel={scope.areas.find((a) => a.key === selected.area)?.label ?? selected.area}
        portalUrl={scope.app.url}
        updates={scope.updates.filter((u) => u.pages.includes(selected.path))}
        timeZone={timeZone}
        items={mine.map((item) => ({
          item,
          people: people.get(item.id),
          projectName: item.project_id ? projects.get(item.project_id) : undefined,
        }))}
      />
    );
  }

  const totalOpen = [...openByPath.values()].reduce((n, ids) => n + ids.length, 0);

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <h1 className={ui.pageTitle}>CECO</h1>
          <span className="text-xs text-faint">
            {scope.app.version}
            {scope.app.commit ? ` · ${scope.app.commit}` : ""}
          </span>
        </div>
        <p className="text-sm text-muted">
          {scope.pages.length} pages in {scope.areas.length} areas, {scope.updates.length} updates in the last 90 days.
          {totalOpen > 0 ? ` ${totalOpen} of your open items are about it.` : ""} Synced{" "}
          {formatRelative(fetchedAt, timeZone)}.
        </p>
        <div className="flex flex-wrap items-start gap-2">
          <CecoSyncButton />
          <Link href={{ pathname: "/map", query: { ceco: "all" } }} className={ui.btnSecondary}>
            <MapIcon size={16} />
            Whole app on the map
          </Link>
        </div>
      </div>

      {scope.updates.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className={ui.sectionTitle}>Recently shipped</h2>
          <ul className={`${ui.card} divide-y divide-line`}>
            {scope.updates.slice(0, 5).map((update) => (
              <li key={update.publishedAt} className="flex flex-col gap-0.5 px-5 py-3">
                <span className="text-sm leading-6">{update.title}</span>
                <span className="text-xs text-muted">{update.date}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {scope.areas.map((area) => {
        const pages = scope.pages.filter((p) => p.area === area.key);
        if (!pages.length) return null;
        return (
          <section key={area.key} id={`area-${area.key}`} className="flex scroll-mt-24 flex-col gap-3">
            <div className="flex flex-col gap-0.5">
              <h2 className={ui.sectionTitle}>
                {area.label}
                <span className="ml-2 text-faint">{pages.length}</span>
              </h2>
              <p className="text-xs text-muted">{area.blurb}</p>
            </div>
            <ul className={`${ui.card} divide-y divide-line`}>
              {pages.map((p) => {
                const open = openByPath.get(p.path)?.length ?? 0;
                return (
                  <li key={p.path}>
                    <Link
                      href={{ pathname: "/ceco", query: { page: p.path } }}
                      className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-2"
                    >
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-[15px] leading-6">{p.title}</span>
                        <span className="truncate text-xs text-faint">{p.path}</span>
                      </span>
                      {open > 0 && (
                        <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent">
                          {open} open
                        </span>
                      )}
                      {lastShipped.has(p.path) && (
                        <span className="hidden shrink-0 text-xs text-muted sm:inline">
                          shipped {lastShipped.get(p.path)}
                        </span>
                      )}
                      <ArrowRightIcon size={16} className="shrink-0 text-faint" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function PageDetail({
  page,
  areaLabel,
  portalUrl,
  updates,
  items,
  timeZone,
}: {
  page: CecoPage;
  areaLabel: string;
  portalUrl: string;
  updates: CecoUpdate[];
  items: { item: Parameters<typeof ItemRow>[0]["item"]; people: Parameters<typeof ItemRow>[0]["people"]; projectName?: string }[];
  timeZone: string;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href="/ceco" className="text-xs font-semibold text-muted hover:text-foreground">
          ← CECO
        </Link>
        <p className={ui.eyebrow}>{areaLabel}</p>
        <h1 className={ui.pageTitle}>{page.title}</h1>
        {page.description && <p className="text-sm text-muted">{page.description}</p>}
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-faint">
          <span>{page.path}</span>
          {page.permission && <span>needs {page.permission}</span>}
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <a href={`${portalUrl}${page.path}`} target="_blank" rel="noreferrer" className={ui.btnSecondary}>
            Open in CECO
            <ArrowRightIcon size={16} />
          </a>
          <Link href={{ pathname: "/map", query: { focus: `ceco:page:${page.path}` } }} className={ui.btnGhost}>
            <MapIcon size={16} />
            On the map
          </Link>
        </div>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className={ui.sectionTitle}>
          Your open items about it
          <span className="ml-2 text-faint">{items.length}</span>
        </h2>
        {items.length === 0 ? (
          <p className="text-sm text-muted">
            Nothing open. Capture something like &ldquo;{page.title}: &hellip;&rdquo; and it lands here.
          </p>
        ) : (
          <ul className={`${ui.card} divide-y divide-line`}>
            {items.map(({ item, people, projectName }) => (
              <ItemRow key={item.id} item={item} timeZone={timeZone} people={people} projectName={projectName} />
            ))}
          </ul>
        )}
      </section>

      {updates.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className={ui.sectionTitle}>
            Shipped here
            <span className="ml-2 text-faint">{updates.length}</span>
          </h2>
          <ul className="flex flex-col gap-3">
            {updates.map((update) => (
              <li key={update.publishedAt} className={`${ui.cardPad} flex flex-col gap-2`}>
                <span className="text-xs text-muted">{update.date}</span>
                <span className="text-sm font-bold leading-6">{update.title}</span>
                <ul className="flex flex-col gap-1.5 text-sm leading-6 text-muted">
                  {update.items.map((text, n) => (
                    <li key={n}>{text}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
