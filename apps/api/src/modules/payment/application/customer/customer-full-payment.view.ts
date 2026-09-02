/**
 * What a customer may be told about their Ready-Made full payment
 * (`APP12-B04` §15, §16).
 *
 * A **sibling** of `CustomerDepositView` and `CustomerFinalPaymentView`, not a
 * re-pointing of either. `APP7-B03` closed the deposit projection to deposit
 * semantics deliberately — its field names say `deposit` and its published
 * contract asserts that the word `remaining` never appears in it — and
 * `APP9-B02` made the same argument for the balance. Ready-Made is neither: it
 * has one obligation, no 40/60 split, and `APP12-D01` §I records that the order
 * page carries no `DEPOSIT`/`REMAINING` language at all. Reusing either
 * projection would have meant lying in its names.
 *
 * ### What it deliberately does not carry
 *
 * No obligation id, attempt id, grant id, challenge id, customer id or order
 * UUID: the surface accepts none of them, so publishing one would only teach a
 * caller a locator no operation takes (`BR-032`). No reconciliation,
 * verification, refund or provider field — those are Admin's (`APP12-B05`) and
 * `IMP-O007`'s. No shipping, carrier or tracking field. No attempt list:
 * `APP7-B03` defined no customer attempt selector, `APP9-B02` added none, and
 * neither does this.
 */
import type { OrderState, PaymentObligationState } from '@embroidery/database';

export interface FullPaymentBankInstructionsView {
  readonly bankBin: string;
  readonly bankDisplayName: string;
  readonly accountNumber: string;
  readonly accountName: string;
  readonly transferReference: string;
}

export interface CustomerFullPaymentView {
  readonly orderCode: string;
  readonly orderStatus: OrderState;
  readonly fullPaymentStatus: PaymentObligationState;
  /**
   * The exact amount owed.
   *
   * The live `FULL` obligation's **own** frozen figure, which `APP12-B03`
   * composed once as `frozen merchandise subtotal + exact shipping fee`.
   * Nothing on this path adds a fee to a subtotal, subtracts a deposit from a
   * total, reads a quotation or touches an order line: a total recomputed at
   * read time would disagree with the obligation an Admin will verify against
   * the moment a shipping fee moved, and after a correction it is the
   * successor's amount that is live.
   */
  readonly fullPaymentAmount: string;
  readonly currencyCode: string;
  /**
   * Whether the two states above currently permit payment.
   *
   * Derived at read time by `isFullPaymentPayable`, stored nowhere. It is
   * published rather than left to the caller because the rule is business
   * authority and a browser deciding it from two enums would be a second,
   * drifting copy of the Ready-Made lifecycle.
   */
  readonly payable: boolean;
  readonly bankInstructions: FullPaymentBankInstructionsView;
  readonly accessExpiresAt: Date;
}

export interface FullPaymentAttemptView {
  readonly attemptId: string;
  readonly method: string;
  readonly status: string;
  readonly amount: string;
  readonly currencyCode: string;
  readonly transferReference: string;
  readonly replayed: boolean;
}
