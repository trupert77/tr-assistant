/** Shared class presets so every screen uses the same shapes and weights. */

export const ui = {
  card: "rounded-3xl border border-line bg-surface shadow-card",
  cardPad: "rounded-3xl border border-line bg-surface p-5 shadow-card",

  /** A row inside a `card` list (pair with divide-y divide-line on the list). */
  row: "flex items-start gap-3 px-5 py-3.5",

  pageTitle: "text-2xl font-bold tracking-tight",
  /** Small-caps label with a `//` comment marker in the accent color. */
  sectionTitle:
    "text-[11px] font-semibold uppercase tracking-[0.18em] text-muted before:mr-1.5 before:text-accent before:content-['//']",
  eyebrow: "text-[11px] font-semibold uppercase tracking-[0.18em] text-accent",

  input:
    "w-full rounded-full border border-line bg-surface-2/60 px-5 py-3.5 text-[15px] text-foreground placeholder:text-faint transition-[border-color,box-shadow] focus:border-accent focus:shadow-glow focus:outline-none",

  btnPrimary:
    "inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-linear-to-r from-accent to-accent-2 px-6 text-sm font-bold text-accent-foreground shadow-glow transition-[opacity,transform,box-shadow] hover:opacity-95 active:scale-[0.98] disabled:opacity-50 disabled:shadow-none",
  btnSecondary:
    "inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-line bg-surface px-6 text-sm font-semibold text-foreground transition-colors hover:border-line-strong hover:bg-surface-2 active:bg-surface-2 disabled:opacity-50",
  btnGhost:
    "inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold text-muted transition-colors hover:bg-surface-2 hover:text-foreground",

  chip: "inline-flex min-h-9 items-center gap-1.5 rounded-full px-3.5 text-xs font-semibold transition-opacity hover:opacity-80 active:opacity-70",
} as const;

export const kindStyles = {
  task: { label: "Task", chip: "bg-task-soft text-task", dot: "bg-task" },
  followup: { label: "Follow-up", chip: "bg-followup-soft text-followup", dot: "bg-followup" },
  note: { label: "Note", chip: "bg-note-soft text-note", dot: "bg-note" },
} as const;
