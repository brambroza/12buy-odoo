import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // A stray ~/yarn.lock makes Next infer the home folder as the workspace root.
  turbopack: { root: __dirname },
  // Slip uploads go through a server action; default limit is 1 MB. Server side still caps files at 5 MB.
  experimental: { serverActions: { bodySizeLimit: '6mb' } },
};

export default nextConfig;
