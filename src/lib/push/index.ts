import type { SupabaseClient } from "@supabase/supabase-js";
import webpush, { WebPushError } from "web-push";
import type { Database } from "@/lib/db/types";
import { getServerEnv } from "@/lib/env";

type Db = SupabaseClient<Database>;

/** What public/sw.js expects in a push message. */
export type PushPayload = {
  title: string;
  body: string;
  /** Path to open when the notification is tapped. */
  url: string;
  /** Same tag replaces the previous notification instead of stacking. */
  tag?: string;
};

export function isPushConfigured(): boolean {
  const env = getServerEnv();
  return Boolean(env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
}

let configured = false;

function configure(): boolean {
  if (configured) return true;
  const env = getServerEnv();
  if (!env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return false;
  webpush.setVapidDetails(
    `mailto:${env.ALLOWED_EMAIL}`,
    env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    env.VAPID_PRIVATE_KEY,
  );
  configured = true;
  return true;
}

/**
 * Send to every device the user has subscribed. A subscription the push
 * service says is gone (404 or 410) is removed. Returns how many devices
 * accepted the message.
 */
export async function sendPush(db: Db, userId: string, payload: PushPayload): Promise<number> {
  if (!configure()) return 0;

  const { data: subs } = await db
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);
  if (!subs?.length) return 0;

  let delivered = 0;
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload),
          { TTL: 6 * 3600, urgency: "normal" },
        );
        delivered += 1;
        await db
          .from("push_subscriptions")
          .update({ last_success_at: new Date().toISOString() })
          .eq("id", sub.id);
      } catch (e) {
        if (e instanceof WebPushError && (e.statusCode === 404 || e.statusCode === 410)) {
          await db.from("push_subscriptions").delete().eq("id", sub.id);
        }
      }
    }),
  );
  return delivered;
}
