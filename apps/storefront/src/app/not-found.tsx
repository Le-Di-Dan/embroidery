import { StorefrontNotFound } from '../features/storefront-not-found';

/**
 * Storefront not-found boundary (APP1-S01B). This is the canonical Next.js App
 * Router `not-found.tsx`: the framework renders it — and returns HTTP 404 — for
 * any unmatched Storefront URL and for any route that calls `notFound()`. Next
 * owns the 404 status; nothing here changes it at runtime (APP1-S01B §6, §12).
 *
 * The route file stays thin. The root layout already wraps every route in the
 * shared `StorefrontShell` (header · `<main id="main-content">` · footer), so this
 * content renders into that existing `<main>` slot and adds no landmark of its
 * own. It remains a Server Component.
 */
export default function NotFound() {
  return <StorefrontNotFound />;
}
