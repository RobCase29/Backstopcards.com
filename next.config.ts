import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'sleepercdn.com',
        port: '',
        pathname: '/avatars/thumbs/**',
      },
    ],
  },
};

export default nextConfig;
