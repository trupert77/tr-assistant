import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every <Link href> and redirect() is checked against the real route table.
  typedRoutes: true,
  experimental: {
    // Holds navigations and Server Actions while the network is down and
    // retries them on reconnect, instead of throwing. Also enables the
    // useOffline hook used by components/offline-banner.tsx.
    useOffline: true,
  },
};

export default nextConfig;
