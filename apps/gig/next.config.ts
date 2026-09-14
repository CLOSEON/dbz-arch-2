import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: 'export',
  transpilePackages: ["@dabzzo/shared-auth", "@dabzzo/shared-ui", "@dabzzo/shared-types", "@dabzzo/shared-lib", "@dabzzo/shared-queries"],
  reactStrictMode: true,
  turbopack: {
    root: path.resolve(__dirname, '../../'),
  },
};

export default nextConfig;
