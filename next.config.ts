import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ['192.168.0.85'],
  serverExternalPackages: ['ffmpeg-static'],
  images: {
    localPatterns: [
      {
        pathname: '/api/album/**',
      }
    ],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.mzstatic.com',
      },
      {
        protocol: 'https',
        hostname: 'lastfm.freetls.fastly.net',
      },
      {
        protocol: 'https',
        hostname: '**.last.fm',
      },
      {
        protocol: 'https',
        hostname: '**.discogs.com',
      },
      {
        protocol: 'https',
        hostname: 'i.discogs.com',
      },
    ],
    unoptimized: false,
  }
};

export default nextConfig;
