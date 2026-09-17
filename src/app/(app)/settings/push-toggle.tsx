"use client";

import { useEffect, useState, useTransition } from "react";
import { ui } from "@/components/ui";
import { publicEnv } from "@/lib/env";
import { sendTestPushAction, subscribePushAction, unsubscribePushAction } from "./actions";

type Support = "checking" | "unsupported" | "needs-install" | "denied" | "ready";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = window.atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * Turns push on or off for this device. iOS only allows push from an app
 * installed to the home screen, so Safari in a tab gets install steps
 * instead of a button that cannot work.
 */
export function PushToggle() {
  const [support, setSupport] = useState<Support>("checking");
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
        const standalone = window.matchMedia("(display-mode: standalone)").matches;
        if (!cancelled) setSupport(ios && !standalone ? "needs-install" : "unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        if (!cancelled) setSupport("denied");
        return;
      }
      const registration = await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
        updateViaCache: "none",
      });
      const existing = await registration.pushManager.getSubscription();
      if (cancelled) return;
      setSubscription(existing);
      setSupport("ready");
    })().catch(() => {
      if (!cancelled) setSupport("unsupported");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function enable() {
    startTransition(async () => {
      setMessage(null);
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setSupport(permission === "denied" ? "denied" : "ready");
          return;
        }
        const registration = await navigator.serviceWorker.ready;
        const sub = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicEnv.vapidPublicKey),
        });
        const saved = await subscribePushAction(sub.toJSON(), navigator.userAgent);
        if (!saved.ok) {
          await sub.unsubscribe();
          setMessage({ text: saved.error ?? "Could not save the subscription.", error: true });
          return;
        }
        setSubscription(sub);
        setMessage({ text: "On for this device." });
      } catch (e) {
        setMessage({ text: e instanceof Error ? e.message : "Could not turn on notifications.", error: true });
      }
    });
  }

  function disable() {
    startTransition(async () => {
      setMessage(null);
      if (!subscription) return;
      await unsubscribePushAction(subscription.endpoint);
      await subscription.unsubscribe();
      setSubscription(null);
      setMessage({ text: "Off for this device." });
    });
  }

  function test() {
    startTransition(async () => {
      const sent = await sendTestPushAction();
      setMessage(sent.ok ? { text: "Sent. It should arrive in a few seconds." } : { text: sent.error ?? "Failed.", error: true });
    });
  }

  if (support === "checking") return <p className="text-sm text-faint">Checking this device…</p>;

  if (support === "needs-install") {
    return (
      <p className="text-sm text-muted">
        On iPhone, notifications only work from the installed app. In Safari tap Share, then
        &ldquo;Add to Home Screen&rdquo;, open TR Assistant from the home screen, and come back here.
      </p>
    );
  }
  if (support === "unsupported") {
    return <p className="text-sm text-muted">This browser does not support push notifications.</p>;
  }
  if (support === "denied") {
    return (
      <p className="text-sm text-muted">
        Notifications are blocked for this app. Allow them in the device&apos;s settings, then reload.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {subscription ? (
          <>
            <button type="button" onClick={test} disabled={pending} className={ui.btnPrimary}>
              Send a test
            </button>
            <button type="button" onClick={disable} disabled={pending} className={ui.btnSecondary}>
              Turn off
            </button>
          </>
        ) : (
          <button type="button" onClick={enable} disabled={pending} className={ui.btnPrimary}>
            Turn on notifications
          </button>
        )}
      </div>
      <p
        role="status"
        aria-live="polite"
        className={`min-h-4 text-xs ${message?.error ? "text-danger" : "text-muted"}`}
      >
        {message?.text ?? ""}
      </p>
    </div>
  );
}
