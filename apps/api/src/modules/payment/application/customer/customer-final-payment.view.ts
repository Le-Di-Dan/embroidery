/**
 * What a customer may be told about their final payment (`APP9-B02` §8).
 *
 * A **sibling** of `CustomerDepositView`, not a re-pointing of it. `APP7-B03`
 * closed that projection to deposit semantics deliberately — its field names
 * say `deposit`, its published contract asserts that the word `remaining` never
 * appears in it, and `APP9-R00` confirmed the closure was intentional — so
 * making it serve both obligations would have meant either lying in its names or
 * reopening an accepted contract.
 *
 * ### What it deliberately does not carry
 *
 * No obligation id, attempt id, grant id, challenge id or customer id: the
 * surface accepts none of them, so publishing one would only teach a caller a
 * locator no operation takes. No reconciliation, verification, refund or
 * provider field — those are Admin's and `IMP-O007`'s. No shipping, carrier or
 * tracking field, which APP9 records internally and shows no customer. No
 * attempt list: `APP7-B03` defined no customer attempt selector and `APP9-B02`
 * adds none.
 */
import type { OrderState, PaymentObligationState } from '@embroidery/database';

export interface FinalPaymentBankInstructionsView {
  readonly bankBin: string;
  readonly bankDisplayName: string;
  readonly accountNumber: string;
  readonly accountName: string;
  readonly transferReference: string;
}

export interface CustomerFinalPaymentView {
  readonly orderCode: string;
  readonly orderStatus: OrderState;
  readonly finalPaymentStatus: PaymentObligationState;
  readonly finalPaymentAmount: string;
  readonly currencyCode: string;
  /**
   * Whether the two states above currently permit payment.
   *
   * Derived at read time by `isFinalPaymentPayable`, stored nowhere. It is
   * published rather than left to the caller because the rule is business
   * authority (`APP9-G01` §4) and a browser deciding it from two enums would be
   * a second, drifting copy of LC-14.
   */
  readonly payable: boolean;
  readonly bankInstructions: FinalPaymentBankInstructionsView;
  readonly accessExpiresAt: Date;
}

export interface FinalPaymentAttemptView {
  readonly attemptId: string;
  readonly method: string;
  readonly status: string;
  readonly amount: string;
  readonly currencyCode: string;
  readonly transferReference: string;
  readonly replayed: boolean;
}
