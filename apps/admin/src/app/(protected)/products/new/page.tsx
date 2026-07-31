import { ProductCreateScreen } from '../../../../features/products';

/**
 * `/products/new` — create a product draft.
 *
 * A thin segment and nothing else: the `(protected)` layout has already
 * resolved the session and rendered the shell, and there is nothing to prefetch
 * because the record does not exist yet. All behaviour lives in the capability.
 */
export default function NewProductPage() {
  return <ProductCreateScreen />;
}
