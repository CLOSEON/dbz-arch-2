import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: 'export',
  compress: true,
  transpilePackages: ["@dabzzo/shared-auth", "@dabzzo/shared-ui"],
  images: {
    unoptimized: true,
  },
  reactStrictMode: true,
  experimental: {
    optimizePackageImports: ['lucide-react', 'date-fns', 'framer-motion'],
  },
  turbopack: {
    root: path.resolve(__dirname, '../../'),
  },
};

export default nextConfig;
