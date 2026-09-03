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

// The dev server serves its `/_next/*` internals (including the Turbopack HMR
// WebSocket, which carries an `Origin` header) only to allow-listed origins. In
// Docker the browser reaches the app through the gateway host, not `localhost`,
// so that host must be allow-listed or the client never hydrates and interactive
// regions (e.g. the mobile navigation drawer) stay inert — the storefront analog
// of the Admin fix in APP1-A01-C1. Resolved from the gateway hostname (defaults
// to the canonical dev host); ignored by production builds.
const devOrigin = process.env.STOREFRONT_HOST ?? 'embroidery.local';

/**
 * The Storefront Content-Security-Policy (`APP12-H01` §12).
 *
 * Declared by the app rather than by the gateway on purpose: the app is the only
 * party that knows which sources its own bundle needs, and a header set here
 * travels inside the standalone image, so whichever gateway fronts it in
 * production cannot lose the policy by omission.
 *
 * Every source is `'self'` — this deployment loads no third-party script, style,
 * font, frame or beacon, so nothing external is allow-listed and `default-src`
 * closes the rest. `object-src 'none'` and `base-uri 'self'` remove the two
 * classic injection escapes; `form-action 'self'` stops an injected form
 * posting a customer's input off-origin; `frame-ancestors 'self'` restates the
 * gateway's `X-Frame-Options: SAMEORIGIN` in the header that modern browsers
 * actually enforce.
 *
 * Two allowances are real requirements, not convenience:
 *
 * - `'unsafe-inline'` in `script-src` — the App Router streams its RSC payload
 *   as inline `<script>self.__next_f.push(...)</script>` elements. Without a
 *   per-request nonce (which needs a middleware pass over every route) the page
 *   does not hydrate at all. `'unsafe-eval'` is deliberately NOT granted in
 *   production; only the dev server needs it.
 * - `'unsafe-inline'` in `style-src` — React writes element `style` attributes,
 *   and the studio/QR surfaces position by inline style.
 *
 * Development adds what Turbopack HMR needs and nothing else: `'unsafe-eval'`
 * for its module runtime and `ws:`/`wss:` for the HMR socket. Those are absent
 * from a production build, so a production response is the strict policy above.
 */
const isProduction = process.env.NODE_ENV === 'production';

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "form-action 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProduction ? '' : " 'unsafe-eval'"}`,
  `connect-src 'self' blob:${isProduction ? '' : ' ws: wss:'}`,
].join('; ');

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
  transpilePackages: ['@embroidery/api-client', '@embroidery/contracts'],
  allowedDevOrigins: [devOrigin],
  sassOptions: {
    loadPaths: [stylesLoadPath],
  },
  // Applied to every response the app serves, including its 404 and its error
  // boundaries: a policy that skipped the pages an attacker aims injected
  // content at would be no policy at all.
  // Deliberately not `async`: there is nothing to await, and Next only requires
  // that this returns a promise.
  headers() {
    return Promise.resolve([
      {
        source: '/:path*',
        headers: [{ key: 'Content-Security-Policy', value: contentSecurityPolicy }],
      },
    ]);
  },
};

export default nextConfig;
