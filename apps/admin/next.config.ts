import path from 'node:path';

import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Standalone output keeps production containers small (infrastructure/docker).
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../../'),
  // Workspace packages are consumed as TypeScript source (just-in-time packages).
  transpilePackages: ['@embroidery/api-client', '@embroidery/contracts'],
};

export default nextConfig;
