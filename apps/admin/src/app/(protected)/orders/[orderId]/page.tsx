import { OrderDetailScreen } from '../../../../features/order-detail';

interface OrderDetailPageProps {
  readonly params: Promise<{ readonly orderId: string }>;
}

/**
 * `/orders/{orderId}` — the Admin order and deposit-payment workspace
 * (`APP7-A01`).
 *
 * A thin boundary: the `(protected)` layout has already resolved the session and
 * rendered the shell, and the capability owns the order read, the payment read,
 * the evidence delivery and both payment decisions.
 *
 * This segment does not prefetch, for the same reason `/orders` does not — and
 * for one more that is specific to it. The payment panel describes a deposit
 * another operator may be reconciling right now, which is a poor fit for a
 * dehydrated cache travelling inside the HTML; the client's own read would
 * supersede it on mount regardless, and a payment state baked into a document is
 * exactly the kind of stale truth `741:87` exists to prevent.
 *
 * The route key is passed down as a plain string and is never treated as an
 * authorization: `APP7-B02`, `APP7-B04` and `APP7-B06` re-check the Admin
 * session on every request, and an order id in a URL grants nothing on its own.
 */
export default async function OrderDetailPage({ params }: OrderDetailPageProps) {
  const { orderId } = await params;

  return <OrderDetailScreen orderId={orderId} />;
}
