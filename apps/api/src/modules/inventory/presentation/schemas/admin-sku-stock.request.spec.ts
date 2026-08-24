/**
 * Strict request validation for the three Admin stock operations (`APP8-B01`).
 *
 * Three properties are asserted here and nowhere else: that a body cannot name
 * a server-owned or repository-owned field, that an adjustment which would
 * change nothing is refused at the boundary rather than in a transaction, and
 * that a reason nobody can read is not a reason (GRD-023).
 *
 * Docker-free: no database, no container, no network.
 */
import { adjustSkuStockBodySchema, adminSkuStockParamSchema } from './admin-sku-stock.request';

const SKU_ID = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6071';

describe('the stock path parameter', () => {
  it('accepts the uuid7 identifiers the schema actually issues', () => {
    expect(adminSkuStockParamSchema.parse({ skuId: SKU_ID })).toEqual({ skuId: SKU_ID });
  });

  it('rejects a non-uuid before any repository call or lock is taken', () => {
    expect(adminSkuStockParamSchema.safeParse({ skuId: 'nope' }).success).toBe(false);
  });
});

describe('the adjustment body', () => {
  it('accepts a signed whole delta with a reason, in both directions', () => {
    expect(adjustSkuStockBodySchema.parse({ delta: 20, reason: 'Kiểm kho tháng 8' })).toEqual({
      delta: 20,
      reason: 'Kiểm kho tháng 8',
    });
    expect(adjustSkuStockBodySchema.parse({ delta: -3, reason: 'Hàng lỗi' })).toEqual({
      delta: -3,
      reason: 'Hàng lỗi',
    });
  });

  /**
   * `ck_inventory_ledger_entries__quantity_positive` (CST-062) would refuse the
   * entry anyway and the repository carries an `ADJUSTMENT_EMPTY` guard; a
   * `400` naming the field is what an operator can act on.
   */
  it('refuses an adjustment that would change nothing', () => {
    expect(adjustSkuStockBodySchema.safeParse({ delta: 0, reason: 'Kiểm kho' }).success).toBe(
      false,
    );
  });

  it('refuses a fractional delta rather than rounding it', () => {
    expect(adjustSkuStockBodySchema.safeParse({ delta: 1.5, reason: 'Kiểm kho' }).success).toBe(
      false,
    );
  });

  it('refuses a delta outside the integer column it has to fit', () => {
    expect(
      adjustSkuStockBodySchema.safeParse({ delta: 2_147_483_648, reason: 'Kiểm kho' }).success,
    ).toBe(false);
  });

  /** GRD-023 / CST-071: the CHECK tests NOT NULL, the blank case is ours. */
  it.each([
    ['absent', {}],
    ['empty', { reason: '' }],
    ['whitespace', { reason: '   ' }],
  ])('refuses an adjustment whose reason is %s', (_label, patch) => {
    expect(adjustSkuStockBodySchema.safeParse({ delta: 5, ...patch }).success).toBe(false);
  });

  it('trims the reason, so what is stored is what can be read back', () => {
    expect(adjustSkuStockBodySchema.parse({ delta: 5, reason: '  Kiểm kho  ' }).reason).toBe(
      'Kiểm kho',
    );
  });

  /**
   * Every one of these is server-owned or repository-owned. A schema that
   * merely ignored them would accept a body claiming to set one.
   */
  it.each([
    'skuId',
    'skuStockId',
    'quantityOnHand',
    'available',
    'heldQuantity',
    'reservedQuantity',
    'lowStockThreshold',
    'entryKind',
    'adminId',
    'actorKind',
    'systemJobKey',
    'orderId',
    'reservationId',
    'softHoldId',
    'occurredAt',
  ])('refuses a body that names the server-owned field %s', (field) => {
    expect(
      adjustSkuStockBodySchema.safeParse({ delta: 5, reason: 'Kiểm kho', [field]: 'x' }).success,
    ).toBe(false);
  });
});
