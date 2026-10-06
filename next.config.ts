import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  // Add your LAN IP here to open the dev server from a phone.
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
