/**
 * Request-side validation for the three Admin payment operations
 * (`APP7-B04` §11, §19, §32).
 *
 * Both bodies are `.strict()`, and that is the security property rather than a
 * style choice. Every field `APP7-B04` §11 forbids — `orderId`, `obligationId`,
 * `customerId`, `grantId`, `stepUpChallengeId`, `adminId`, `status`, `toStatus`,
 * `resolvedStatus`, `succeededAt`, `verifiedAt`, `providerKey`, `providerRef`,
 * `providerEventId`, `evidenceId`, `assetId`, `evidencePresent`,
 * `expectedAmount`, `expectedCurrency`, `expectedReference` — is server-owned,
 * and a schema that merely ignored them would accept a body claiming to set one.
 * Sent, any of them is a `400` naming the unrecognised key.
 *
 * ### There is no observed currency field
 *
 * `ck_payment_obligations__currency_vnd` closes the column to `VND`, so an
 * observed currency would be a field whose only legal value the server already
 * holds — and one an operator could get wrong on a form for no benefit. It is
 * derived from the obligation row and checked there
 * (`payment-verification.policy.ts`).
 *
 * ### The amount is a string, and stays one
 *
 * `numeric(14,2)` reaches this process as a decimal string, and the observed
 * figure is compared to it as a string scanned into `bigint` hundredths. A `z.number()`
 * here would put the whole path through an IEEE-754 double, which is the one
 * thing `APP7-B04` §24 forbids. The pattern accepts `765000` and `765000.00`
 * alike, because both are the same money and an operator typing whole đồng must
 * not be told their correct figure is malformed.
 */
import { z } from 'zod';

import { createZodDto, registerZodDtos } from '../../../../platform/validation';
import { DEPOSIT_REFERENCE_PATTERN } from '../../domain/deposit/deposit-reference';

/** UUID path parameters — rejected before any repository call. */
export const adminOrderPaymentsParamSchema = z.object({ orderId: z.string().uuid() }).strict();

export class AdminOrderPaymentsParam extends createZodDto(adminOrderPaymentsParamSchema) {}

export const adminPaymentAttemptParamSchema = z.object({ attemptId: z.string().uuid() }).strict();

export class AdminPaymentAttemptParam extends createZodDto(adminPaymentAttemptParamSchema) {}

/**
 * A non-negative decimal amount, at most `numeric(14,2)`.
 *
 * No sign, no exponent, no separator, no whitespace. The comparison downstream
 * is exact, so a loosely-parsed input would only be able to fail it in a way
 * nobody could explain.
 */
const observedAmountSchema = z
  .string()
  .regex(/^\d{1,12}(?:\.\d{1,2})?$/, 'An amount is up to twelve digits with at most two decimals.');

/**
 * The reference as it appeared on the transfer.
 *
 * Shape-checked against the exact `APP7-G01` §4 pattern the server derives, so a
 * typo is a `400` the operator can see rather than a silent trip into review.
 * Equality against the order's own derived reference is still proved
 * server-side: this only rejects values that could not be **any** order's
 * reference, and it is not, and must not become, the match.
 */
const observedReferenceSchema = z
  .string()
  .trim()
  .regex(DEPOSIT_REFERENCE_PATTERN, 'A deposit reference is ORD, ten code characters, then DC.');

/**
 * One written justification.
 *
 * Trimmed, then required to be non-empty, so a body of spaces is a missing
 * reason rather than a reason nobody can read. Bounded at 2000 characters on the
 * APP5 moderation precedent: the columns are `text` and impose no limit of their
 * own, and an unbounded body is a write amplification an authenticated operator
 * should still not be able to perform by accident.
 */
const reconciliationTextSchema = z.string().trim().min(1).max(2_000);

export const verifyPaymentAttemptBodySchema = z
  .object({
    observedAmount: observedAmountSchema,
    observedTransferReference: observedReferenceSchema,
    note: reconciliationTextSchema,
  })
  .strict();

export class VerifyPaymentAttemptBody extends createZodDto(verifyPaymentAttemptBodySchema) {}

export const reviewPaymentAttemptBodySchema = z
  .object({
    reviewReason: reconciliationTextSchema,
    observedAmount: observedAmountSchema.optional(),
    observedTransferReference: observedReferenceSchema.optional(),
  })
  .strict();

export class ReviewPaymentAttemptBody extends createZodDto(reviewPaymentAttemptBodySchema) {}

registerZodDtos(
  AdminOrderPaymentsParam,
  AdminPaymentAttemptParam,
  VerifyPaymentAttemptBody,
  ReviewPaymentAttemptBody,
);
