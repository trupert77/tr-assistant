import { z } from "zod";

/**
 * Public env vars are inlined at build time, so they must be read as literal
 * `process.env.NEXT_PUBLIC_*` expressions. They are safe in the browser.
 */
export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  vapidPublicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "",
};

const serverSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.url(),
  ALLOWED_EMAIL: z.email(),
  APP_TIMEZONE: z.string().min(1).default("America/Detroit"),
  // Both optional. The POST /api/capture endpoint is enabled only when both
  // are set. The service-role key bypasses row-level security and must
  // never be exposed to the browser.
  CAPTURE_API_TOKEN: z.string().min(16).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  // AI classification. Without an API key captures stay in the inbox for
  // manual filing; nothing else breaks. The user picks a provider in
  // Settings; AI_PROVIDER is the fallback when they have not, and when it is
  // unset too, whichever key is present is used (Anthropic first). The model
  // vars override each provider's default in src/lib/ai/index.ts.
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_MODEL: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_MODEL: z.string().min(1).optional(),
  AI_PROVIDER: z.enum(["anthropic", "openai"]).optional(),
  // Semantic search uses OpenAI embeddings, so it needs OPENAI_API_KEY even
  // when Claude does the filing. Without it search stays keyword-only.
  OPENAI_EMBEDDING_MODEL: z.string().min(1).default("text-embedding-3-small"),
  // Web push. All optional; without the key pair the Notifications card in
  // Settings explains what to add. Generate with `npx web-push generate-vapid-keys`.
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().min(1).optional(),
  VAPID_PRIVATE_KEY: z.string().min(1).optional(),
  // Vercel Cron sends this as a bearer token to /api/cron/tick.
  CRON_SECRET: z.string().min(16).optional(),
  /** Local hour (0-23) after which the morning digest goes out. */
  DIGEST_HOUR: z.coerce.number().int().min(0).max(23).default(7),
  // Read-only calendar: the secret iCal address from Google Calendar or a
  // published Outlook calendar. It is a credential; never NEXT_PUBLIC_.
  CALENDAR_ICS_URL: z.url().optional(),
  // The CECO portal's read-only scope endpoint. The token must match CECO's
  // ASSISTANT_API_TOKEN. It can only read a description of the portal (areas,
  // pages, What's New); it is not a database key.
  CECO_API_URL: z.url().optional(),
  CECO_API_TOKEN: z.string().min(32).optional(),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | undefined;

/**
 * Server-only. Validated lazily so importing this module never fails at
 * build time; a missing variable fails on first use with a clear message.
 */
export function getServerEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues
      .map((issue) => issue.path.join("."))
      .join(", ");
    throw new Error(`Invalid or missing environment variables: ${missing}`);
  }
  cached = parsed.data;
  return cached;
}
