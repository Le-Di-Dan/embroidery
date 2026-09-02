/**
 * The two order mappers, and the line between them (`APP12-B05`).
 *
 * `toOrder` is the **custom** aggregate's and refuses a row with no custom
 * chain; `toOrderLifecycle` is total over the table. Asserting both against the
 * *same* pair of rows is the point: it is what makes the boundary a property of
 * the mappers rather than of whichever one a caller happened to pick, and it is
 * the regression guard for the defect `APP12-B05` repaired — four delivered
 * seams mapping every order through the custom aggregate, so
 * `adminPaymentAttempt_verify`, `adminOrder_dispatch` and `adminOrder_complete`
 * all threw `ORDER_ORIGIN_NOT_CUSTOM` for an order that plainly exists.
 *
 * Docker-free: rows are constructed in memory, no database, no container.
 */
import { isPersistenceError } from '@embroidery/database';

import { toOrder, toOrderLifecycle, type OrderRow } from './order-row.mapper';

const BASE = {
  id: 'order-1',
  code: 'ORD2345678ABC',
  customerId: 'customer-1',
  status: 'AWAITING_PAYMENT',
  totalAmount: '280000.00',
  currencyCode: 'VND',
  deliveredAt: null,
} as const;

const customRow = {
  ...BASE,
  origin: 'CUSTOM',
  customRequestId: 'request-1',
  acceptedQuotationVersionId: 'quotation-version-1',
  currentApprovalSnapshotId: 'snapshot-1',
} as unknown as OrderRow;

/** `APP12-DB01` made all three custom-chain columns nullable for this origin. */
const readyMadeRow = {
  ...BASE,
  origin: 'READY_MADE',
  customRequestId: null,
  acceptedQuotationVersionId: null,
  currentApprovalSnapshotId: null,
} as unknown as OrderRow;

describe('toOrder — the custom aggregate', () => {
  it('maps a custom row with its whole chain', () => {
    expect(toOrder(customRow)).toMatchObject({
      id: 'order-1',
      code: 'ORD2345678ABC',
      customRequestId: 'request-1',
      acceptedQuotationVersionId: 'quotation-version-1',
      currentApprovalSnapshotId: 'snapshot-1',
      status: 'AWAITING_PAYMENT',
    });
  });

  it('refuses a Ready-Made row rather than mapping it with empty strings', () => {
    // The refusal is deliberate and stays: every consumer of this aggregate
    // reads at least one chain field, and widening them to optional would push
    // a `| undefined` into readers that have a real chain to read.
    expect(() => toOrder(readyMadeRow)).toThrow();
    try {
      toOrder(readyMadeRow);
    } catch (error: unknown) {
      expect(isPersistenceError(error)).toBe(true);
      expect((error as { code: string }).code).toBe('ORDER_ORIGIN_NOT_CUSTOM');
    }
  });
});

describe('toOrderLifecycle — the origin-neutral shape', () => {
  it('maps a Ready-Made row, which is the whole reason it exists', () => {
    expect(toOrderLifecycle(readyMadeRow)).toEqual({
      id: 'order-1',
      code: 'ORD2345678ABC',
      customerId: 'customer-1',
      origin: 'READY_MADE',
      status: 'AWAITING_PAYMENT',
      totalAmount: '280000.00',
      currencyCode: 'VND',
      deliveredAt: undefined,
    });
  });

  it('maps a custom row identically, so a shared command has one code path', () => {
    const mapped = toOrderLifecycle(customRow);
    expect(mapped.origin).toBe('CUSTOM');
    expect(mapped.status).toBe('AWAITING_PAYMENT');
    // The two shapes agree on every field they share, so a command that moved
    // from one to the other reports the same facts it always did.
    const custom = toOrder(customRow);
    expect(mapped.id).toBe(custom.id);
    expect(mapped.code).toBe(custom.code);
    expect(mapped.customerId).toBe(custom.customerId);
    expect(mapped.totalAmount).toBe(custom.totalAmount);
    expect(mapped.currencyCode).toBe(custom.currencyCode);
    expect(mapped.deliveredAt).toBe(custom.deliveredAt);
  });

  it('publishes no custom-chain field at all', () => {
    // Not `undefined` — *absent*. A consumer of this shape must not be able to
    // reach for a quotation and find a hole where the refusal used to be.
    const keys = Object.keys(toOrderLifecycle(customRow));
    expect(keys).not.toContain('customRequestId');
    expect(keys).not.toContain('acceptedQuotationVersionId');
    expect(keys).not.toContain('currentApprovalSnapshotId');
  });

  it('carries a delivered instant when the row has one', () => {
    const deliveredAt = new Date('2026-09-02T10:00:00.000Z');
    const row = { ...readyMadeRow, deliveredAt } as unknown as OrderRow;
    expect(toOrderLifecycle(row).deliveredAt).toEqual(deliveredAt);
  });
});
