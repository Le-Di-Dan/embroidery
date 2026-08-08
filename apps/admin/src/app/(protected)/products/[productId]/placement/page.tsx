import { ProductPlacementScreen } from '../../../../../features/product-placement';

interface ProductPlacementPageProps {
  readonly params: Promise<{ readonly productId: string }>;
}

/**
 * `/products/[productId]/placement` — Admin placement authoring (`APP3-A01`).
 *
 * The segment is the B02 product UUID, not the public slug. A thin boundary: it
 * resolves the route param and hands it to the capability, which owns the read,
 * the editable draft, the replace command and every failure state.
 *
 * Like the detail and publication routes, this segment does not prefetch. The
 * placement response carries the optimistic-concurrency token, and a token
 * dehydrated on the server would already be one navigation old before the
 * operator could act on it.
 */
export default async function ProductPlacementPage({ params }: ProductPlacementPageProps) {
  const { productId } = await params;
  return <ProductPlacementScreen productId={productId} />;
}
