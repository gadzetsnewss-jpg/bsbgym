import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow the preview platform domain to reach the dev server.
  // Next 16 replaced `server.allowedHosts` with `allowedDevOrigins`.
  allowedDevOrigins: [".monkeycode-ai.live", "*.monkeycode-ai.live"],
};

export default nextConfig;
