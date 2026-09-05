import { createRequire } from 'node:module';
import path from 'node:path';

import createNextIntlPlugin from 'next-intl/plugin';
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

// The dev server serves its `/_next/*` internals (including the Turbopack HMR
// WebSocket, which carries an `Origin` header) only to allow-listed origins. In
// Docker the browser reaches the app through the gateway host, not `localhost`,
// so that host must be allow-listed or the client never hydrates (APP1-A01-C1).
// Resolved from the gateway hostname (defaults to the canonical dev host);
// ignored by production builds.
const devOrigin = process.env.ADMIN_HOST ?? 'admin.embroidery.local';

/**
 * The Content-Security-Policy is NOT declared here (`APP12-H02` §19).
 *
 * `APP12-H01` published a static policy from this file's `headers()`. A static
 * header cannot carry a nonce, so it had to grant `script-src 'unsafe-inline'`
 * for the App Router's streamed RSC payload to run — which re-permits every
 * injected inline script and leaves the policy stopping nothing. H02 moved the
 * policy to `src/proxy.ts`, the only place a per-response nonce can be minted.
 *
 * It is not declared in *both*: two `Content-Security-Policy` headers on one
 * response are two policies the browser enforces independently, and the weaker
 * one's `'unsafe-inline'` would still be published for a scanner to read. See
 * `src/config/content-security-policy.ts`.
 */

const nextConfig: NextConfig = {
  // `X-Powered-By: Next.js` names the framework, and the family of advisories
  // that comes with it, to anyone who sends one request — and buys nothing back
  // (`APP12-H01` §12). Next emits it by default and this is the only switch that
  // stops it. It is build-time config, so development and production agree.
  poweredByHeader: false,
  // Standalone output keeps production containers small (infrastructure/docker).
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../../'),
  // Workspace packages are consumed as TypeScript source (just-in-time packages).
  transpilePackages: [
    '@embroidery/api-client',
    '@embroidery/contracts',
    '@embroidery/i18n',
    '@embroidery/ui',
  ],
  allowedDevOrigins: [devOrigin],
  sassOptions: {
    loadPaths: [stylesLoadPath],
  },
};

/**
 * The canonical Vietnamese message repository is wired here (`APP12-V02` §5A.9).
 *
 * `next-intl/plugin` takes the path of this application’s request-configuration
 * module and makes it resolvable to the framework’s server and client runtimes.
 * It is the whole of the integration: the module it points at decides nothing on
 * its own and defers to `@embroidery/i18n`, so both applications resolve one
 * locale, one message tree and one set of date formats.
 *
 * No locale route segment is introduced by this. next-intl supports a routed
 * `[locale]` tree and the plugin does not require one; Wave 1 declares
 * `LOCALE_POLICY.routePrefix = false` and the route tree is unchanged.
 */
const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

export default withNextIntl(nextConfig);
