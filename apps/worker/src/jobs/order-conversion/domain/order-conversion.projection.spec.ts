/**
 * What an order freezes, argued in isolation (`APP7-W01` §18).
 *
 * The projection is pure, so the two branches, the line cardinality and the
 * exact-copy rule can be pinned without a database in the way. The live SKU
 * resolution and every refusal that needs a row are proved by the integration
 * suites beside these.
 */
import { projectOrderItems, type ConversionSubject } from './order-conversion.projection';
import type {
  AcceptedQuotationVersion,
  FrozenApprovalSnapshot,
} from './repositories/conversion-authority.repository';

const CATALOG_SNAPSHOT: FrozenApprovalSnapshot = {
  id: 'approval-1',
  customRequestId: 'request-1',
  productVariantId: 'variant-1',
  customerOwnedProductId: undefined,
  productName: 'Tee frozen at approval',
  variantLabel: 'Black / M',
  quantityTotal: 3,
};

const COP_SNAPSHOT: FrozenApprovalSnapshot = {
  ...CATALOG_SNAPSHOT,
  productVariantId: undefined,
  customerOwnedProductId: 'cop-1',
  productName: 'Áo khoác của khách',
  variantLabel: undefined,
};

const CATALOG_SUBJECT: ConversionSubject = { branch: 'CATALOG', skuId: 'sku-1' };
const COP_SUBJECT: ConversionSubject = {
  branch: 'CUSTOMER_OWNED',
  customerOwnedProductId: 'cop-1',
  name: 'Áo khoác của khách',
};

function version(lineItems: AcceptedQuotationVersion['lineItems']): AcceptedQuotationVersion {
  return {
    id: 'version-1',
    customRequestId: 'request-1',
    totalAmount: '3333333.00',
    depositAmount: '1166667.00',
    remainingAmount: '2166666.00',
    currencyCode: 'VND',
    acceptedAt: new Date('2026-08-22T00:00:00.000Z'),
    lineItems,
  };
}

const ONE_LINE = [
  { position: 1, quantity: 3, unitPriceAmount: '1111111.00', lineTotalAmount: '3333333.00' },
];

describe('order item projection', () => {
  it('freezes the Catalog branch: resolved SKU, snapshot display copy, no COP', () => {
    const result = projectOrderItems(CATALOG_SNAPSHOT, version(ONE_LINE), CATALOG_SUBJECT);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.items).toEqual([
      {
        position: 1,
        skuId: 'sku-1',
        customerOwnedProductId: undefined,
        // The snapshot's copy, not a live `products.name`.
        productName: 'Tee frozen at approval',
        variantLabel: 'Black / M',
        // No frozen source exists for a size; it is never taken from live
        // Catalog (`ck_order_items__exactly_one_subject` does not ask for one).
        sizeLabel: undefined,
        quantity: 3,
        unitPriceAmount: '1111111.00',
        lineTotalAmount: '3333333.00',
      },
    ]);
  });

  it('freezes the COP branch and fabricates no Catalog identity', () => {
    const result = projectOrderItems(COP_SNAPSHOT, version(ONE_LINE), COP_SUBJECT);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [item] = result.items;
    expect(item?.skuId).toBeUndefined();
    expect(item?.customerOwnedProductId).toBe('cop-1');
    expect(item?.productName).toBe('Áo khoác của khách');
    // Never invented: a customer's own garment has no catalog variant or size.
    expect(item?.variantLabel).toBeUndefined();
    expect(item?.sizeLabel).toBeUndefined();
  });

  it('copies the accepted amounts as strings, byte for byte', () => {
    const result = projectOrderItems(
      CATALOG_SNAPSHOT,
      version([
        { position: 1, quantity: 7, unitPriceAmount: '123457.00', lineTotalAmount: '864199.00' },
      ]),
      CATALOG_SUBJECT,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 123457 × 7 = 864199, and the projection still copies rather than
    // multiplies: the assertion is on identity of the strings.
    expect(result.items[0]?.unitPriceAmount).toBe('123457.00');
    expect(result.items[0]?.lineTotalAmount).toBe('864199.00');
    expect(result.items[0]?.quantity).toBe(7);
  });

  it('derives cardinality from the accepted version and renumbers densely', () => {
    const result = projectOrderItems(
      CATALOG_SNAPSHOT,
      version([
        { position: 5, quantity: 1, unitPriceAmount: '2000.00', lineTotalAmount: '2000.00' },
        { position: 2, quantity: 2, unitPriceAmount: '1000.00', lineTotalAmount: '2000.00' },
      ]),
      CATALOG_SUBJECT,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Two priced lines produce two order lines — not one, and not three.
    expect(result.items).toHaveLength(2);
    // The accepted version's order is preserved; its numbering is not, because
    // `uq_order_items__order_position` indexes a dense 1-based sequence.
    expect(result.items.map((item) => item.position)).toEqual([1, 2]);
    expect(result.items.map((item) => item.unitPriceAmount)).toEqual(['1000.00', '2000.00']);
    // Every line names the one approved subject.
    expect(result.items.every((item) => item.skuId === 'sku-1')).toBe(true);
  });

  it('refuses a version that priced nothing', () => {
    const result = projectOrderItems(CATALOG_SNAPSHOT, version([]), CATALOG_SUBJECT);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.reason).toBe('ACCEPTED_QUOTATION_NOT_PRICED');
    // Deterministic, so retrying cannot help: terminal by the delivered taxonomy.
    expect(result.error.errorClass).toBe('JOB_INVARIANT_VIOLATION');
  });
});
