/**
 * Request-side validation for the three Admin payment operations
 * (`APP7-B04` §11, §19, §32; `APP7-B04-C1`).
 *
 * ### Expected identifier and observed evidence are different kinds of thing
 *
 * The one rule this file exists to keep straight, and the one `APP7-B04-C1`
 * corrects: a **server-derived** reference is a canonical identifier and carries
 * the `APP7-G01` §4 pattern; an **Admin-observed** bank memo is evidence about
 * the outside world and carries no pattern at all. Constraining the second to
 * the shape of the first — which B04 did — makes the mismatch this checkpoint
 * exists to record unrepresentable.
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
 * The reference as it appeared on the received transfer (`APP7-B04-C1`).
 *
 * ### It is evidence, not an identifier
 *
 * `APP7-G01` §4's `^[A-Z0-9]{15}$` describes the reference **this system
 * derives** and instructs the customer to use. It does not describe what a bank
 * memo actually contains. A customer can type it in lowercase, drop a character,
 * add punctuation, let their banking app truncate it, or write something else
 * entirely — and every one of those is precisely the contradiction manual
 * reconciliation exists to record.
 *
 * `APP7-B04` originally validated this field against that canonical pattern, on
 * the reasoning that a typo should be a `400` the operator can see. That was
 * wrong, and `APP7-B04-C1` corrects it: rejecting a non-canonical memo at the
 * DTO boundary stops the financial evidence layer from ever recording the
 * mismatch, so the one fact a later audit needs — *what the bank transaction
 * actually contained*, as against what the customer was instructed to use —
 * is destroyed before it reaches a row.
 *
 * ### Nothing is done to the value
 *
 * No pattern, no `.trim()`, no uppercasing, no punctuation stripping, no
 * whitespace collapsing, no Unicode normalization, no character replacement. The
 * string that arrives is the string compared and the string persisted to
 * `payment_reconciliations.bank_reference`. Any transformation here would make
 * an observation agree with an expectation it did not actually match.
 *
 * ### The only rule is a length ceiling, and it is not a new alphabet
 *
 * `COL-TBL057-08` is nullable `text` with no CHECK, no length and no character
 * set, so there is no pre-B04 bound to preserve. The 2000-character ceiling is
 * the bound this same body already applies to the operator's written reason, and
 * it exists for that rule's reason alone — an authenticated operator should not
 * be able to write an unbounded blob into the money record by accident. It
 * constrains size and nothing else: every printable byte, in any case, in any
 * script, is accepted and reaches the comparison.
 *
 * An empty memo is a real observation — a transfer can arrive carrying none — so
 * it is accepted too and recorded as what it is. It simply will not match.
 */
const observedReferenceSchema = z.string().max(2_000);

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
