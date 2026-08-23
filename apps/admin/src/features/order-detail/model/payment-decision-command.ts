/**
 * The two payment decision bodies, their validation, and — most of all — what
 * this screen is forbidden to do to the operator's text (`737:3`, `737:40`,
 * `740:111`).
 *
 * ## `observedTransferReference` is never touched
 *
 * The accepted `APP7-B04` request schema puts **no** `pattern`, **no**
 * `maxLength` and **no** `minLength` on this field. `737:40` spells out the
 * consequence: the value is submitted exactly as the operator typed it. So there
 * is no uppercasing here, no trimming, no punctuation stripping, no whitespace
 * collapsing, no Unicode normalization, no 15-character canonical form and no
 * invented 2000-character bound — and the control that carries it declares no
 * HTML `pattern`, `maxLength` or `text-transform`.
 *
 * The reason is not pedantry. A bank memo is unstructured text a human copies
 * off a statement; the operator is transcribing what the bank recorded, and any
 * "helpful" normalization would make them submit something the bank never wrote.
 * The server compares it, and the server is the only thing that may decide the
 * comparison. Note the drawn success case (`740:48`): a *lower-case* reference
 * embedded in a longer sentence still matched — so the client could not
 * reproduce the rule even if it wanted to, and must not try.
 *
 * The field is required by the verify contract but not by the review contract,
 * and "required" here means non-empty. An empty string is refused because the
 * schema's `minLength` on the *other* two verify fields makes an all-blank
 * submission pointless, not because this field has a length rule of its own.
 *
 * ## `observedAmount` mirrors exactly one published expression
 *
 * `^\d{1,12}(?:\.\d{1,2})?$`, neither loosened nor tightened, checked against
 * the *text*. Nothing here parses it into a number: the value travels as the
 * string the operator typed, and the server compares it exactly with no
 * tolerance, no rounding and no floating point. Client validation is shape
 * guidance so a malformed amount is caught before a round trip; the server
 * re-validates and remains the only judge of a refusal.
 *
 * ## The caller owns nothing the server owns
 *
 * Neither body has a field for a status, an admin id, an expected amount or an
 * expected reference, and none is added here. The review endpoint *means*
 * `REQUIRES_REVIEW` — `740:117` — so there is no status to choose; the operator
 * is derived from their session; and the expected values are the obligation's
 * own frozen column and the reference derived from the order code, neither of
 * which a request may supply.
 */
import type { ReviewPaymentAttemptBody, VerifyPaymentAttemptBody } from '@embroidery/api-client';

import { isWellFormedObservedAmount } from '../../../shared/presentation/exact-amount';
import { ORDER_DETAIL_COPY as COPY } from './order-detail-copy';

/** The contract's own bound on the two free-text fields that carry one. */
const MAX_REASON_LENGTH = 2000;

export interface VerifyFormValues {
  readonly observedAmount: string;
  readonly observedTransferReference: string;
  readonly note: string;
}

export const EMPTY_VERIFY_FORM: VerifyFormValues = {
  observedAmount: '',
  observedTransferReference: '',
  note: '',
};

export interface ReviewFormValues {
  readonly reviewReason: string;
  readonly observedAmount: string;
  readonly observedTransferReference: string;
}

export const EMPTY_REVIEW_FORM: ReviewFormValues = {
  reviewReason: '',
  observedAmount: '',
  observedTransferReference: '',
};

export type VerifyFormErrors = Partial<Record<keyof VerifyFormValues, string>>;
export type ReviewFormErrors = Partial<Record<keyof ReviewFormValues, string>>;

export function hasErrors(errors: Readonly<Record<string, string | undefined>>): boolean {
  return Object.values(errors).some((message) => message !== undefined);
}

/**
 * All three verify fields are required by the contract (`737:56`).
 *
 * `note` and `observedAmount` are validated for shape as well; the reference is
 * only checked for presence, because presence is the only rule the contract
 * publishes for it.
 */
export function validateVerifyForm(values: VerifyFormValues): VerifyFormErrors {
  const errors: VerifyFormErrors = {};
  if (values.observedAmount === '') {
    errors.observedAmount = COPY.validation.required;
  } else if (!isWellFormedObservedAmount(values.observedAmount)) {
    errors.observedAmount = COPY.validation.amountShape;
  }
  if (values.observedTransferReference === '') {
    errors.observedTransferReference = COPY.validation.required;
  }
  if (values.note === '') {
    errors.note = COPY.validation.required;
  } else if (values.note.length > MAX_REASON_LENGTH) {
    errors.note = COPY.validation.tooLong;
  }
  return errors;
}

/**
 * `reviewReason` is required; the two observed fields are optional (`740:129`,
 * `740:136`).
 *
 * An omitted observed value records **nothing** rather than a fabricated zero —
 * which is why an empty box is valid and a malformed one is not.
 */
export function validateReviewForm(values: ReviewFormValues): ReviewFormErrors {
  const errors: ReviewFormErrors = {};
  if (values.reviewReason === '') {
    errors.reviewReason = COPY.validation.required;
  } else if (values.reviewReason.length > MAX_REASON_LENGTH) {
    errors.reviewReason = COPY.validation.tooLong;
  }
  if (values.observedAmount !== '' && !isWellFormedObservedAmount(values.observedAmount)) {
    errors.observedAmount = COPY.validation.amountShape;
  }
  return errors;
}

/** The verify body, carrying the three values verbatim. */
export function toVerifyBody(values: VerifyFormValues): VerifyPaymentAttemptBody {
  return {
    note: values.note,
    observedAmount: values.observedAmount,
    observedTransferReference: values.observedTransferReference,
  };
}

/**
 * The review body.
 *
 * An empty optional box omits the property entirely rather than sending `''`:
 * the contract's `observedAmount` pattern does not accept an empty string, and
 * "the operator saw no transaction" is an absence, not an empty observation.
 */
export function toReviewBody(values: ReviewFormValues): ReviewPaymentAttemptBody {
  return {
    reviewReason: values.reviewReason,
    ...(values.observedAmount === '' ? {} : { observedAmount: values.observedAmount }),
    ...(values.observedTransferReference === ''
      ? {}
      : { observedTransferReference: values.observedTransferReference }),
  };
}
