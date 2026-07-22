import { createRequire } from 'node:module';
import path from 'node:path';

import type { NextConfig } from 'next';

// The shared Sass foundation is consumed by its public package name
// (`@use "@embroidery/styles"`). Next 16 + Turbopack's Sass loader cannot
// resolve the package's own internal `@use`/`@forward` graph unless the
// package's Sass source directory is on the Sass load path — a documented
// toolchain integration requirement, not a public Sass import API. See
// docs/implementation/reports/APP0-S01B-C1-CORRECTION-REPORT.md.
//
// The load path is resolved from the installed package name so it never
// hard-codes the monorepo layout or a machine-specific absolute path.
const configRequire = createRequire(path.join(__dirname, 'next.config.ts'));
const stylesLoadPath = path.dirname(configRequire.resolve('@embroidery/styles'));

const nextConfig: NextConfig = {
  // Standalone output keeps production containers small (infrastructure/docker).
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../../'),
  // Workspace packages are consumed as TypeScript source (just-in-time packages).
  transpilePackages: ['@embroidery/api-client', '@embroidery/contracts'],
  sassOptions: {
    loadPaths: [stylesLoadPath],
  },
};

export default nextConfig;
