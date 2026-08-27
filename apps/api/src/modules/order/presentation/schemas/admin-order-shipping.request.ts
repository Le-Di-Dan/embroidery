/**
 * Request-side validation for the Admin shipping-detail write (`APP9-B04` §6).
 *
 * `.strict()`: an unknown field is a client bug worth reporting, and silently
 * dropping one is how an operator believes they saved something they did not.
 *
 * ### The body is the whole detail, because the write is a `PUT`
 *
 * Every column the delivered `saveShippingDetails` writes appears here, and the
 * optional ones are optional because the **column** is nullable, never because
 * the field may be omitted to mean "leave it alone". A `PUT` that merged would
 * make "clear the tracking code" unexpressible, and `onConflictDoUpdate` already
 * writes the full value set — so a partial body would silently null the columns
 * it left out. Stating them all is what makes the request and the statement
 * agree.
 *
 * ### `feeAmount` is required, and is a string
 *
 * Required because the fee participates in the money decision on every write:
 * an omitted fee would have to mean either "unchanged" or "null", and the two
 * differ by a recalculation. A **string** because `numeric(14,2)` is a string
 * everywhere above the database — a JSON number would put the amount through an
 * IEEE-754 double before any of this repository's exact arithmetic could see it,
 * which is the one conversion `shipping-fee-amount.ts` exists to prevent.
 *
 * The pattern accepts the same two spellings the column round-trips (`50000` and
 * `50000.00`) and refuses an exponent, a sign, a separator and a third decimal.
 * Whether the value is a *whole đồng* is not checked here: that is the database
 * currency-scale rule, and the use case refuses it with a domain code so the
 * answer does not depend on which layer noticed.
 *
 * ### What the body deliberately cannot carry
 *
 * No `status`, no `frozenAt`, no `countryCode`, no `currencyCode`, no
 * `orderId`, no grant id, no challenge id and no acknowledgement flag. The
 * freeze is `APP9-B05`'s and is reached only through dispatch; the currency is
 * CHECK-pinned to VND; the order is the path parameter; and the acknowledgement
 * evidence is **resolved server-side from the order's own chain**, never
 * asserted by the operator — a client that could name a grant could name someone
 * else's.
 */
import { z } from 'zod';

import { createZodDto, registerZodDtos } from '../../../../platform/validation';

/** `numeric(14,2)` — twelve integer digits, at most two fractional. */
const FEE_AMOUNT_PATTERN = /^\d{1,12}(?:\.\d{1,2})?$/;

export const saveShippingDetailBodySchema = z
  .object({
    recipientName: z.string().trim().min(1).max(200),
    recipientPhone: z.string().trim().min(1).max(32),
    addressLine: z.string().trim().min(1).max(500),
    ward: z.string().trim().min(1).max(200).optional(),
    district: z.string().trim().min(1).max(200).optional(),
    province: z.string().trim().min(1).max(200),
    feeAmount: z.string().regex(FEE_AMOUNT_PATTERN),
    carrierName: z.string().trim().min(1).max(200).optional(),
    trackingCode: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

export class SaveShippingDetailBody extends createZodDto(saveShippingDetailBodySchema) {}

registerZodDtos(SaveShippingDetailBody);
