/**
 * Request-side validation for the three Admin stock operations (`APP8-B01`).
 *
 * ### Both bodies-worth of server-owned facts are unrepresentable
 *
 * The adjustment body is `.strict()`, and that is the security property rather
 * than a style choice. `skuStockId`, `quantityOnHand`, `available`,
 * `heldQuantity`, `reservedQuantity`, `entryKind`, `adminId`, `actorKind`,
 * `systemJobKey`, `orderId`, `reservationId`, `softHoldId`, `occurredAt` and
 * `lowStockThreshold` are all server-owned or repository-owned, and a schema
 * that merely ignored them would accept a body claiming to set one. Sent, any of
 * them is a `400` naming the unrecognised key.
 *
 * ### The delta is an integer, and never zero
 *
 * `quantity_on_hand` is `integer` and `DB4_MONEY_QUANTITY_MEASUREMENT_MODEL.md`
 * carries no fractional stock unit, so a non-integer delta is malformed rather
 * than rounded. Zero is refused here rather than in the use case: the
 * repository's `ADJUSTMENT_EMPTY` guard remains the backstop, but a body asking
 * to change nothing is a client mistake, and `ck_inventory_ledger_entries__
 * quantity_positive` (CST-062) would refuse the entry anyway — a `400` naming
 * the field is the answer an operator can act on.
 *
 * The bound is the column's own: `integer` is 32-bit, and a delta outside it
 * cannot describe any quantity the table can hold.
 *
 * ### The reason is mandatory, and a body of spaces is not one
 *
 * GRD-023 and `ck_inventory_ledger_entries__adjustment_has_reason` (CST-071)
 * make the reason mandatory for an `ADJUSTMENT`; the CHECK tests NOT NULL and
 * the blank case is the application's. Trimmed first, so whitespace cannot pass
 * as an explanation, and bounded at 2000 characters on the APP5/APP7 precedent:
 * the column is `text` with no limit of its own, and an unbounded body is a
 * write amplification an authenticated operator should still not be able to
 * perform by accident.
 */
import { z } from 'zod';

import { createZodDto, registerZodDtos } from '../../../../platform/validation';

/** The UUID path parameter — rejected before any repository call. */
export const adminSkuStockParamSchema = z.object({ skuId: z.string().uuid() }).strict();

export class AdminSkuStockParam extends createZodDto(adminSkuStockParamSchema) {}

/** `integer`'s range. A delta outside it describes no representable quantity. */
const INT32_MAX = 2_147_483_647;

const stockDeltaSchema = z
  .number()
  .int('A stock delta is a whole number of units.')
  .min(-INT32_MAX)
  .max(INT32_MAX)
  .refine((value) => value !== 0, 'A stock adjustment must change the quantity.');

const adjustmentReasonSchema = z.string().trim().min(1).max(2_000);

export const adjustSkuStockBodySchema = z
  .object({
    delta: stockDeltaSchema,
    reason: adjustmentReasonSchema,
  })
  .strict();

export class AdjustSkuStockBody extends createZodDto(adjustSkuStockBodySchema) {}

registerZodDtos(AdminSkuStockParam, AdjustSkuStockBody);
