'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { useNavigationGuard } from '../../../shared/navigation/navigation-guard';
import { PRODUCT_PUBLICATION_COPY } from '../model/product-publication-copy';
import { adminProductPublicationRoute } from '../model/product-route';
import type { ProductStatusPresentation } from '../model/product-status';

interface ProductPublicationEntryProps {
  readonly productId: string;
  readonly status: ProductStatusPresentation;
}

/**
 * The entry point from the A03 detail screen into the publication interaction.
 *
 * The departure is routed through the shared navigation guard rather than
 * navigating directly, because this control sits beside a form that may hold
 * unsaved edits. A plain `Link` would leave the route before that form could
 * ask, and the operator's changes would be gone — the publication screen has no
 * form of its own to carry them.
 *
 * The label is the narrowest truthful one for the state. A `DRAFT` is on its
 * way to being published; a `PUBLISHED` product is already there and what is
 * being offered is management of that. `ARCHIVED` renders nothing at all: there
 * is no approved archive surface, and `TR-LC04-04` relist is not this
 * checkpoint's transition, so a control here could only lead somewhere that
 * refuses.
 */
export function ProductPublicationEntry({ productId, status }: ProductPublicationEntryProps) {
  const router = useRouter();
  const requestNavigation = useNavigationGuard();

  if (status !== 'DRAFT' && status !== 'PUBLISHED') {
    return null;
  }

  const href = adminProductPublicationRoute(productId);
  const label =
    status === 'DRAFT'
      ? PRODUCT_PUBLICATION_COPY.entry.fromDraft
      : PRODUCT_PUBLICATION_COPY.entry.fromPublished;

  return (
    <Link
      className="product-publication__entry"
      href={href}
      data-testid="publication-entry"
      onClick={(event) => {
        // Leave every exit the browser owns alone — a new tab or a modified
        // click is not a departure this screen should intercept.
        if (event.defaultPrevented || event.button !== 0) {
          return;
        }
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
          return;
        }
        event.preventDefault();
        requestNavigation(() => router.push(href));
      }}
    >
      {label}
    </Link>
  );
}
