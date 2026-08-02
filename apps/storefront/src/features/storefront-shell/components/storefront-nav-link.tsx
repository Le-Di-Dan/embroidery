'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

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
 * a different area.
 */
export function StorefrontNavLink({ route, label }: { route: string; label: string }) {
  const pathname = usePathname();
  const isActive = pathname === route;

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
