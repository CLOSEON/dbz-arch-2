import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  transpilePackages: ["@dabzzo/shared-auth", "@dabzzo/shared-ui"],
  images: {
    unoptimized: true,
  },
  reactStrictMode: true,
};

export default nextConfig;
