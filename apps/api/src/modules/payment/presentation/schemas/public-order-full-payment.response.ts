/**
 * The three `APP12-B04` full-payment response components.
 *
 * Siblings of `APP7-B03`'s and `APP9-B02`'s, not reuses. Each of those names its
 * fields for its own obligation and its accepted contract asserts the other
 * kind's word appears nowhere in it, so re-pointing either at `FULL` would have
 * meant lying in the names or reopening an accepted contract — and a Ready-Made
 * order has neither a deposit nor a balance to speak of (`APP12-D01` §I).
 *
 * Everything a customer needs is here and nothing else is: no internal id, no
 * order UUID, no obligation id, no reconciliation, no verification, no refund,
 * no provider, no shipping and no carrier field.
 */
import { ApiProperty } from '@nestjs/swagger';
import { schema } from '@embroidery/database';

const AMOUNT = {
  type: String,
  example: '280000.00',
  description: 'Exact `numeric(14,2)` VND, always a string. Never a JSON number.',
} as const;

const TRANSFER_REFERENCE = {
  type: String,
  example: 'ORD7K3MPQ2XVDFL',
  description:
    'The exact message to put on the bank transfer: `ORD`, the order code body, then `FL` ' +
    'for a Ready-Made order payment. Fifteen uppercase alphanumeric characters, derived from ' +
    'the order and the obligation kind, and identical on every read, every retry and across ' +
    'a shipping-fee correction — the memo names the order, not the obligation, so a transfer ' +
    'sent before a correction still reconciles. The `FL` suffix distinguishes it from the ' +
    'custom `DC` and `RM` memos. It carries no name, phone, email, token or attempt id.',
} as const;

export class FullPaymentBankInstructionsResponse {
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

export class CustomerFullPaymentResponse {
  @ApiProperty({
    example: 'ORD-7K3MPQ2XVD',
    description:
      'The customer-facing order code. Display and support only — a code is never an ' +
      'authorization input (CST-026, ADR-DB1-007).',
  })
  orderCode!: string;

  @ApiProperty({
    enum: schema.READY_MADE_ORDER_STATES,
    example: 'AWAITING_PAYMENT',
    description:
      'The order’s own state. `AWAITING_PAYMENT` is the one state in which this payment may ' +
      'be made, and an operator reaches it by setting the shipping fee, which is also what ' +
      'creates the obligation. `READY_FOR_DELIVERY` appears only after an Admin has verified ' +
      'that the money arrived; nothing a customer does produces it. `CANCELLED` is where a ' +
      'lapsed stock reservation puts the order.',
  })
  orderStatus!: string;

  @ApiProperty({
    enum: schema.PAYMENT_OBLIGATION_STATES,
    example: 'PENDING',
    description:
      'The payment obligation’s own state. `SATISFIED` means an Admin confirmed receipt; ' +
      'opening an attempt, downloading the QR and transferring at the bank all leave it ' +
      '`PENDING`. A Ready-Made order has exactly one obligation and no deposit (BR-029).',
  })
  fullPaymentStatus!: string;

  @ApiProperty(AMOUNT)
  fullPaymentAmount!: string;

  @ApiProperty({
    example: 'VND',
    description: 'The obligation’s own currency, copied. Always VND, enforced physically.',
  })
  currencyCode!: string;

  @ApiProperty({
    example: true,
    description:
      'Whether the two states above currently permit payment: the order is AWAITING_PAYMENT ' +
      'and the obligation is still PENDING. Derived on every read and stored nowhere. It is ' +
      'not a claim that anything has been paid — that is `fullPaymentStatus` — but the single ' +
      'answer to "may the QR and a new attempt be requested right now", which the other two ' +
      'operations refuse when it is false.',
  })
  payable!: boolean;

  @ApiProperty({ type: FullPaymentBankInstructionsResponse })
  bankInstructions!: FullPaymentBankInstructionsResponse;

  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'When this secure link stops opening the order.',
  })
  accessExpiresAt!: string;
}

export class FullPaymentAttemptResponse {
  @ApiProperty({
    example: '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6072',
    description:
      'The attempt this call opened, or the one an identical earlier call opened. Opaque, ' +
      'and the one identifier this surface publishes — the delivered attempt-scoped evidence ' +
      'upload takes it, and nothing else does.',
  })
  attemptId!: string;

  @ApiProperty({
    enum: schema.PAYMENT_ATTEMPT_METHODS,
    example: 'BANK_TRANSFER',
    description: 'Always BANK_TRANSFER. There is no payment provider in this flow.',
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

/** What the controller returns; the envelope wraps it. */
export interface CustomerFullPaymentHttpView {
  readonly orderCode: string;
  readonly orderStatus: string;
  readonly fullPaymentStatus: string;
  readonly fullPaymentAmount: string;
  readonly currencyCode: string;
  readonly payable: boolean;
  readonly bankInstructions: {
    readonly bankBin: string;
    readonly bankDisplayName: string;
    readonly accountNumber: string;
    readonly accountName: string;
    readonly transferReference: string;
  };
  readonly accessExpiresAt: string;
}

export interface FullPaymentAttemptHttpView {
  readonly attemptId: string;
  readonly method: string;
  readonly status: string;
  readonly amount: string;
  readonly currencyCode: string;
  readonly transferReference: string;
  readonly replayed: boolean;
}
