import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  compress: true,
  transpilePackages: ["@dabzzo/shared-auth", "@dabzzo/shared-ui"],
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      }
    ],
  },
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    optimizePackageImports: ['lucide-react', 'date-fns', 'framer-motion'],
  },
  webpack: (config) => {
    config.ignoreWarnings = [
      { module: /node_modules\/@protobufjs\/inquire/ },
      { module: /node_modules\/protobufjs/ }
    ];
    return config;
  },
  turbopack: {}
};

export default nextConfig;
