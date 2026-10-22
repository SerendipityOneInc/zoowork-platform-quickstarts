import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep `next dev` from appending its own rules to this starter's AGENTS.md.
  agentRules: false,
  // Managed Agents turns and file downloads stream through route handlers;
  // keep them out of any response cache.
  headers: async () => [
    {
      source: "/api/:path*",
      headers: [{ key: "Cache-Control", value: "no-store" }],
    },
  ],
};

export default nextConfig;
