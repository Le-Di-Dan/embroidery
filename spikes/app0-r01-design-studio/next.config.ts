import type { NextConfig } from 'next';

/**
 * APP0-R01 research spike. Deliberately minimal: no shared SCSS package, no
 * workspace dependency, no standalone output. Nothing here is production
 * configuration and nothing in this app is imported by a shipped application.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
