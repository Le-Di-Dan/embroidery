/**
 * The two Admin order request schemas (`APP7-B02` §5, §12, §21.1).
 *
 * Pure: no database, no container, no Nest context. The queue's filter surface
 * is small on purpose, and these assertions are what keeps it small — a speculative
 * filter added later fails the closed-key test rather than quietly widening the
 * contract.
 */
import {
  ORDER_STATUS_FILTERS,
  adminOrderIdParamSchema,
  listAdminOrdersQuerySchema,
} from './admin-order.request';

describe('APP7-B02 — the Admin order queue query', () => {
  it('accepts an empty query: no cursor, no limit and no status filter', () => {
    expect(listAdminOrdersQuerySchema.parse({})).toEqual({});
  });

  it('normalizes a single repeated status key into an array', () => {
    expect(listAdminOrdersQuerySchema.parse({ status: 'AWAITING_DEPOSIT' })).toEqual({
      status: ['AWAITING_DEPOSIT'],
    });
    expect(
      listAdminOrdersQuerySchema.parse({ status: ['AWAITING_DEPOSIT', 'DEPOSIT_PAID'] }),
    ).toEqual({ status: ['AWAITING_DEPOSIT', 'DEPOSIT_PAID'] });
  });

  it('accepts every LC-14 state, including the ones APP7 offers no action in', () => {
    for (const status of ORDER_STATUS_FILTERS) {
      expect(listAdminOrdersQuerySchema.parse({ status }).status).toEqual([status]);
    }
    expect(ORDER_STATUS_FILTERS).toHaveLength(11);
  });

  it('refuses a status that is not an LC-14 state', () => {
    expect(() => listAdminOrdersQuerySchema.parse({ status: 'PAID' })).toThrow();
    expect(() => listAdminOrdersQuerySchema.parse({ status: [] })).toThrow();
  });

  it('coerces and bounds the page size, and refuses a nonsensical one', () => {
    expect(listAdminOrdersQuerySchema.parse({ limit: '50' }).limit).toBe(50);
    expect(() => listAdminOrdersQuerySchema.parse({ limit: '0' })).toThrow();
    expect(() => listAdminOrdersQuerySchema.parse({ limit: '101' })).toThrow();
    expect(() => listAdminOrdersQuerySchema.parse({ limit: '2.5' })).toThrow();
  });

  it('bounds the cursor so a hostile value cannot force a large parse', () => {
    expect(() => listAdminOrdersQuerySchema.parse({ cursor: '' })).toThrow();
    expect(() => listAdminOrdersQuerySchema.parse({ cursor: 'a'.repeat(513) })).toThrow();
    expect(listAdminOrdersQuerySchema.parse({ cursor: 'abc' }).cursor).toBe('abc');
  });

  it('carries no filter beyond cursor, limit and status', () => {
    // The closed key set, asserted directly. B04 owns payment operational
    // visibility and APP8 owns inventory and production, so none of those may
    // appear here — and neither may a product, SKU or catalog search that would
    // make the queue read live Catalog state.
    expect(Object.keys(listAdminOrdersQuerySchema.shape).sort()).toEqual([
      'cursor',
      'limit',
      'status',
    ]);
  });

  it('refuses an unknown query parameter rather than dropping it silently', () => {
    for (const unknown of [
      { productName: 'Áo' },
      { skuCode: 'SKU-1' },
      { paymentState: 'VERIFIED' },
      { hasEvidence: 'true' },
      { sort: 'total' },
      { offset: '20' },
    ]) {
      expect(() => listAdminOrdersQuerySchema.parse(unknown)).toThrow();
    }
  });
});

describe('APP7-B02 — the Admin order id parameter', () => {
  it('accepts a uuid and refuses anything else', () => {
    const orderId = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6081';
    expect(adminOrderIdParamSchema.parse({ orderId })).toEqual({ orderId });
    expect(() => adminOrderIdParamSchema.parse({ orderId: 'ORD-7K3MPQ2XVD' })).toThrow();
    expect(() => adminOrderIdParamSchema.parse({ orderId: '' })).toThrow();
  });
});
