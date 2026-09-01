/**
 * The customer projection of one deposit (`APP7-B03` §14, §21).
 *
 * These classes exist for OpenAPI: the generated client's types come from them,
 * so every property here is one an anonymous browser holding a valid secure link
 * is allowed to see. The runtime view lives beside the query that builds it —
 * keeping both in one file would make it easy to add a property to the response
 * and forget the schema, or the reverse.
 *
 * ### What is absent, and why each one is absent
 *
 * **Credentials and identity.** No token, digest, `grantId`, `scopeKind`,
 * `stepUpChallengeId`, `customerId` or `customRequestId`. The response echoes
 * back nothing that was presented to obtain it, and names no identifier the
 * caller did not already hold.
 *
 * **Payment internals.** No `paymentObligationId`, no idempotency key, no
 * `providerKey`, no `providerRef`, no reconciliation, no refund, no attempt
 * history and no admin id. No object key, bucket name or storage URL — this
 * surface touches no storage at all.
 *
 * **The remaining payment.** No `remainingAmount`, no REMAINING obligation
 * status and no second set of instructions. APP9 owns it, and `APP7-B03` §5
 * keeps it neither exposed nor payable here.
 *
 * **Evidence.** Nothing. `APP7-B05` owns the transfer-evidence capability, and
 * the prominent "capture your receipt" reminder is `APP7-D01`/`S01` design
 * authority (`APP7-G01` §12.1), not a backend copy string.
 *
 * ### Two states, never one boolean
 *
 * `orderStatus` and `depositStatus` are published as the accepted state names.
 * There is deliberately no `paid` flag: `APP7-G01` §12.2 keeps "the customer
 * transferred", "evidence was submitted" and "an Admin verified funds" three
 * different facts with three different authorities, and a boolean here would be
 * the first place they collapsed.
 *
 * ### Every amount is a `string`, in OpenAPI too
 *
 * `type: String` on the amount is the contract, not a serialisation detail. A
 * `number` here would be published as a JSON number, the generated client would
 * type it `number`, and a VND deposit would round-trip through an IEEE-754
 * double on its way to the customer's screen. The screen performs no arithmetic
 * on it.
 *
 * ### An attempt response never claims payment
 *
 * {@link DepositAttemptResponse} carries `status`, which this flow only ever
 * writes as `PENDING`. There is no `paid`, `verified`, `succeeded`, `settled` or
 * `confirmed` property, and none could be added truthfully: only accepted Admin
 * verification (`APP7-B04`) can settle an attempt, satisfy an obligation or move
 * an order to `DEPOSIT_PAID`.
 */
import { ApiProperty } from '@nestjs/swagger';
import { schema } from '@embroidery/database';

const AMOUNT = {
  type: String,
  example: '1500000.00',
  description: 'Exact `numeric(14,2)` VND, always a string. Never a JSON number.',
} as const;

const TRANSFER_REFERENCE = {
  type: String,
  example: 'ORD7K3MPQ2XVDDC',
  description:
    'The exact message to put on the bank transfer: `ORD`, the order code body, then `DC` ' +
    'for the deposit. Fifteen uppercase alphanumeric characters, derived from the order and ' +
    'the obligation kind and identical on every read and every retry. It carries no name, ' +
    'phone, email, token or attempt id.',
} as const;

export class DepositBankInstructionsResponse {
  @ApiProperty({
    example: '970418',
    description:
      'The receiving bank’s NAPAS acquirer id, exactly as the QR encodes it. A public bank ' +
      'identifier, not a credential.',
  })
  bankBin!: string;

  @ApiProperty({
    example: 'Ngân hàng TMCP Đầu tư và Phát triển Việt Nam',
    description: 'The receiving bank’s name, for the customer to read.',
  })
  bankDisplayName!: string;

  @ApiProperty({
    example: '00000000000',
    description: 'The receiving account number. Server-owned configuration; never customer input.',
  })
  accountNumber!: string;

  @ApiProperty({
    example: 'CONG TY THEU',
    description: 'The account holder, so the customer can check it against their banking app.',
  })
  accountName!: string;

  @ApiProperty(TRANSFER_REFERENCE)
  transferReference!: string;
}

export class CustomerDepositResponse {
  @ApiProperty({
    example: 'ORD-7K3MPQ2XVD',
    description:
      'The customer-facing order code. Display and support only — a code is never an ' +
      'authorization input (CST-026, ADR-DB1-007).',
  })
  orderCode!: string;

  @ApiProperty({
    enum: schema.CUSTOM_ORDER_STATES,
    example: 'AWAITING_DEPOSIT',
    description:
      'The order’s own LC-14 state. `DEPOSIT_PAID` appears only after an Admin has verified ' +
      'that the money arrived; nothing a customer does produces it.',
  })
  orderStatus!: string;

  @ApiProperty({
    enum: schema.PAYMENT_OBLIGATION_STATES,
    example: 'PENDING',
    description:
      'The DEPOSIT obligation’s own state. `SATISFIED` means an Admin confirmed receipt; ' +
      'opening an attempt, downloading the QR and transferring at the bank all leave it ' +
      '`PENDING`.',
  })
  depositStatus!: string;

  @ApiProperty(AMOUNT)
  depositAmount!: string;

  @ApiProperty({
    example: 'VND',
    description: 'The obligation’s own currency, copied. Always VND, enforced physically.',
  })
  currencyCode!: string;

  @ApiProperty({ type: DepositBankInstructionsResponse })
  bankInstructions!: DepositBankInstructionsResponse;

  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'When this secure link stops opening the deposit.',
  })
  accessExpiresAt!: string;
}

export class DepositAttemptResponse {
  @ApiProperty({
    example: '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6072',
    description:
      'The attempt this call opened, or the one an identical earlier call opened. Opaque, ' +
      'and not an address: no operation on this surface takes it.',
  })
  attemptId!: string;

  @ApiProperty({
    enum: schema.PAYMENT_ATTEMPT_METHODS,
    example: 'BANK_TRANSFER',
    description: 'Always BANK_TRANSFER in APP7. There is no payment provider in this flow.',
  })
  method!: string;

  @ApiProperty({
    enum: schema.PAYMENT_ATTEMPT_STATES,
    example: 'PENDING',
    description:
      'Always PENDING. Opening an attempt records an intention to transfer, never a payment: ' +
      'only Admin verification can settle it.',
  })
  status!: string;

  @ApiProperty(AMOUNT)
  amount!: string;

  @ApiProperty({ example: 'VND', description: 'Copied from the obligation.' })
  currencyCode!: string;

  @ApiProperty(TRANSFER_REFERENCE)
  transferReference!: string;

  @ApiProperty({
    example: false,
    description:
      'True when an earlier call with the same Idempotency-Key already opened this attempt ' +
      'and this response replays it. No second attempt was created.',
  })
  replayed!: boolean;
}

/** The serialised shapes the controllers return. */
export interface CustomerDepositHttpView {
  readonly orderCode: string;
  readonly orderStatus: string;
  readonly depositStatus: string;
  readonly depositAmount: string;
  readonly currencyCode: string;
  readonly bankInstructions: {
    readonly bankBin: string;
    readonly bankDisplayName: string;
    readonly accountNumber: string;
    readonly accountName: string;
    readonly transferReference: string;
  };
  readonly accessExpiresAt: string;
}

export interface DepositAttemptHttpView {
  readonly attemptId: string;
  readonly method: string;
  readonly status: string;
  readonly amount: string;
  readonly currencyCode: string;
  readonly transferReference: string;
  readonly replayed: boolean;
}
