/**
 * The two new Admin route segments (`APP7-A01`).
 *
 * The smallest route-level check the app already uses (`home-page.test.tsx`):
 * each segment is a thin boundary that hands the route key to its capability
 * and does nothing else. What is worth pinning is exactly that thinness —
 * neither segment prefetches, resolves a session of its own, or renders any
 * order or payment content on the server, because both underlying reads are
 * `no-store` and describe state another operator may be changing right now.
 */
import OrdersPage from '../../src/app/(protected)/orders/page';
import OrderDetailPage from '../../src/app/(protected)/orders/[orderId]/page';

describe('/orders', () => {
  it('renders the queue capability and nothing of its own', () => {
    const element = OrdersPage() as { type: unknown; props: Record<string, unknown> };

    // A function component reference, not markup: the segment composes, the
    // capability owns the query, the filter and the pagination.
    expect(typeof element.type).toBe('function');
    expect((element.type as { name: string }).name).toBe('OrderQueueScreen');
    expect(Object.keys(element.props)).toHaveLength(0);
  });
});

describe('/orders/{orderId}', () => {
  it('awaits the route params and passes the order id down as a plain string', async () => {
    const element = (await OrderDetailPage({
      params: Promise.resolve({ orderId: 'ord-1' }),
    })) as { type: unknown; props: Record<string, unknown> };

    expect((element.type as { name: string }).name).toBe('OrderDetailScreen');
    // The route key is data, never an authorization: B02, B04 and B06 each
    // re-check the Admin session on every request.
    expect(element.props['orderId']).toBe('ord-1');
    expect(Object.keys(element.props)).toEqual(['orderId']);
  });
});
