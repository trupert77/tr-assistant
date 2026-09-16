import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every <Link href> and redirect() is checked against the real route table.
  typedRoutes: true,
};

export default nextConfig;
