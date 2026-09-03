/**
 * The Admin projections of one order's deposit and of one payment decision
 * (`APP7-B04` §7, §9, §32).
 *
 * These classes exist for OpenAPI: the generated client's types come from them,
 * so every property here is one an authenticated operator is allowed to see. The
 * runtime views live beside the query and the use cases that build them —
 * keeping both in one file would make it easy to add a property to the response
 * and forget the schema, or the reverse.
 *
 * ### What is absent, and why each one is absent
 *
 * **Storage internals.** No `storageKey`, `bucket`, object URL, presigned link,
 * `checksum`, fingerprint, scanner detail or raw inspection payload. B04 serves
 * no byte at all: `APP7-B06` owns the single Admin binary delivery operation,
 * association-first and `ACCEPTED`-only.
 *
 * **Credentials.** No secure token, `grantId`, `stepUpChallengeId`, customer
 * contact, Admin session or merchant bank value. The operator's own `adminId`
 * appears on a reconciliation row because it is the record of who acted — an
 * identity they did not learn here.
 *
 * **Provider fields.** No `providerKey`, `providerRef` or provider event. This
 * flow has no provider (`APP7-G01` §1, IMP-O007 open), so both columns are null
 * on every row APP7 can write, and publishing them would be a contract promise
 * with nothing behind it — `APP7-B04` §32 says to omit them, and they are
 * omitted.
 *
 * **The remaining payment.** No `remainingAmount` and no REMAINING obligation.
 * APP9 owns its collection, and a response showing it as payable would invite an
 * operator to take money this phase has no flow for.
 *
 * **`APP7-B02`'s order detail.** No line items, no accepted quotation version,
 * no approval snapshot, no order total, no customer id. Repeating them would
 * make this a second authority on what an order looks like.
 *
 * ### Canonical states, never a synthesised `paid`
 *
 * `orderStatus`, `depositStatus` and each attempt's `status` are the accepted
 * LC-14 / LC-15 / LC-16 names. There is no `paid` boolean anywhere:
 * `APP7-G01` §12.2 keeps "the customer transferred", "evidence was submitted"
 * and "an Admin verified funds" three facts with three authorities, and a flag
 * here would be the first place they collapsed.
 *
 * ### Every amount is a `string`, in OpenAPI too
 *
 * `type: String` on an amount is the contract, not a serialisation detail. A
 * `number` would be published as a JSON number, the generated client would type
 * it `number`, and a VND figure an operator compares against a bank statement
 * would have travelled through an IEEE-754 double to reach their screen.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { schema, PAYMENT_RECONCILIATION_ACTIONS } from '@embroidery/database';

import {
  AdminPaymentObligationResponse,
  type AdminPaymentObligationPayload,
} from './admin-payment-obligation.response';

// Re-exported so the controller and its contract suite keep one import site for
// the whole Admin payment surface; the class itself lives beside the subject it
// describes.
export {
  AdminPaymentObligationResponse,
  type AdminPaymentObligationPayload,
} from './admin-payment-obligation.response';

const AMOUNT = {
  type: String,
  example: '1500000.00',
  description: 'Exact `numeric(14,2)` VND, always a string. Never a JSON number.',
} as const;

/** The four LC-06 states an operator is entitled to distinguish on evidence. */
export const ADMIN_EVIDENCE_STATUSES = ['UPLOADED', 'INSPECTING', 'ACCEPTED', 'REJECTED'] as const;

export class AdminPaymentEvidenceResponse {
  @ApiProperty({
    format: 'uuid',
    description:
      'The `payment_transfer_evidence` association id. `APP7-B06` addresses its private ' +
      'delivery by this value; the underlying asset id is never published.',
  })
  evidenceId!: string;

  @ApiProperty({
    enum: ADMIN_EVIDENCE_STATUSES,
    description:
      'The image’s own inspection state. It is never a payment state: an `ACCEPTED` screenshot ' +
      'does not mean money arrived, and a `REJECTED` one does not mean a payment failed.',
  })
  assetStatus!: string;

  @ApiProperty({ example: 'image/png' })
  mediaType!: string;

  @ApiProperty({ example: 245_760, description: 'Server-measured at intake, in bytes.' })
  byteSize!: number;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({
    description:
      'True exactly when `assetStatus` is `ACCEPTED` — a hint for the Admin preview, not a ' +
      'payment fact and not an authorization. `APP7-B06` re-proves the association and the ' +
      'status itself before serving a byte.',
  })
  previewEligible!: boolean;
}

export class AdminPaymentAttemptResponse {
  @ApiProperty({ format: 'uuid' })
  attemptId!: string;

  @ApiProperty({
    enum: schema.PAYMENT_ATTEMPT_METHODS,
    example: 'BANK_TRANSFER',
    description: 'APP7 opens `BANK_TRANSFER` only; the set is LC-16’s full vocabulary.',
  })
  method!: string;

  @ApiProperty({ enum: schema.PAYMENT_ATTEMPT_STATES, example: 'PENDING' })
  status!: string;

  @ApiProperty(AMOUNT)
  amount!: string;

  @ApiProperty({ example: 'VND' })
  currencyCode!: string;

  @ApiPropertyOptional({
    description: 'Mandatory while the attempt is `REQUIRES_REVIEW`; absent otherwise.',
  })
  reviewReason?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  succeededAt?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  failedAt?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  expiresAt?: string;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;

  @ApiProperty({
    type: [AdminPaymentEvidenceResponse],
    description:
      'The customer’s transfer screenshots for this exact attempt, oldest first. An empty ' +
      'array is an ordinary, valid deposit: evidence is optional and never a precondition for ' +
      'verification.',
  })
  evidence!: AdminPaymentEvidenceResponse[];
}

export class AdminPaymentReconciliationResponse {
  @ApiProperty({
    example: '41',
    description: 'The append sequence. Reconciliations are immutable.',
  })
  reconciliationId!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  paymentAttemptId?: string;

  @ApiProperty({ enum: PAYMENT_RECONCILIATION_ACTIONS, example: 'MANUAL_MATCH' })
  action!: string;

  @ApiPropertyOptional({
    example: 'SUCCEEDED',
    description: 'The status the reconciled attempt landed on.',
  })
  resolvedStatus?: string;

  @ApiPropertyOptional({
    ...AMOUNT,
    description:
      'The amount the operator observed, when they recorded one. Absent means no figure was ' +
      'recorded — not that nothing arrived.',
  })
  amount?: string;

  @ApiProperty({ description: 'The operator’s own account of what they checked.' })
  reason!: string;

  @ApiProperty({
    format: 'uuid',
    description: 'The operator, derived from their session. Never accepted from a request.',
  })
  adminId!: string;

  @ApiPropertyOptional({
    example: 'ORD7K3MPQ2XVDDC',
    description: 'The memo observed on the received transfer. Never a merchant account number.',
  })
  bankReference?: string;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}

export class AdminOrderPaymentsResponse {
  @ApiProperty({ format: 'uuid' })
  orderId!: string;

  @ApiProperty({ example: 'ORD-7K3MPQ2XVD' })
  orderCode!: string;

  @ApiProperty({ enum: schema.ORDER_STATES, example: 'AWAITING_DEPOSIT' })
  orderStatus!: string;

  @ApiProperty({
    enum: schema.ORDER_ORIGINS,
    example: 'CUSTOM',
    description:
      'How the order came into being (`COL-TBL043-12`), and therefore which obligation kind ' +
      'this surface collects: `CUSTOM` a `DEPOSIT`, `READY_MADE` a `FULL`. Published so a ' +
      'client branches on the order’s own discriminator rather than on which obligation it ' +
      'happens to find.',
  })
  origin!: string;

  @ApiPropertyOptional({
    type: AdminPaymentObligationResponse,
    description:
      'The obligation currently being collected, or **absent when there is nothing to collect ' +
      'yet**. The one case that produces the absence is a Ready-Made order still at ' +
      '`AWAITING_SHIPPING_FEE`: `BR-029` creates the `FULL` obligation with the first shipping ' +
      'fee, so before that the order is genuinely unpriced. That is a real order awaiting a ' +
      'price, not a missing one, and no provisional obligation, zero amount or placeholder ' +
      'transfer reference is fabricated to stand in for it.',
  })
  currentObligation?: AdminPaymentObligationResponse;

  @ApiProperty({
    type: [AdminPaymentAttemptResponse],
    description:
      'Every attempt on `currentObligation`, oldest first, with a stable `id` tie-breaker. ' +
      'Empty when there is no current obligation, and — because the list is keyed on that ' +
      'obligation’s id — never carrying an attempt made against a superseded predecessor.',
  })
  attempts!: AdminPaymentAttemptResponse[];

  @ApiProperty({
    type: [AdminPaymentReconciliationResponse],
    description:
      'Every manual reconciliation recorded against the current obligation and its attempts, ' +
      'oldest first. Empty when there is no current obligation.',
  })
  reconciliations!: AdminPaymentReconciliationResponse[];
}

export class PaymentDecisionResponse {
  @ApiProperty({ format: 'uuid' })
  attemptId!: string;

  @ApiProperty({ enum: schema.PAYMENT_ATTEMPT_STATES, example: 'SUCCEEDED' })
  attemptStatus!: string;

  @ApiProperty({
    format: 'uuid',
    description:
      'The obligation this decision acted on — the one the named attempt belongs to, resolved ' +
      'by the server. Since `APP9-B03` that is the DEPOSIT obligation for a deposit ' +
      'verification and the REMAINING one for a final-payment verification; the `deposit` ' +
      'prefix is the original `APP7-B04` field name, kept so no delivered client breaks.',
  })
  depositObligationId!: string;

  @ApiProperty({
    enum: schema.PAYMENT_OBLIGATION_STATES,
    example: 'SATISFIED',
    description:
      'The state of that same obligation after the decision committed. `SATISFIED` on a match, ' +
      'unchanged on a review. It describes whichever obligation `depositObligationId` names, ' +
      'not the deposit specifically.',
  })
  depositStatus!: string;

  @ApiProperty({ format: 'uuid' })
  orderId!: string;

  @ApiProperty({
    enum: schema.ORDER_STATES,
    example: 'DEPOSIT_PAID',
    description:
      'The order’s state after the decision committed, read back rather than assumed. A ' +
      'verified deposit reports `DEPOSIT_PAID`, a verified balance `READY_FOR_DELIVERY`, and a ' +
      'verified Ready-Made full payment `READY_FOR_DELIVERY`; a review reports the order ' +
      'unmoved — which for a Ready-Made order can be `AWAITING_PAYMENT`, a state this enum ' +
      'could not carry before `APP12-A02-C1`.',
  })
  orderStatus!: string;

  @ApiProperty({ enum: PAYMENT_RECONCILIATION_ACTIONS, example: 'MANUAL_MATCH' })
  reconciliationAction!: string;

  @ApiProperty({
    description:
      'True when this response reported a verification that had already committed — the retry ' +
      'of a call whose response was lost. Nothing was written a second time.',
  })
  replayed!: boolean;
}

export interface AdminPaymentEvidencePayload {
  readonly evidenceId: string;
  readonly assetStatus: string;
  readonly mediaType: string;
  readonly byteSize: number;
  readonly createdAt: string;
  readonly previewEligible: boolean;
}

export interface AdminPaymentAttemptPayload {
  readonly attemptId: string;
  readonly method: string;
  readonly status: string;
  readonly amount: string;
  readonly currencyCode: string;
  readonly reviewReason?: string | undefined;
  readonly succeededAt?: string | undefined;
  readonly failedAt?: string | undefined;
  readonly expiresAt?: string | undefined;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly evidence: readonly AdminPaymentEvidencePayload[];
}

export interface AdminPaymentReconciliationPayload {
  readonly reconciliationId: string;
  readonly paymentAttemptId?: string | undefined;
  readonly action: string;
  readonly resolvedStatus?: string | undefined;
  readonly amount?: string | undefined;
  readonly reason: string;
  readonly adminId: string;
  readonly bankReference?: string | undefined;
  readonly createdAt: string;
}

export interface AdminOrderPaymentsPayload {
  readonly orderId: string;
  readonly orderCode: string;
  readonly orderStatus: string;
  readonly origin: string;
  readonly currentObligation?: AdminPaymentObligationPayload | undefined;
  readonly attempts: readonly AdminPaymentAttemptPayload[];
  readonly reconciliations: readonly AdminPaymentReconciliationPayload[];
}

export interface PaymentDecisionPayload {
  readonly attemptId: string;
  readonly attemptStatus: string;
  readonly depositObligationId: string;
  readonly depositStatus: string;
  readonly orderId: string;
  readonly orderStatus: string;
  readonly reconciliationAction: string;
  readonly replayed: boolean;
}
