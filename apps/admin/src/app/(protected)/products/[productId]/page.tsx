import { ProductDetailScreen } from '../../../../features/products';

interface ProductDetailPageProps {
  readonly params: Promise<{ readonly productId: string }>;
}

/**
 * `/products/[productId]` — the Admin product detail/edit screen.
 *
 * The segment is the B02 product UUID, not the public slug. A thin boundary:
 * it resolves the route param and hands it to the capability, which owns the
 * load states, the form and the conflict handling.
 *
 * Unlike the list, this segment does not prefetch. The record carries the
 * optimistic-concurrency token, and a token dehydrated on the server would
 * already be one navigation old by the time the operator pressed save.
 */
export default async function ProductDetailPage({ params }: ProductDetailPageProps) {
  const { productId } = await params;
  return <ProductDetailScreen productId={productId} />;
}
