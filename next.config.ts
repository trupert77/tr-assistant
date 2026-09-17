import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every <Link href> and redirect() is checked against the real route table.
  typedRoutes: true,
  // Parses calendar feeds with its own timezone data files; keep it out of the bundle.
  serverExternalPackages: ["node-ical"],
  experimental: {
    // Holds navigations and Server Actions while the network is down and
    // retries them on reconnect, instead of throwing. Also enables the
    // useOffline hook used by components/offline-banner.tsx.
    useOffline: true,
    serverActions: {
      // Photo captures ride along with the capture form. The capture bar
      // downsizes them to a few hundred KB; this is headroom, and stays
      // under Vercel's 4.5 MB request cap.
      bodySizeLimit: "4mb",
    },
  },
  async headers() {
    return [
      {
        // The push service worker must never be served stale.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
