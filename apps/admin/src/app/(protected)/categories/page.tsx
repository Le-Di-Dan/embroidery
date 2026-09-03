import type { Metadata } from 'next';

import { CATEGORY_COPY, CategoryManagementScreen } from '../../../features/categories';

export const metadata: Metadata = { title: CATEGORY_COPY.page.title };

/**
 * `/categories` — the one Admin category management route (`APP12-A01`).
 *
 * Thin by design: the segment resolves the screen and nothing else. There is no
 * server prefetch here because the inventory read is authenticated Admin data
 * the client owns, and no `searchParams` because selection is panel state
 * rather than an address.
 *
 * Protection comes from the `(protected)` layout, exactly as every other Admin
 * route does; this file adds no guard of its own.
 */
export default function CategoriesPage() {
  return <CategoryManagementScreen />;
}
