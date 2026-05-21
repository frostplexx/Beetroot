import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ['192.168.0.85'],
  images: {
    localPatterns: [
      {
        pathname: '/api/album/**',
      }
    ],
    unoptimized: false,
  }
};

export default nextConfig;
