/**
 * The `APP6-S01` model layer: exact money, failure classification, the decision
 * stage machine and the frame mapping (§11, §12, §13, §16, §19).
 *
 * These are the rules that decide what the customer is told and what they are
 * allowed to do, so they are asserted as pure functions rather than inferred
 * from a rendered DOM — a component test can only show that *some* path
 * produced the right screen, while these say the mapping itself is right for
 * every input, including the ones a browser is hard to drive into.
 */
import {
  formatExactAmount,
  formatExactMoney,
  formatExactPercent,
  isZeroAmount,
} from '../../src/features/secure-quotation/model/exact-money';
import {
  decisionFailureOf,
  endsSecureSession,
  requiresReconciliationRead,
} from '../../src/features/secure-quotation/model/secure-quotation-failure';
import {
  initialQuoteStage,
  isDecidable,
  quoteStageReducer,
  secureQuotationUiState,
  type QuoteStage,
} from '../../src/features/secure-quotation/model/secure-quotation-state';
import {
  quotationPresentation,
  remainingDays,
} from '../../src/features/secure-quotation/model/quotation-presentation';
import { SECURE_QUOTATION_COPY as COPY } from '../../src/features/secure-quotation/model/secure-quotation-copy';
import {
  NEWER_VERSION_ID,
  VERSION_ID,
  makeAccepted,
  makeQuotation,
  makeRejected,
} from '../support/secure-quotation-fixture';

describe('APP6-S01 — exact money', () => {
  it('groups a stored amount without changing it', () => {
    expect(formatExactAmount('3670000.00')).toBe('3.670.000');
    expect(formatExactAmount('0.00')).toBe('0');
    expect(formatExactAmount('999.00')).toBe('999');
  });

  it('renders a negative adjustment as negative', () => {
    // The typographic minus of `700:43`, not a dropped sign.
    expect(formatExactAmount('-170000.00')).toBe('−170.000');
  });

  it('returns an amount with a non-zero fraction verbatim rather than truncating it', () => {
    // VND has no minor unit, so this is a figure the system never wrote. Showing
    // it whole is the only honest answer; hiding the fraction would misreport.
    expect(formatExactAmount('120000.50')).toBe('120000.50');
  });

  it('returns an unparsable amount verbatim', () => {
    expect(formatExactAmount('not-a-number')).toBe('not-a-number');
  });

  it('states the currency the server priced in', () => {
    expect(formatExactMoney('3530000.00', 'VND')).toBe('3.530.000 VND');
  });

  it('trims a stored percentage without dividing anything', () => {
    expect(formatExactPercent('40.00')).toBe('40%');
    expect(formatExactPercent('37.50')).toBe('37.5%');
  });

  it('decides zero by reading digits', () => {
    expect(isZeroAmount('0.00')).toBe(true);
    expect(isZeroAmount('-0.00')).toBe(true);
    expect(isZeroAmount('0.01')).toBe(false);
    expect(isZeroAmount('-170000.00')).toBe(false);
  });
});

describe('APP6-S01 — failure classification', () => {
  const cases = [
    { code: 'REVERIFICATION_REQUIRED', httpStatus: 403, expected: 'REVERIFICATION_REQUIRED' },
    { code: 'QUOTE_VERSION_STALE', httpStatus: 409, expected: 'QUOTE_VERSION_STALE' },
    { code: 'INVALID_TRANSITION', httpStatus: 409, expected: 'INVALID_TRANSITION' },
    { code: 'DUPLICATE_OPERATION', httpStatus: 409, expected: 'DUPLICATE_OPERATION' },
    { code: 'IDEMPOTENCY_CONFLICT', httpStatus: 409, expected: 'IDEMPOTENCY_CONFLICT' },
  ] as const;

  it.each(cases)('reads $code from the envelope', ({ code, httpStatus, expected }) => {
    expect(decisionFailureOf({ code, message: 'refused', httpStatus })).toBe(expected);
  });

  it('treats a 404 as the one indistinguishable unavailable outcome', () => {
    expect(decisionFailureOf({ code: 'NOT_FOUND', message: '', httpStatus: 404 })).toBe(
      'UNAVAILABLE',
    );
  });

  it('treats a response-less transport failure as transient, never as a verdict', () => {
    expect(decisionFailureOf({ code: 'ERR_NETWORK', message: '' })).toBe('TRANSIENT');
  });

  it('treats 429 and 5xx as transient', () => {
    expect(decisionFailureOf({ code: 'RATE_LIMITED', message: '', httpStatus: 429 })).toBe(
      'TRANSIENT',
    );
    expect(decisionFailureOf({ code: 'BOOM', message: '', httpStatus: 500 })).toBe('TRANSIENT');
  });

  it('ends the secure session for exactly one failure', () => {
    expect(endsSecureSession('UNAVAILABLE')).toBe(true);
    expect(endsSecureSession('TRANSIENT')).toBe(false);
    expect(endsSecureSession('REVERIFICATION_REQUIRED')).toBe(false);
  });

  it('bounds the re-read to the three refusals that contradict what is on screen', () => {
    expect(requiresReconciliationRead('QUOTE_VERSION_STALE')).toBe(true);
    expect(requiresReconciliationRead('INVALID_TRANSITION')).toBe(true);
    expect(requiresReconciliationRead('IDEMPOTENCY_CONFLICT')).toBe(true);
    // A duplicate is the *same* decision still running: re-reading would only
    // add load to a server that already told us to wait.
    expect(requiresReconciliationRead('DUPLICATE_OPERATION')).toBe(false);
    expect(requiresReconciliationRead('TRANSIENT')).toBe(false);
  });
});

describe('APP6-S01 — decision stage', () => {
  it('captures the exact version when a decision is requested', () => {
    const stage = quoteStageReducer(initialQuoteStage, {
      type: 'ACCEPT_REQUESTED',
      versionId: VERSION_ID,
    });
    expect(stage).toMatchObject({ kind: 'ACCEPT_CONFIRM', decisionVersionId: VERSION_ID });
  });

  it('keeps that version across a step-up, so the re-read compares the right thing', () => {
    let stage = quoteStageReducer(initialQuoteStage, {
      type: 'ACCEPT_REQUESTED',
      versionId: VERSION_ID,
    });
    stage = quoteStageReducer(stage, { type: 'ACCEPT_SUBMITTED' });
    stage = quoteStageReducer(stage, { type: 'STEP_UP_REQUIRED' });
    stage = quoteStageReducer(stage, { type: 'STEP_UP_VERIFIED' });
    expect(stage).toMatchObject({ kind: 'RECONCILING', decisionVersionId: VERSION_ID });
  });

  it('never auto-accepts after a step-up: the same version returns to the confirmation', () => {
    const suspended: QuoteStage = {
      ...initialQuoteStage,
      kind: 'RECONCILING',
      decisionVersionId: VERSION_ID,
    };
    expect(quoteStageReducer(suspended, { type: 'RECONCILED_SAME_VERSION' })).toMatchObject({
      kind: 'ACCEPT_CONFIRM',
    });
  });

  it('sends a changed version to the stale frame with no decision carried over', () => {
    const suspended: QuoteStage = {
      ...initialQuoteStage,
      kind: 'RECONCILING',
      decisionVersionId: VERSION_ID,
    };
    const stage = quoteStageReducer(suspended, { type: 'RECONCILED_NEW_VERSION' });
    expect(stage).toEqual({ ...initialQuoteStage, kind: 'STALE' });
    expect(stage.decisionVersionId).toBeUndefined();
  });

  it('drops the pending decision when one is refused', () => {
    const submitting: QuoteStage = {
      ...initialQuoteStage,
      kind: 'ACCEPTING',
      decisionVersionId: VERSION_ID,
    };
    const stage = quoteStageReducer(submitting, {
      type: 'DECISION_REFUSED',
      notice: 'DUPLICATE_OPERATION',
    });
    expect(stage).toMatchObject({ kind: 'READY', notice: 'DUPLICATE_OPERATION' });
    expect(stage.decisionVersionId).toBeUndefined();
  });

  it('carries the committed outcome and nothing else', () => {
    const outcome = makeAccepted();
    const stage = quoteStageReducer(initialQuoteStage, { type: 'ACCEPT_COMMITTED', outcome });
    expect(stage).toEqual({ ...initialQuoteStage, kind: 'ACCEPTED', accepted: outcome });
  });

  it('carries no verification code or credential in any action', () => {
    const stage = quoteStageReducer(initialQuoteStage, {
      type: 'REJECT_COMMITTED',
      outcome: makeRejected(),
    });
    expect(JSON.stringify(stage)).not.toContain('token');
  });
});

describe('APP6-S01 — which frame is on screen', () => {
  it('offers a decision only on a live sent offer', () => {
    expect(isDecidable({ status: 'SENT', quotationStatus: 'SENT', expired: false })).toBe(true);
    expect(isDecidable({ status: 'SENT', quotationStatus: 'SENT', expired: true })).toBe(false);
    // Both stored states matter: B05 decides against the header *and* the row.
    expect(isDecidable({ status: 'SENT', quotationStatus: 'EXPIRED', expired: false })).toBe(false);
    expect(isDecidable({ status: 'SUPERSEDED', quotationStatus: 'SENT', expired: false })).toBe(
      false,
    );
  });

  it('renders the lapsed frame when the server says the offer expired', () => {
    expect(secureQuotationUiState(initialQuoteStage, makeQuotation({ expired: true }))).toBe(
      'EXPIRED',
    );
  });

  it('keeps the committed outcome on screen even as the read reports the new state', () => {
    const stage = quoteStageReducer(initialQuoteStage, {
      type: 'ACCEPT_COMMITTED',
      outcome: makeAccepted(),
    });
    const quote = makeQuotation({ status: 'ACCEPTED', quotationStatus: 'ACCEPTED' });
    expect(secureQuotationUiState(stage, quote)).toBe('ACCEPTED');
  });

  it('reports a quotation already decided elsewhere without claiming this mount decided it', () => {
    const quote = makeQuotation({ status: 'REJECTED', quotationStatus: 'REJECTED' });
    expect(secureQuotationUiState(initialQuoteStage, quote)).toBe('REJECTED');
  });
});

describe('APP6-S01 — presentation', () => {
  const now = Date.parse('2026-08-20T09:00:00.000Z');

  it('shows the adjustment amount and never an explanation for it', () => {
    const presentation = quotationPresentation(makeQuotation(), 'READY', now);
    const adjustment = presentation.totals.find((row) => row.key === 'adjustment');
    expect(adjustment).toEqual({
      key: 'adjustment',
      label: COPY.totals.manualAdjustment,
      value: '−170.000 VND',
    });
    // The sample frame's `Giảm giá khách quen` is the internal reason B04
    // withholds; nothing in the projection may reintroduce it.
    expect(JSON.stringify(presentation)).not.toMatch(/khách quen/i);
  });

  it('omits a zero adjustment and a zero shipping fee rather than printing zeroes', () => {
    const presentation = quotationPresentation(
      makeQuotation({ manualAdjustmentAmount: '0.00', shippingFeeAmount: '0.00' }),
      'READY',
      now,
    );
    expect(presentation.totals.map((row) => row.key)).toEqual(['subtotal']);
  });

  it('shows the recorded total, never the sum of the visible rows', () => {
    // Subtotal 3.670.000 − 170.000 + 30.000 = 3.530.000 here by construction,
    // but the assertion is on the *stored* total: a fixture whose parts did not
    // add up would still have to render this figure.
    const presentation = quotationPresentation(
      makeQuotation({ totalAmount: '9999999.00' }),
      'READY',
      now,
    );
    expect(presentation.totalAmount).toBe('9.999.999 VND');
  });

  it('labels the deposit with the share this version was priced at', () => {
    const presentation = quotationPresentation(
      makeQuotation({ depositPercent: '35.00' }),
      'READY',
      now,
    );
    expect(presentation.depositLabel).toBe('Đặt cọc 35%');
    // No complementary share: it would only exist by subtraction.
    expect(presentation.remainingLabel).toBe(COPY.totals.remaining);
  });

  it('drops the day count rather than contradicting the server', () => {
    // The server still calls this live; the browser clock is already past it.
    expect(remainingDays('2026-08-19T09:00:00.000Z', now)).toBeUndefined();
    expect(remainingDays(null, now)).toBeUndefined();
    expect(remainingDays('2026-08-26T09:00:00.000Z', now)).toBe(6);
  });

  it('dates a decision found in the read by nothing at all', () => {
    const quote = makeQuotation({ status: 'ACCEPTED', quotationStatus: 'ACCEPTED' });
    expect(quotationPresentation(quote, 'ACCEPTED', now).badge).toBe(COPY.badges.acceptedUndated);
  });

  it('names the version that now stands on the stale frame', () => {
    const quote = makeQuotation({ version: 3, versionId: NEWER_VERSION_ID });
    const presentation = quotationPresentation(quote, 'STALE', now);
    expect(presentation.title).toBe(COPY.titles.stale);
    expect(presentation.subtitle).toContain('3');
  });

  it('discloses no internal identifier', () => {
    const serialized = JSON.stringify(quotationPresentation(makeQuotation(), 'READY', now));
    for (const forbidden of [VERSION_ID, 'customerId', 'grantId', 'stitch', 'skuId']) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});
