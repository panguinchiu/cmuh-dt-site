import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: ["@prisma/client", "bcryptjs", "@azure/storage-blob"],
  turbopack: { root: __dirname },
};

export default nextConfig;
