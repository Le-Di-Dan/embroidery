/**
 * Request-side validation for the three Admin payment operations
 * (`APP7-B04` §11, §19, §32; `APP7-B04-C1`; `APP7-B04-FD1`).
 *
 * ### Expected identifier and observed evidence are different kinds of thing
 *
 * The one rule this file exists to keep straight: a **server-derived** reference
 * is a canonical identifier and carries the `APP7-G01` §4 pattern; an
 * **Admin-observed** bank memo is evidence about the outside world and carries
 * no constraint at all. Constraining the second by the first — which B04 did —
 * makes the mismatch this checkpoint exists to record unrepresentable.
 *
 * It took two passes to get right, and the second is the more useful lesson.
 * `APP7-B04-C1` removed the canonical pattern but replaced it with a
 * 2000-character ceiling borrowed from the note field on this same body;
 * `APP7-B04-FD1` removed that too. A constraint is authorized by the thing being
 * constrained, never by a neighbouring field that happens to be nearby — and
 * "the column has no bound" is a finding to honour, not a gap to fill.
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
 * The reference as it appeared on the received transfer (`APP7-B04-C1`,
 * `APP7-B04-FD1`).
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
 * wrong, and `APP7-B04-C1` corrected it: rejecting a non-canonical memo at the
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
 * ### There is no rule at all, and that is the finding (`APP7-B04-FD1`)
 *
 * `COL-TBL057-08` is nullable `text` with no CHECK, no length and no character
 * set. `APP7-B04-C1` established exactly that — and then applied a
 * 2000-character ceiling borrowed from the operator's written reason on the same
 * body. That was the same defect one step smaller: a bound appropriate to an
 * Admin-authored note is not authority for an observed bank fact, and imposing
 * it made the application assert something no accepted document says — that a
 * real memo longer than 2000 characters cannot exist.
 *
 * So there is no `max`, no `min`, no pattern, no format and no enum. The field
 * is a plain string, and the value is compared and persisted exactly as it
 * arrived. Body-size abuse is the delivered HTTP transport layer's concern, and
 * a Payment-domain field constraint is not a substitute for it.
 *
 * An empty memo is a real observation — a transfer can arrive carrying none — so
 * it is accepted too and recorded as what it is. It simply will not match.
 *
 * The operator's written **reason** keeps its own bound below, and that
 * asymmetry is the point: a human-authored explanation has an accepted length
 * policy, an observed financial fact does not.
 */
const observedReferenceSchema = z.string();

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
