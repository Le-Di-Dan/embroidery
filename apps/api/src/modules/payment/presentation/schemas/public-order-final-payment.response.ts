/**
 * The three `APP9-B02` response components.
 *
 * Siblings of `APP7-B03`'s, not reuses. `CustomerDepositResponse` names its
 * fields `deposit*` and its accepted contract asserts the word `remaining`
 * appears nowhere in it, so re-pointing it at the other obligation would have
 * meant lying in the names or reopening that contract. Everything a customer
 * needs is here and nothing else is: no internal id, no reconciliation, no
 * verification, no refund, no provider, no shipping and no carrier field.
 */
import { ApiProperty } from '@nestjs/swagger';
import { schema } from '@embroidery/database';

const AMOUNT = {
  type: String,
  example: '1785000.00',
  description: 'Exact `numeric(14,2)` VND, always a string. Never a JSON number.',
} as const;

const TRANSFER_REFERENCE = {
  type: String,
  example: 'ORD7K3MPQ2XVDRM',
  description:
    'The exact message to put on the bank transfer: `ORD`, the order code body, then `RM` ' +
    'for the final payment. Fifteen uppercase alphanumeric characters, derived from the ' +
    'order and the obligation kind and identical on every read and every retry. The `RM` ' +
    'suffix is what distinguishes it from the deposit memo on the same order. It carries no ' +
    'name, phone, email, token or attempt id.',
} as const;

export class FinalPaymentBankInstructionsResponse {
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

export class CustomerFinalPaymentResponse {
  @ApiProperty({
    example: 'ORD-7K3MPQ2XVD',
    description:
      'The customer-facing order code. Display and support only — a code is never an ' +
      'authorization input (CST-026, ADR-DB1-007).',
  })
  orderCode!: string;

  @ApiProperty({
    enum: schema.ORDER_STATES,
    example: 'AWAITING_FINAL_PAYMENT',
    description:
      'The order’s own LC-14 state. `AWAITING_FINAL_PAYMENT` is the one state in which the ' +
      'balance may be paid, and only an Admin opens it (TR-LC14-05). `READY_FOR_DELIVERY` ' +
      'appears only after an Admin has verified that the money arrived; nothing a customer ' +
      'does produces it.',
  })
  orderStatus!: string;

  @ApiProperty({
    enum: schema.PAYMENT_OBLIGATION_STATES,
    example: 'PENDING',
    description:
      'The final payment obligation’s own state. `SATISFIED` means an Admin confirmed ' +
      'receipt; opening an attempt, downloading the QR and transferring at the bank all ' +
      'leave it `PENDING`. It is a different obligation from the deposit and moves ' +
      'independently of it (CST-039).',
  })
  finalPaymentStatus!: string;

  @ApiProperty(AMOUNT)
  finalPaymentAmount!: string;

  @ApiProperty({
    example: 'VND',
    description: 'The obligation’s own currency, copied. Always VND, enforced physically.',
  })
  currencyCode!: string;

  @ApiProperty({
    example: true,
    description:
      'Whether the two states above currently permit payment: the order is ' +
      'AWAITING_FINAL_PAYMENT and the obligation is still PENDING. Derived on every read and ' +
      'stored nowhere. It is not a claim that anything has been paid — that is ' +
      '`finalPaymentStatus` — but the single answer to "may the QR and a new attempt be ' +
      'requested right now", which the other two operations refuse when it is false.',
  })
  payable!: boolean;

  @ApiProperty({ type: FinalPaymentBankInstructionsResponse })
  bankInstructions!: FinalPaymentBankInstructionsResponse;

  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'When this secure link stops opening the final payment.',
  })
  accessExpiresAt!: string;
}

export class FinalPaymentAttemptResponse {
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
export interface CustomerFinalPaymentHttpView {
  readonly orderCode: string;
  readonly orderStatus: string;
  readonly finalPaymentStatus: string;
  readonly finalPaymentAmount: string;
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

export interface FinalPaymentAttemptHttpView {
  readonly attemptId: string;
  readonly method: string;
  readonly status: string;
  readonly amount: string;
  readonly currencyCode: string;
  readonly transferReference: string;
  readonly replayed: boolean;
}
