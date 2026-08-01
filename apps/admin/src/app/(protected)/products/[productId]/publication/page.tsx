import { ProductPublicationScreen } from '../../../../../features/products';

interface ProductPublicationPageProps {
  readonly params: Promise<{ readonly productId: string }>;
}

/**
 * `/products/[productId]/publication` — the Admin publication interaction.
 *
 * The segment is the B02 product UUID, not the public slug. A thin boundary:
 * it resolves the route param and hands it to the capability, which owns the
 * two reads, their coherence, the lifecycle actions and every failure state.
 *
 * Like the detail route, this segment does not prefetch. Both responses carry
 * the optimistic-concurrency token, and a token dehydrated on the server would
 * already be one navigation old before the operator could act on it.
 */
export default async function ProductPublicationPage({ params }: ProductPublicationPageProps) {
  const { productId } = await params;
  return <ProductPublicationScreen productId={productId} />;
}
