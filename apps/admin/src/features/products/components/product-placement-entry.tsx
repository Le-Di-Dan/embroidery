'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { useNavigationGuard } from '../../../shared/navigation/navigation-guard';
import { PLACEMENT_ENTRY_LABEL } from '../model/product-placement-entry-copy';
import { adminProductPlacementRoute } from '../model/product-route';

interface ProductPlacementEntryProps {
  readonly productId: string;
}

/**
 * The entry point from the product detail screen into placement authoring
 * (`APP3-A01`).
 *
 * The departure is routed through the shared navigation guard rather than
 * navigating directly, because this control sits beside a form that may hold
 * unsaved edits. A plain `Link` would leave the route before that form could
 * ask, and the operator's changes would be gone.
 *
 * Offered for every lifecycle state, unlike the publication entry. Placement is
 * authored against the product's sides and areas, which exist independently of
 * whether the product is publicly visible — and a `PUBLISHED` product whose
 * placement needs a correction is exactly the case that must not be locked out.
 * The screen itself refuses any edit the backend refuses.
 */
export function ProductPlacementEntry({ productId }: ProductPlacementEntryProps) {
  const router = useRouter();
  const requestNavigation = useNavigationGuard();

  const href = adminProductPlacementRoute(productId);

  return (
    <Link
      className="product-placement__entry"
      href={href}
      data-testid="placement-entry"
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
      {PLACEMENT_ENTRY_LABEL}
    </Link>
  );
}
