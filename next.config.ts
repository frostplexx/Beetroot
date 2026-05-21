import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ['192.168.0.85'],
  experimental: {
    instrumentationHook: true,
  },
};

export default nextConfig;
