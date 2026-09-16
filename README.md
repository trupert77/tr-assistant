# TR Assistant

A personal assistant that takes natural-language input from a phone, works out whether it is a task, a follow-up, or a note, files it, and answers questions about what has been stored.

- Product brief: [docs/PROJECT_BRIEF.md](docs/PROJECT_BRIEF.md)
- Architecture and phase plan: [docs/ARCHITECTURE_PLAN.md](docs/ARCHITECTURE_PLAN.md)

## Stack

Next.js 16 (App Router), TypeScript, Tailwind CSS v4, Supabase (Postgres + Auth), Vercel.

## Local development

1. Copy `.env.example` to `.env.local` and fill in the Supabase URL, publishable key, and your email.
2. Run the migration in `supabase/migrations/` against your Supabase project.
3. `npm install`, then `npm run dev`.

Production builds on Windows: use `npx next build --webpack` (the Turbopack build crashes on some Windows machines; Vercel is unaffected).
