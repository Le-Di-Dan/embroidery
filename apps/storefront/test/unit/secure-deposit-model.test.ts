/**
 * @jest-environment node
 *
 * The pure rules behind `/truy-cap/thanh-toan` (`APP7-S01` §7, §11, §13, §17,
 * §19, §21, §23, §28).
 *
 * These are the decisions a rendering test can only observe indirectly: which
 * panel a pair of server facts selects, whether a figure survives formatting
 * untouched, and what a refusal code means. Asserting them here means the
 * component suites can be about *behaviour* rather than about re-deriving the
 * same table through the DOM.
 */
import {
  CustomerDepositResponseDepositStatus,
  CustomerDepositResponseOrderStatus,
  DepositAttemptResponseStatus,
  TransferEvidenceItemResponseAssetStatus,
  type NormalizedApiError,
} from '@embroidery/api-client';

import {
  attemptIsTerminal,
  depositConfirmed,
  depositPanelOf,
  evidenceIntakeOpen,
  shouldReconcileDeposit,
} from '../../src/features/secure-deposit-payment/model/deposit-payment-state';
import {
  formatExactAmount,
  formatExactMoney,
} from '../../src/features/secure-deposit-payment/model/exact-deposit-amount';
import {
  initiateFailureOf,
  requiresEvidenceRefetch,
  uploadFailureOf,
} from '../../src/features/secure-deposit-payment/model/deposit-failure';
import {
  MAX_EVIDENCE_BYTES,
  MAX_EVIDENCE_PER_ATTEMPT,
  evidenceToneOf,
  localFileRefusal,
} from '../../src/features/secure-deposit-payment/model/transfer-evidence';
import { SECURE_DEPOSIT_COPY } from '../../src/features/secure-deposit-payment/model/secure-deposit-copy';
import {
  DEPOSIT_AMOUNT,
  makeAttempt,
  makeDeposit,
  makeVerifiedDeposit,
} from '../support/secure-deposit-fixture';

describe('APP7-S01 — the deposit figure is never computed', () => {
  it('groups the server digits and changes nothing else', () => {
    expect(formatExactAmount(DEPOSIT_AMOUNT)).toBe('5.100.000');
    expect(formatExactMoney(DEPOSIT_AMOUNT, 'VND')).toBe('5.100.000 VND');
  });

  it('returns an amount with a non-zero fraction verbatim rather than truncating it', () => {
    // A value this system never wrote. Hiding the fraction would be the one way
    // this formatter could misreport a figure.
    expect(formatExactAmount('5100000.55')).toBe('5100000.55');
  });

  it('returns an unparseable amount unchanged', () => {
    expect(formatExactAmount('không rõ')).toBe('không rõ');
  });

  it('states the currency the server sent rather than asserting VND', () => {
    expect(formatExactMoney('1000', 'XTS')).toBe('1.000 XTS');
  });
});

describe('APP7-S01 — only server truth selects the confirmation', () => {
  it('is not confirmed while the obligation is pending', () => {
    expect(depositConfirmed(makeDeposit())).toBe(false);
  });

  it('is confirmed on the satisfied obligation alone', () => {
    expect(
      depositConfirmed(
        makeDeposit({ depositStatus: CustomerDepositResponseDepositStatus.SATISFIED }),
      ),
    ).toBe(true);
  });

  it('is confirmed on the paid order alone', () => {
    expect(
      depositConfirmed(
        makeDeposit({ orderStatus: CustomerDepositResponseOrderStatus.DEPOSIT_PAID }),
      ),
    ).toBe(true);
  });

  it('does not confirm on a SUCCEEDED attempt whose obligation is still pending', () => {
    // `751:175` marks *attempt SUCCEEDED **and** obligation SATISFIED* as the
    // paid row. The conjunction is the claim, and the attempt alone is not it.
    const attempt = makeAttempt({ status: DepositAttemptResponseStatus.SUCCEEDED });
    expect(depositPanelOf(makeDeposit(), attempt)).toBe('UNDRAWN');
    expect(shouldReconcileDeposit(attempt)).toBe(true);
  });

  it('lets the confirmation win over any attempt this session happens to hold', () => {
    const stale = makeAttempt({ status: DepositAttemptResponseStatus.PENDING });
    expect(depositPanelOf(makeVerifiedDeposit(), stale)).toBe('CONFIRMED');
  });
});

describe('APP7-S01 — the panel is chosen from the contract vocabulary', () => {
  it('shows the pre-attempt frame when no attempt has been opened', () => {
    expect(depositPanelOf(makeDeposit(), undefined)).toBe('PRE_ATTEMPT');
  });

  it.each([
    [DepositAttemptResponseStatus.PENDING, 'INSTRUCTIONS'],
    [DepositAttemptResponseStatus.REQUIRES_REVIEW, 'REVIEW'],
    [DepositAttemptResponseStatus.FAILED, 'TERMINAL'],
    [DepositAttemptResponseStatus.EXPIRED, 'TERMINAL'],
    [DepositAttemptResponseStatus.PROCESSING, 'UNDRAWN'],
    [DepositAttemptResponseStatus.REFUNDED, 'UNDRAWN'],
    [DepositAttemptResponseStatus.PARTIALLY_REFUNDED, 'UNDRAWN'],
  ])('maps %s to %s', (status, panel) => {
    expect(depositPanelOf(makeDeposit(), makeAttempt({ status }))).toBe(panel);
  });

  it('reconciles only on SUCCEEDED, so nothing here can begin a poll', () => {
    for (const status of Object.values(DepositAttemptResponseStatus)) {
      expect(shouldReconcileDeposit(makeAttempt({ status }))).toBe(
        status === DepositAttemptResponseStatus.SUCCEEDED,
      );
    }
  });

  it('treats FAILED and EXPIRED as terminal and nothing else', () => {
    expect(attemptIsTerminal(makeAttempt({ status: DepositAttemptResponseStatus.FAILED }))).toBe(
      true,
    );
    expect(attemptIsTerminal(makeAttempt({ status: DepositAttemptResponseStatus.EXPIRED }))).toBe(
      true,
    );
    expect(
      attemptIsTerminal(makeAttempt({ status: DepositAttemptResponseStatus.REQUIRES_REVIEW })),
    ).toBe(false);
  });
});

describe('APP7-S01 — the evidence intake closes for four separate reasons', () => {
  const attempt = makeAttempt();

  it('is open on a pending attempt below the quota', () => {
    expect(evidenceIntakeOpen(makeDeposit(), attempt, 0, MAX_EVIDENCE_PER_ATTEMPT)).toBe(true);
  });

  it('stays open while the attempt is being reconciled', () => {
    // `749:23` keeps the intake available under REQUIRES_REVIEW, because a
    // reconciliation is precisely when another image helps.
    const reviewing = makeAttempt({ status: DepositAttemptResponseStatus.REQUIRES_REVIEW });
    expect(evidenceIntakeOpen(makeDeposit(), reviewing, 2, MAX_EVIDENCE_PER_ATTEMPT)).toBe(true);
  });

  it('closes once the deposit is verified', () => {
    expect(evidenceIntakeOpen(makeVerifiedDeposit(), attempt, 0, MAX_EVIDENCE_PER_ATTEMPT)).toBe(
      false,
    );
  });

  it('closes when no attempt exists to attach an image to', () => {
    expect(evidenceIntakeOpen(makeDeposit(), undefined, 0, MAX_EVIDENCE_PER_ATTEMPT)).toBe(false);
  });

  it('closes on a terminal attempt', () => {
    const dead = makeAttempt({ status: DepositAttemptResponseStatus.EXPIRED });
    expect(evidenceIntakeOpen(makeDeposit(), dead, 1, MAX_EVIDENCE_PER_ATTEMPT)).toBe(false);
  });

  it('closes at exactly five and not at four', () => {
    expect(evidenceIntakeOpen(makeDeposit(), attempt, 4, MAX_EVIDENCE_PER_ATTEMPT)).toBe(true);
    expect(evidenceIntakeOpen(makeDeposit(), attempt, 5, MAX_EVIDENCE_PER_ATTEMPT)).toBe(false);
  });
});

describe('APP7-S01 — an image status is the image’s, never the payment’s', () => {
  it('renders UPLOADED and INSPECTING identically', () => {
    expect(SECURE_DEPOSIT_COPY.evidenceStatus.UPLOADED.label).toBe(
      SECURE_DEPOSIT_COPY.evidenceStatus.INSPECTING.label,
    );
    expect(evidenceToneOf(TransferEvidenceItemResponseAssetStatus.UPLOADED)).toBe('PENDING');
    expect(evidenceToneOf(TransferEvidenceItemResponseAssetStatus.INSPECTING)).toBe('PENDING');
  });

  it('gives ACCEPTED and REJECTED their own tone without a payment word', () => {
    expect(evidenceToneOf(TransferEvidenceItemResponseAssetStatus.ACCEPTED)).toBe('ACCEPTED');
    expect(evidenceToneOf(TransferEvidenceItemResponseAssetStatus.REJECTED)).toBe('REJECTED');

    const words = Object.values(SECURE_DEPOSIT_COPY.evidenceStatus).flatMap((entry) => [
      entry.label,
      entry.note,
    ]);
    for (const sentence of words) {
      expect(sentence).not.toContain('thanh toán');
      expect(sentence).not.toContain('tiền cọc');
    }
  });
});

describe('APP7-S01 — the local file guard is strict, never permissive', () => {
  function file(type: string, size: number): File {
    const made = new File(['x'], 'anh.jpg', { type });
    Object.defineProperty(made, 'size', { value: size });
    return made;
  }

  it('accepts the three contract media types', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
      expect(localFileRefusal(file(type, 1024))).toBeUndefined();
    }
  });

  it.each(['image/gif', 'image/svg+xml', 'image/heic', 'application/pdf', ''])(
    'refuses %s before a byte leaves the browser',
    (type) => {
      expect(localFileRefusal(file(type, 1024))).toBe('MEDIA_UNSUPPORTED');
    },
  );

  it('refuses one byte over 10 MiB and accepts exactly 10 MiB', () => {
    expect(localFileRefusal(file('image/png', MAX_EVIDENCE_BYTES))).toBeUndefined();
    expect(localFileRefusal(file('image/png', MAX_EVIDENCE_BYTES + 1))).toBe('TOO_LARGE');
  });
});

describe('APP7-S01 — refusals are read by code first, status second', () => {
  // `exactOptionalPropertyTypes` is on, so an absent status is an absent *key*
  // rather than an explicit `undefined` — which is also exactly how
  // `normalizeApiClientError` reports a request that never reached a verdict.
  const at = (code: string, httpStatus?: number): NormalizedApiError =>
    httpStatus === undefined
      ? { code, message: 'refused' }
      : { code, message: 'refused', httpStatus };

  it('keeps the step-up remedy out of the unavailable state', () => {
    expect(initiateFailureOf(at('REVERIFICATION_REQUIRED', 403))).toBe('REVERIFICATION_REQUIRED');
  });

  it('reads the three 409 conflicts apart despite the shared status', () => {
    expect(initiateFailureOf(at('DEPOSIT_NOT_PAYABLE', 409))).toBe('DEPOSIT_NOT_PAYABLE');
    expect(initiateFailureOf(at('DUPLICATE_OPERATION', 409))).toBe('DUPLICATE_OPERATION');
    expect(initiateFailureOf(at('IDEMPOTENCY_CONFLICT', 409))).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('collapses the secure-link 404 to one unavailable verdict', () => {
    expect(initiateFailureOf(at('SECURE_LINK_UNAVAILABLE', 404))).toBe('UNAVAILABLE');
    expect(uploadFailureOf(at('SECURE_LINK_UNAVAILABLE', 404))).toBe('UNAVAILABLE');
  });

  it('says nothing definitive about a 429, a 5xx or a lost request', () => {
    expect(initiateFailureOf(at('RATE_LIMITED', 429))).toBe('TRANSIENT');
    expect(initiateFailureOf(at('INTERNAL', 500))).toBe('TRANSIENT');
    expect(initiateFailureOf(at('NETWORK_ERROR'))).toBe('TRANSIENT');
  });

  it('maps the asset-intake media refusals rather than re-coding them', () => {
    expect(uploadFailureOf(at('ASSET_UPLOAD_MEDIA_UNSUPPORTED', 415))).toBe('MEDIA_UNSUPPORTED');
    expect(uploadFailureOf(at('ASSET_UPLOAD_SIGNATURE_MISMATCH', 415))).toBe('MEDIA_UNSUPPORTED');
    expect(uploadFailureOf(at('ASSET_UPLOAD_TOO_LARGE', 413))).toBe('TOO_LARGE');
  });

  it('re-reads the list only for the two refusals about the stored set', () => {
    expect(requiresEvidenceRefetch('QUOTA_REACHED')).toBe(true);
    expect(requiresEvidenceRefetch('ATTEMPT_CLOSED')).toBe(true);
    expect(requiresEvidenceRefetch('MEDIA_UNSUPPORTED')).toBe(false);
    expect(requiresEvidenceRefetch('TRANSIENT')).toBe(false);
  });
});
