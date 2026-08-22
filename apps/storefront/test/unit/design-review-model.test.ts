/**
 * The `APP6-S02` pure models: consent, failure classification, the stage
 * reducer, the read-only scene adapter and the watermark.
 *
 * Everything here is a function, so the rules the screen depends on are
 * asserted by calling them rather than inferred from whatever happened to
 * render. The rules that matter most are the *negative* ones — consent must not
 * survive a change of terms, a document must not be repaired on read, a
 * duplicate operation must not trigger a re-read — and each is proved by
 * showing the outcome changes when the input does.
 */
import { AxiosError, AxiosHeaders } from 'axios';

import { normalizeApiClientError } from '@embroidery/api-client';

import {
  EMPTY_CONSENT,
  acceptedAgreementsOf,
  agreementSignatureOf,
  allAccepted,
  consentKeyOf,
  isAccepted,
  outstandingCount,
  toggleConsent,
} from '../../src/features/secure-design-review/model/design-review-consent';
import {
  decisionFailureOf,
  endsSecureSession,
  isDecisionNotice,
  requiresReconciliationRead,
} from '../../src/features/secure-design-review/model/design-review-failure';
import {
  initialReviewStage,
  reviewStageReducer,
  revisionFeedbackProblem,
  submittableIntent,
  REVISION_FEEDBACK_MAX,
  type ApprovalIntent,
} from '../../src/features/secure-design-review/model/design-review-state';
import {
  formatReviewDate,
  formatReviewInstant,
} from '../../src/features/secure-design-review/model/design-review-instant';
import { buildReviewScene } from '../../src/features/secure-design-review/model/review-scene';
import {
  REVIEW_WATERMARK_COLUMNS,
  REVIEW_WATERMARK_ROWS,
  REVIEW_WATERMARK_TOKEN_UNAVAILABLE,
  mintReviewWatermarkToken,
  reviewWatermarkTiles,
} from '../../src/features/secure-design-review/model/review-watermark';
import {
  DOCUMENT_HASH,
  NEWER_DOCUMENT_HASH,
  NEWER_VERSION_ID,
  PAYMENT_CONTENT_HASH,
  REPUBLISHED_CONTENT_HASH,
  VERSION_ID,
  catalogDocument,
  copDocument,
  freehandElement,
  imageElement,
  makeApproved,
  makeRevisionRequested,
  paymentAgreement,
  returnAgreement,
  shapeElement,
  textElement,
} from '../support/secure-design-review-fixture';

function apiError(status: number, code: string): unknown {
  const error = new AxiosError('refused', 'ERR_BAD_REQUEST');
  error.response = {
    status,
    statusText: '',
    headers: new AxiosHeaders(),
    config: { headers: new AxiosHeaders() },
    data: { success: false, code, message: 'refused', meta: {} },
  };
  return error;
}

const PAYMENT = paymentAgreement();
const RETURNS = returnAgreement();
const SET = [PAYMENT, RETURNS];

describe('agreement consent (§9)', () => {
  it('starts with nothing accepted, so an empty set is never "all accepted"', () => {
    expect(allAccepted(EMPTY_CONSENT, SET)).toBe(false);
    expect(outstandingCount(EMPTY_CONSENT, SET)).toBe(2);
    expect(allAccepted(EMPTY_CONSENT, [])).toBe(false);
  });

  it('records one tick at a time and only counts every agreement as complete', () => {
    const one = toggleConsent(EMPTY_CONSENT, SET, PAYMENT, true);
    expect(isAccepted(one, SET, PAYMENT)).toBe(true);
    expect(isAccepted(one, SET, RETURNS)).toBe(false);
    expect(allAccepted(one, SET)).toBe(false);
    expect(outstandingCount(one, SET)).toBe(1);

    const both = toggleConsent(one, SET, RETURNS, true);
    expect(allAccepted(both, SET)).toBe(true);
    expect(outstandingCount(both, SET)).toBe(0);
  });

  it('withdraws a tick', () => {
    const both = toggleConsent(
      toggleConsent(EMPTY_CONSENT, SET, PAYMENT, true),
      SET,
      RETURNS,
      true,
    );
    expect(allAccepted(toggleConsent(both, SET, PAYMENT, false), SET)).toBe(false);
  });

  /*
   * The load-bearing negative. There is no reset to delete: consent is stored
   * against the signature of the set it was given for, and it simply does not
   * apply to any other one.
   */
  it('does not survive a changed content hash on the same agreement version', () => {
    const both = toggleConsent(
      toggleConsent(EMPTY_CONSENT, SET, PAYMENT, true),
      SET,
      RETURNS,
      true,
    );
    expect(allAccepted(both, SET)).toBe(true);

    const republished = [paymentAgreement({ contentHash: REPUBLISHED_CONTENT_HASH }), RETURNS];
    expect(allAccepted(both, republished)).toBe(false);
    expect(outstandingCount(both, republished)).toBe(2);
  });

  it('does not survive a changed agreement version id', () => {
    const both = toggleConsent(
      toggleConsent(EMPTY_CONSENT, SET, PAYMENT, true),
      SET,
      RETURNS,
      true,
    );
    const reissued = [
      paymentAgreement({ agreementVersionId: '3f2504e0-4f89-41d3-9a0c-0305e82c3499' }),
      RETURNS,
    ];
    expect(allAccepted(both, reissued)).toBe(false);
  });

  it('does not survive an added, removed or reordered agreement', () => {
    const both = toggleConsent(
      toggleConsent(EMPTY_CONSENT, SET, PAYMENT, true),
      SET,
      RETURNS,
      true,
    );
    expect(allAccepted(both, [PAYMENT])).toBe(false);
    expect(allAccepted(both, [RETURNS, PAYMENT])).toBe(false);
    expect(allAccepted(both, [...SET, paymentAgreement({ agreementType: 'NEW_POLICY' })])).toBe(
      false,
    );
  });

  it('keys consent on both the id and the hash', () => {
    expect(consentKeyOf(PAYMENT)).toContain(PAYMENT.agreementVersionId);
    expect(consentKeyOf(PAYMENT)).toContain(PAYMENT_CONTENT_HASH);
  });

  it('submits exact id/hash pairs only, and only for what was ticked', () => {
    const one = toggleConsent(EMPTY_CONSENT, SET, PAYMENT, true);
    expect(acceptedAgreementsOf(one, SET)).toEqual([
      { agreementVersionId: PAYMENT.agreementVersionId, contentHash: PAYMENT_CONTENT_HASH },
    ]);

    const both = toggleConsent(one, SET, RETURNS, true);
    const body = acceptedAgreementsOf(both, SET);
    expect(body).toHaveLength(2);
    for (const entry of body) {
      expect(Object.keys(entry).sort()).toEqual(['agreementVersionId', 'contentHash']);
    }
  });

  it('carries no agreement type, version, language or content into the body', () => {
    const both = toggleConsent(
      toggleConsent(EMPTY_CONSENT, SET, PAYMENT, true),
      SET,
      RETURNS,
      true,
    );
    const serialized = JSON.stringify(acceptedAgreementsOf(both, SET));
    expect(serialized).not.toContain('PAYMENT_POLICY');
    expect(serialized).not.toContain('RETURN_POLICY');
    expect(serialized).not.toContain('đặt cọc');
    expect(serialized).not.toContain('"language"');
  });

  it('has no second, hard-coded authority for which types are required', () => {
    // The signature of an arbitrary published set is accepted as-is: nothing
    // here knows the names `PAYMENT_POLICY` or `RETURN_POLICY`.
    const invented = [paymentAgreement({ agreementType: 'SOMETHING_ELSE' })];
    const ticked = toggleConsent(EMPTY_CONSENT, invented, invented[0]!, true);
    expect(allAccepted(ticked, invented)).toBe(true);
    expect(agreementSignatureOf(invented)).toBe(consentKeyOf(invented[0]!));
  });
});

describe('failure classification (§5)', () => {
  it.each([
    [403, 'REVERIFICATION_REQUIRED', 'REVERIFICATION_REQUIRED'],
    [409, 'APPROVAL_VERSION_MISMATCH', 'APPROVAL_VERSION_MISMATCH'],
    [409, 'TERMS_NOT_ACCEPTED', 'TERMS_NOT_ACCEPTED'],
    [409, 'INVALID_TRANSITION', 'INVALID_TRANSITION'],
    [409, 'DUPLICATE_OPERATION', 'DUPLICATE_OPERATION'],
    [409, 'IDEMPOTENCY_CONFLICT', 'IDEMPOTENCY_CONFLICT'],
    [404, 'SECURE_LINK_UNAVAILABLE', 'UNAVAILABLE'],
  ])('maps %s %s by code', (status, code, expected) => {
    expect(decisionFailureOf(normalizeApiClientError(apiError(status, code)))).toBe(expected);
  });

  it('reads a bounded 503 as a service fault, never as "you failed to accept terms"', () => {
    const failure = decisionFailureOf(normalizeApiClientError(apiError(503, '')));
    expect(failure).toBe('POLICY_UNAVAILABLE');
    expect(failure).not.toBe('TERMS_NOT_ACCEPTED');
  });

  it('reads a rate limit and a server fault as transient, so no verdict is claimed', () => {
    expect(decisionFailureOf(normalizeApiClientError(apiError(429, '')))).toBe('TRANSIENT');
    expect(decisionFailureOf(normalizeApiClientError(apiError(500, '')))).toBe('TRANSIENT');
    expect(
      decisionFailureOf(normalizeApiClientError(new AxiosError('Network Error', 'ERR_NETWORK'))),
    ).toBe('TRANSIENT');
  });

  it('reads a 404 with a malformed envelope as unavailable rather than retryable', () => {
    expect(decisionFailureOf(normalizeApiClientError(apiError(404, '')))).toBe('UNAVAILABLE');
  });

  it('ends the secure session for exactly one failure', () => {
    expect(endsSecureSession('UNAVAILABLE')).toBe(true);
    for (const other of [
      'REVERIFICATION_REQUIRED',
      'APPROVAL_VERSION_MISMATCH',
      'TERMS_NOT_ACCEPTED',
      'INVALID_TRANSITION',
      'DUPLICATE_OPERATION',
      'IDEMPOTENCY_CONFLICT',
      'POLICY_UNAVAILABLE',
      'TRANSIENT',
    ] as const) {
      expect(endsSecureSession(other)).toBe(false);
    }
  });

  /*
   * `DUPLICATE_OPERATION` is the one conflict that must NOT re-read: the same
   * decision is still in flight, so nothing has changed to read, and a re-read
   * there is the first iteration of a polling loop (§16).
   */
  it('bounds the re-read to the four refusals that are statements about state', () => {
    expect(requiresReconciliationRead('APPROVAL_VERSION_MISMATCH')).toBe(true);
    expect(requiresReconciliationRead('TERMS_NOT_ACCEPTED')).toBe(true);
    expect(requiresReconciliationRead('INVALID_TRANSITION')).toBe(true);
    expect(requiresReconciliationRead('IDEMPOTENCY_CONFLICT')).toBe(true);

    expect(requiresReconciliationRead('DUPLICATE_OPERATION')).toBe(false);
    expect(requiresReconciliationRead('TRANSIENT')).toBe(false);
    expect(requiresReconciliationRead('POLICY_UNAVAILABLE')).toBe(false);
    expect(requiresReconciliationRead('REVERIFICATION_REQUIRED')).toBe(false);
  });

  it('keeps the four state-bearing failures out of the banner vocabulary', () => {
    expect(isDecisionNotice('REVERIFICATION_REQUIRED')).toBe(false);
    expect(isDecisionNotice('APPROVAL_VERSION_MISMATCH')).toBe(false);
    expect(isDecisionNotice('TERMS_NOT_ACCEPTED')).toBe(false);
    expect(isDecisionNotice('UNAVAILABLE')).toBe(false);
    expect(isDecisionNotice('DUPLICATE_OPERATION')).toBe(true);
  });
});

describe('the stage reducer (§13, §14, §15)', () => {
  const intent: ApprovalIntent = {
    versionId: VERSION_ID,
    version: 2,
    documentHash: DOCUMENT_HASH,
    acceptedAgreements: [
      { agreementVersionId: PAYMENT.agreementVersionId, contentHash: PAYMENT_CONTENT_HASH },
    ],
    agreementSignature: agreementSignatureOf(SET),
  };

  it('keeps the intent alive across a step-up, because the re-read compares to it', () => {
    const confirming = reviewStageReducer(initialReviewStage, {
      type: 'APPROVE_REQUESTED',
      intent,
    });
    const stepUp = reviewStageReducer(confirming, { type: 'STEP_UP_REQUIRED' });
    expect(stepUp.kind).toBe('STEP_UP');
    expect(stepUp.intent).toBe(intent);
  });

  it('returns to the confirmation after a step-up, never to a committed approval', () => {
    const stepUp = reviewStageReducer(
      reviewStageReducer(initialReviewStage, { type: 'APPROVE_REQUESTED', intent }),
      { type: 'STEP_UP_REQUIRED' },
    );
    const reconciling = reviewStageReducer(stepUp, { type: 'STEP_UP_VERIFIED' });
    expect(reconciling.kind).toBe('RECONCILING');

    const settled = reviewStageReducer(reconciling, { type: 'RECONCILED_SAME_REVIEW' });
    expect(settled.kind).toBe('APPROVE_CONFIRM');
    expect(settled.approved).toBeUndefined();
  });

  it('destroys the intent when the design moved, and reports a version mismatch', () => {
    const reconciling = reviewStageReducer(
      reviewStageReducer(initialReviewStage, { type: 'APPROVE_REQUESTED', intent }),
      { type: 'RECONCILE_STARTED' },
    );
    const settled = reviewStageReducer(reconciling, { type: 'RECONCILED_NEW_VERSION' });
    expect(settled.kind).toBe('VERSION_MISMATCH');
    expect(settled.intent).toBeUndefined();
  });

  it('reports a terms change as a terms change, not as a version mismatch', () => {
    const settled = reviewStageReducer(
      reviewStageReducer(initialReviewStage, { type: 'APPROVE_REQUESTED', intent }),
      { type: 'RECONCILED_NEW_TERMS' },
    );
    expect(settled.kind).toBe('TERMS_CHANGED');
    expect(settled.kind).not.toBe('VERSION_MISMATCH');
    expect(settled.intent).toBeUndefined();
  });

  it('opens the revision form with no intent at all', () => {
    const form = reviewStageReducer(
      reviewStageReducer(initialReviewStage, { type: 'APPROVE_REQUESTED', intent }),
      { type: 'REVISION_REQUESTED_FORM' },
    );
    expect(form.kind).toBe('REVISION_FORM');
    expect(form.intent).toBeUndefined();
  });

  it('commits each outcome onto a clean stage', () => {
    const approved = reviewStageReducer(initialReviewStage, {
      type: 'APPROVE_COMMITTED',
      outcome: makeApproved(),
    });
    expect(approved.kind).toBe('APPROVED');
    expect(approved.notice).toBeUndefined();

    const revised = reviewStageReducer(initialReviewStage, {
      type: 'REVISION_COMMITTED',
      outcome: makeRevisionRequested(),
    });
    expect(revised.kind).toBe('REVISION_REQUESTED');
    expect(revised.approved).toBeUndefined();
  });

  it('never leaves half a decision behind after a refusal', () => {
    const refused = reviewStageReducer(
      reviewStageReducer(initialReviewStage, { type: 'APPROVE_REQUESTED', intent }),
      { type: 'DECISION_REFUSED', notice: 'TRANSIENT' },
    );
    expect(refused.kind).toBe('REVIEW');
    expect(refused.intent).toBeUndefined();
    expect(refused.notice).toBe('TRANSIENT');
  });

  it('offers a submittable intent only while an approval is actually in play', () => {
    const confirming = reviewStageReducer(initialReviewStage, {
      type: 'APPROVE_REQUESTED',
      intent,
    });
    expect(submittableIntent(confirming)).toBe(intent);
    expect(submittableIntent(reviewStageReducer(confirming, { type: 'APPROVE_SUBMITTED' }))).toBe(
      intent,
    );
    expect(
      submittableIntent(reviewStageReducer(confirming, { type: 'STEP_UP_REQUIRED' })),
    ).toBeUndefined();
    expect(submittableIntent(initialReviewStage)).toBeUndefined();
  });
});

describe('revision feedback validation (§18)', () => {
  it('refuses empty and whitespace-only feedback before any request', () => {
    expect(revisionFeedbackProblem('')).toBe('REQUIRED');
    expect(revisionFeedbackProblem('   \n\t ')).toBe('REQUIRED');
  });

  it('accepts real text and measures the ceiling on the trimmed value', () => {
    expect(revisionFeedbackProblem('  chữ to hơn  ')).toBeUndefined();
    expect(revisionFeedbackProblem('a'.repeat(REVISION_FEEDBACK_MAX))).toBeUndefined();
    expect(revisionFeedbackProblem('a'.repeat(REVISION_FEEDBACK_MAX + 1))).toBe('TOO_LONG');
    // Trailing spaces do not push a valid message over the limit.
    expect(revisionFeedbackProblem(`${'a'.repeat(REVISION_FEEDBACK_MAX)}    `)).toBeUndefined();
  });

  it('matches the ceiling the wire publishes', () => {
    expect(REVISION_FEEDBACK_MAX).toBe(2000);
  });
});

describe('the read-only scene adapter (§10, §12)', () => {
  it('renders the Catalog branch at schema version 1', () => {
    const result = buildReviewScene(catalogDocument());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scene.canvasWidthPx).toBe(1000);
    expect(result.scene.elements).toHaveLength(2);
    expect(result.scene.elements[0]?.transform).toMatch(/^matrix\(/);
  });

  it('renders the customer-owned-product branch at schema version 2', () => {
    const result = buildReviewScene(copDocument());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scene.elements).toHaveLength(2);
  });

  it('draws every element kind without a canvas or a second engine', () => {
    const result = buildReviewScene(
      catalogDocument([
        textElement('t1'),
        shapeElement('s1'),
        shapeElement('s2', { shape: 'ellipse' }),
        shapeElement('s3', { shape: 'line' }),
        imageElement('i1'),
        freehandElement('f1'),
      ]),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scene.elements).toHaveLength(6);
  });

  it('refuses an unsupported schema version rather than migrating it', () => {
    const result = buildReviewScene({ ...catalogDocument(), schemaVersion: 99 });
    expect(result).toEqual({ ok: false, failure: 'UNREADABLE_DOCUMENT' });
  });

  it('refuses a malformed document rather than repairing it', () => {
    expect(buildReviewScene({ nonsense: true })).toEqual({
      ok: false,
      failure: 'UNREADABLE_DOCUMENT',
    });
    expect(buildReviewScene(null)).toEqual({ ok: false, failure: 'UNREADABLE_DOCUMENT' });
  });

  it('refuses a text element naming a font outside the controlled registry', () => {
    const result = buildReviewScene(
      catalogDocument([textElement('t1', { fontId: 'comic-sans-forever' })]),
    );
    expect(result).toEqual({ ok: false, failure: 'UNCONTROLLED_FONT' });
  });

  it('paints no group, because its transform is already in every descendant', () => {
    const document = catalogDocument([
      {
        id: 'g1',
        type: 'group',
        visible: true,
        locked: false,
        opacity: 1,
        transform: {
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          rotationDeg: 0,
          scaleX: 1,
          scaleY: 1,
        },
        childIds: ['t1'],
      },
      textElement('t1'),
    ]);
    const result = buildReviewScene(document);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scene.elements.map((element) => element.id)).toEqual(['t1']);
  });

  /*
   * The adapter hands back the document's own elements, never a copy it has
   * edited. A rewrite here would mean the customer approves artwork whose hash
   * no longer describes what they saw.
   */
  it('returns the stored element objects untouched', () => {
    const element = textElement('t1');
    const document = catalogDocument([element]);
    const result = buildReviewScene(document);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scene.elements[0]?.element).toEqual(element);
  });

  it('preserves document array order as z-order, never sorting or reversing', () => {
    const result = buildReviewScene(
      catalogDocument([shapeElement('bottom'), textElement('middle'), shapeElement('top')]),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scene.elements.map((element) => element.id)).toEqual(['bottom', 'middle', 'top']);
  });

  it('computes no hash of its own', () => {
    const result = buildReviewScene(catalogDocument());
    expect(JSON.stringify(result)).not.toContain('sha256');
    expect(DOCUMENT_HASH).not.toBe(NEWER_DOCUMENT_HASH);
    expect(VERSION_ID).not.toBe(NEWER_VERSION_ID);
  });
});

describe('the runtime watermark (§11)', () => {
  it('draws a fixed grid whose size does not depend on the document', () => {
    const tiles = reviewWatermarkTiles();
    expect(tiles).toHaveLength(REVIEW_WATERMARK_ROWS * REVIEW_WATERMARK_COLUMNS);
    expect(new Set(tiles.map((tile) => tile.key)).size).toBe(tiles.length);
  });

  it('over-draws beyond the box so a rotated corner is never bare', () => {
    const tiles = reviewWatermarkTiles();
    expect(Math.min(...tiles.map((tile) => tile.leftPercent))).toBeLessThan(0);
    expect(Math.max(...tiles.map((tile) => tile.topPercent))).toBeGreaterThan(100);
  });

  it('mints an opaque token that carries nothing about the viewing', () => {
    const token = mintReviewWatermarkToken();
    expect(token).toHaveLength(8);
    expect(token).toMatch(/^[A-HJ-NP-Z2-9]+$/);
    expect(token).not.toContain(VERSION_ID);
  });

  it('refuses to invent randomness it does not have', () => {
    const real = globalThis.crypto;
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
    try {
      expect(mintReviewWatermarkToken()).toBe(REVIEW_WATERMARK_TOKEN_UNAVAILABLE);
    } finally {
      Object.defineProperty(globalThis, 'crypto', { value: real, configurable: true });
    }
  });
});

describe('customer-facing instants', () => {
  /*
   * Caught in the browser, not in jsdom: a test asserting "the subtitle
   * contains the sent instant" passes just as well against the raw ISO string
   * the wire carries, which is exactly what this screen was showing.
   */
  it('renders a wire instant as a date a customer can read', () => {
    expect(formatReviewDate('2026-08-21T15:09:01.979Z')).toBe('21/08/2026');
    expect(formatReviewInstant('2026-08-21T15:09:01.979Z')).toBe('21/08/2026 · 22:09');
  });

  it('never shows a raw ISO string, and degrades to silence rather than to an error word', () => {
    for (const formatted of [
      formatReviewDate('2026-08-21T15:09:01.979Z'),
      formatReviewInstant('2026-08-21T15:09:01.979Z'),
    ]) {
      expect(formatted).not.toContain('T');
      expect(formatted).not.toContain('Z');
    }
    for (const bad of ['', 'not-a-date', 'null']) {
      expect(formatReviewDate(bad)).toBe('');
      expect(formatReviewInstant(bad)).toBe('');
    }
  });
});
