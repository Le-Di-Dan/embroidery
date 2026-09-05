/**
 * How the three payment vocabularies are named to an operator (`751:3`).
 *
 * ## The three groups are never collapsed
 *
 * `751:3` states the rule the whole phase is built on, and this module is where
 * it is enforced in code: **an image status is never a payment status, and a
 * payment-attempt status is never an order status**. Each group gets its own
 * lookup, its own labels and its own tones, and there is deliberately no shared
 * "Đã thanh toán" badge for any of them to reach. The only two facts in APP7
 * that may read as paid are an attempt reaching `SUCCEEDED` with its obligation
 * `SATISFIED`, and the order reaching `DEPOSIT_PAID` — and those are the order
 * and obligation lookups, not this one.
 *
 * An `ACCEPTED` screenshot means the file passed inspection. It does not mean
 * money arrived, and a `REJECTED` one does not mean a payment failed — which is
 * why the evidence labels below say "Đã tiếp nhận" and "Không hợp lệ" rather
 * than anything about payment at all.
 *
 * ## Values the contract publishes but APP7 never produces
 *
 * `751:174` names them: attempt `PROCESSING`, `REFUNDED` and
 * `PARTIALLY_REFUNDED`; obligation `CANCELLED` and `SUPERSEDED`. A stored row
 * may carry one and the panel renders what is stored, so each is named plainly
 * and tinted **neutral**: tinting them would be APP7 asserting a meaning for a
 * state it neither creates nor owns a screen for.
 *
 * ## Presentation only
 *
 * No transition table, no action matrix, no "can this attempt be verified".
 * Those are server facts; a helper that answered them here would become a second
 * payment lifecycle authority living in the browser. Every lookup is total —
 * an unrecognised value degrades to the neutral fallback rather than putting a
 * raw English enum member on an otherwise Vietnamese page.
 */
import { VI_MESSAGES, messageView } from '@embroidery/i18n';
import { STATUS_SYMBOLS, type StatusPresentation } from '../../../shared/presentation/order-status';
import type { AdminStatusTone } from '../../../shared/status/admin-status-badge';

/**
 * Every sentence below lives in the canonical Vietnamese message repository
 * (`packages/i18n/messages/vi/admin-orders.json`), not in this file
 * (`APP12-V02` §5A).
 */
const paymentVocabularyMessage = messageView(VI_MESSAGES.adminOrders, 'paymentVocabulary');

/**
 * Every sentence below lives in the canonical Vietnamese message repository
 * (`packages/i18n/messages/vi/admin-orders.json`, under `paymentVocabulary.evidence`), not in this
 * file (`APP12-V02` §5A). What stays here is the *shape* of the catalog and the
 * reasoning for each key — neither of which JSON can hold — so a Product Owner
 * changes wording by editing one JSON file and a reviewer still reads why the
 * key exists at the point of use.
 */
const paymentVocabularyEvidenceMessage = messageView(
  VI_MESSAGES.adminOrders,
  'paymentVocabulary.evidence',
);

/**
 * Every sentence below lives in the canonical Vietnamese message repository
 * (`packages/i18n/messages/vi/admin-orders.json`, under `paymentVocabulary.attempt`), not in this
 * file (`APP12-V02` §5A). What stays here is the *shape* of the catalog and the
 * reasoning for each key — neither of which JSON can hold — so a Product Owner
 * changes wording by editing one JSON file and a reviewer still reads why the
 * key exists at the point of use.
 */
const paymentVocabularyAttemptMessage = messageView(
  VI_MESSAGES.adminOrders,
  'paymentVocabulary.attempt',
);

/**
 * Every sentence below lives in the canonical Vietnamese message repository
 * (`packages/i18n/messages/vi/admin-orders.json`, under `paymentVocabulary.obligation`), not in this
 * file (`APP12-V02` §5A). What stays here is the *shape* of the catalog and the
 * reasoning for each key — neither of which JSON can hold — so a Product Owner
 * changes wording by editing one JSON file and a reviewer still reads why the
 * key exists at the point of use.
 */
const paymentVocabularyObligationMessage = messageView(
  VI_MESSAGES.adminOrders,
  'paymentVocabulary.obligation',
);

interface StatusStyle {
  readonly label: string;
  readonly tone: AdminStatusTone;
  readonly symbol: string;
}

const UNKNOWN_LABEL = paymentVocabularyMessage.text('unknownLabel');

const UNKNOWN_PRESENTATION: StatusPresentation = {
  token: 'UNKNOWN',
  label: UNKNOWN_LABEL,
  tone: 'neutral',
  symbol: STATUS_SYMBOLS.idle,
  known: false,
};

function present(
  styles: Readonly<Record<string, StatusStyle>>,
  value: unknown,
): StatusPresentation {
  const style = typeof value === 'string' ? styles[value] : undefined;
  return style === undefined
    ? UNKNOWN_PRESENTATION
    : { token: value as string, ...style, known: true };
}

/**
 * The obligation's LC-15 state (`751:3` “Nghĩa vụ cọc”).
 *
 * One table for both obligation kinds: `DEPOSIT` on a custom order and `FULL`
 * on a Ready-Made one carry the same four states, and `APP12-V02` (`V01-UX-005`)
 * found the FULL workbench rendering `obligation.status` as its own label
 * because it had no presenter to reach for. It has this one.
 */
const OBLIGATION_STATUS_STYLES: Readonly<Record<string, StatusStyle>> = {
  PENDING: {
    label: paymentVocabularyObligationMessage.text('PENDING.label'),
    tone: 'warning',
    symbol: STATUS_SYMBOLS.waiting,
  },
  SATISFIED: {
    label: paymentVocabularyObligationMessage.text('SATISFIED.label'),
    tone: 'success',
    symbol: STATUS_SYMBOLS.succeeded,
  },
  CANCELLED: {
    label: paymentVocabularyObligationMessage.text('CANCELLED.label'),
    tone: 'neutral',
    symbol: STATUS_SYMBOLS.idle,
  },
  SUPERSEDED: {
    label: paymentVocabularyObligationMessage.text('SUPERSEDED.label'),
    tone: 'neutral',
    symbol: STATUS_SYMBOLS.idle,
  },
};

export function presentObligationStatus(status: unknown): StatusPresentation {
  return present(OBLIGATION_STATUS_STYLES, status);
}

/** The deposit-named alias the APP7 summary card reads. */
export const presentDepositStatus = presentObligationStatus;

/** One payment attempt's LC-16 state (`751:3` "Lần thanh toán"). */
const ATTEMPT_STATUS_STYLES: Readonly<Record<string, StatusStyle>> = {
  PENDING: {
    label: paymentVocabularyAttemptMessage.text('PENDING.label'),
    tone: 'warning',
    symbol: STATUS_SYMBOLS.waiting,
  },
  REQUIRES_REVIEW: {
    label: paymentVocabularyAttemptMessage.text('REQUIRES_REVIEW.label'),
    tone: 'warning',
    symbol: STATUS_SYMBOLS.working,
  },
  SUCCEEDED: {
    label: paymentVocabularyAttemptMessage.text('SUCCEEDED.label'),
    tone: 'success',
    symbol: STATUS_SYMBOLS.succeeded,
  },
  FAILED: {
    label: paymentVocabularyAttemptMessage.text('FAILED.label'),
    tone: 'error',
    symbol: STATUS_SYMBOLS.ended,
  },
  EXPIRED: {
    label: paymentVocabularyAttemptMessage.text('EXPIRED.label'),
    tone: 'error',
    symbol: STATUS_SYMBOLS.ended,
  },
  PROCESSING: {
    label: paymentVocabularyAttemptMessage.text('PROCESSING.label'),
    tone: 'neutral',
    symbol: STATUS_SYMBOLS.working,
  },
  REFUNDED: {
    label: paymentVocabularyAttemptMessage.text('REFUNDED.label'),
    tone: 'neutral',
    symbol: STATUS_SYMBOLS.ended,
  },
  PARTIALLY_REFUNDED: {
    label: paymentVocabularyAttemptMessage.text('PARTIALLY_REFUNDED.label'),
    tone: 'neutral',
    symbol: STATUS_SYMBOLS.ended,
  },
};

export function presentAttemptStatus(status: unknown): StatusPresentation {
  return present(ATTEMPT_STATUS_STYLES, status);
}

/**
 * The attempt badge caption the panel frames draw: the stored token, an em
 * dash, then the Vietnamese phrase (`734:3`, `740:3`, `740:56`).
 *
 * Both halves on purpose. The operator reconciles this screen against a bank
 * statement and a database, so the contract value has to be readable; the phrase
 * is what makes it legible to someone who does not know LC-16 by heart.
 */
export function attemptStatusCaption(status: unknown): string {
  const presentation = presentAttemptStatus(status);
  return presentation.known ? `${presentation.token} — ${presentation.label}` : presentation.label;
}

/**
 * One transfer screenshot's inspection state.
 *
 * `UPLOADED` and `INSPECTING` are deliberately identical — `743:34` says so:
 * the contract distinguishes "file received" from "file being inspected", and
 * the operator-visible difference is nil, so inventing a fourth label would add
 * a distinction the product does not need.
 */
const EVIDENCE_STATUS_STYLES: Readonly<Record<string, StatusStyle>> = {
  UPLOADED: {
    label: paymentVocabularyEvidenceMessage.text('UPLOADED.label'),
    tone: 'warning',
    symbol: STATUS_SYMBOLS.working,
  },
  INSPECTING: {
    label: paymentVocabularyEvidenceMessage.text('INSPECTING.label'),
    tone: 'warning',
    symbol: STATUS_SYMBOLS.working,
  },
  ACCEPTED: {
    label: paymentVocabularyEvidenceMessage.text('ACCEPTED.label'),
    tone: 'success',
    symbol: STATUS_SYMBOLS.succeeded,
  },
  REJECTED: {
    label: paymentVocabularyEvidenceMessage.text('REJECTED.label'),
    tone: 'error',
    symbol: STATUS_SYMBOLS.ended,
  },
};

export function presentEvidenceStatus(status: unknown): StatusPresentation {
  return present(EVIDENCE_STATUS_STYLES, status);
}

/**
 * A reconciliation's resolved attempt state, for the history table (`743:35`).
 *
 * The contract types `resolvedStatus` as a plain optional `string` rather than
 * the LC-16 enum, so it is looked up through the attempt vocabulary and falls
 * back to neutral. The **action** column is not mapped at all: `743:35` renders
 * `MANUAL_MATCH` and `RESOLVE_REVIEW` verbatim, and translating an audit action
 * would put a word in the history that the audit trail does not contain.
 */
export function presentResolvedStatus(status: unknown): StatusPresentation {
  return presentAttemptStatus(status);
}
