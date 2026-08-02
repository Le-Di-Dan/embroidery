'use client';

import { DetailError } from '../../../features/product-detail';

/**
 * Route-local error boundary for `/san-pham/[slug]`.
 *
 * Scoped to this segment on purpose: a failed Product read must not take down
 * the shell around it, so the header, navigation and footer stay usable and the
 * visitor can leave for Discover without a browser Back.
 *
 * The thrown error is **not** passed through. Next hands the boundary an `error`
 * object, and rendering any part of it — message, digest, stack — would put
 * internal detail on a public page. Only `reset` is used.
 */
export default function ProductDetailErrorBoundary({ reset }: { error: Error; reset: () => void }) {
  return <DetailError reset={reset} />;
}
