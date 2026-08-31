'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { isStorefrontNavRouteActive } from '../model/storefront-navigation';

/**
 * A primary-navigation item whose route exists.
 *
 * A narrow client island purely so the active area can be marked: `usePathname`
 * is the only way a component learns the current route, and the shell itself
 * must stay a Server Component. Everything else about the header — brand,
 * layout, the unrouted items — is still server-rendered.
 *
 * Active state is matched on the pathname alone, so `/kham-pha?category=khan`
 * still marks Discover as current: a category is a filter within the area, not
 * a different area. It is matched on the **area** rather than the exact path,
 * so a descendant route marks its section current too — `APP11-S03` adds
 * `/bo-suu-tap/[slug]`, and a visitor reading one gallery entry has not left
 * Bộ sưu tập. See `isStorefrontNavRouteActive` for the segment-boundary rule.
 */
export function StorefrontNavLink({ route, label }: { route: string; label: string }) {
  const pathname = usePathname();
  const isActive = isStorefrontNavRouteActive(pathname, route);

  return (
    <Link
      href={route}
      className={`storefront-shell__nav-item storefront-shell__nav-item--link${
        isActive ? ' storefront-shell__nav-item--active' : ''
      }`}
      {...(isActive ? { 'aria-current': 'page' as const } : {})}
    >
      <span className="storefront-shell__nav-label">{label}</span>
    </Link>
  );
}
