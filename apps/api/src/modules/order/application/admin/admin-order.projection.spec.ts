/**
 * The order-line subject discriminator (`APP7-B02` §16, §21.1).
 *
 * Pure: no database, no container, no Nest context. What it proves is that the
 * branch a client sees comes from the row's own ids rather than from an
 * assumption — including the two shapes `ck_order_items__exactly_one_subject`
 * makes unreachable, because a projection that quietly picks a winner for those
 * is a projection that would fabricate a catalog identity the day the constraint
 * were relaxed.
 */
import {
  OrderItemSubjectAmbiguousError,
  ORDER_ITEM_SUBJECT_KINDS,
  projectOrderItemSubject,
} from './admin-order.projection';

const SKU_ID = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6075';
const CUSTOMER_OWNED_PRODUCT_ID = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6076';

describe('APP7-B02 — the order-line subject projection', () => {
  it('publishes exactly the two branches the XOR can express', () => {
    expect([...ORDER_ITEM_SUBJECT_KINDS]).toEqual(['CATALOG', 'CUSTOMER_OWNED']);
  });

  it('reads a catalog line as CATALOG and carries its SKU through untouched', () => {
    expect(
      projectOrderItemSubject({
        position: 1,
        skuId: SKU_ID,
        customerOwnedProductId: undefined,
      }),
    ).toEqual({ kind: 'CATALOG', skuId: SKU_ID, customerOwnedProductId: undefined });
  });

  it('reads a customer-owned line as CUSTOMER_OWNED and fabricates no SKU', () => {
    const subject = projectOrderItemSubject({
      position: 2,
      skuId: undefined,
      customerOwnedProductId: CUSTOMER_OWNED_PRODUCT_ID,
    });

    expect(subject.kind).toBe('CUSTOMER_OWNED');
    expect(subject.customerOwnedProductId).toBe(CUSTOMER_OWNED_PRODUCT_ID);
    // Absent, not an empty string and not the customer-owned id reused: a
    // `skuId` invented here would be a catalog identity the order never froze.
    expect(subject.skuId).toBeUndefined();
  });

  it('refuses a line naming both subjects rather than letting one branch win', () => {
    expect(() =>
      projectOrderItemSubject({
        position: 3,
        skuId: SKU_ID,
        customerOwnedProductId: CUSTOMER_OWNED_PRODUCT_ID,
      }),
    ).toThrow(OrderItemSubjectAmbiguousError);
  });

  it('refuses a line naming neither subject', () => {
    expect(() =>
      projectOrderItemSubject({ position: 4, skuId: undefined, customerOwnedProductId: undefined }),
    ).toThrow(OrderItemSubjectAmbiguousError);
  });

  it('names the line position in the refusal and discloses no identifier', () => {
    let message = '';
    try {
      projectOrderItemSubject({
        position: 7,
        skuId: SKU_ID,
        customerOwnedProductId: CUSTOMER_OWNED_PRODUCT_ID,
      });
    } catch (error: unknown) {
      message = (error as Error).message;
    }

    expect(message).toContain('7');
    expect(message).not.toContain(SKU_ID);
    expect(message).not.toContain(CUSTOMER_OWNED_PRODUCT_ID);
  });
});
