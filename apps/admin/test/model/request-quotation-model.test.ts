/**
 * The quotation workbench's pure model (`APP6-A01` §8, §9, §12, §13, §17).
 *
 * These are the claims that would be expensive to prove through the DOM and
 * cheap to break silently:
 *
 *  - no amount on this screen ever passes through a JavaScript number;
 *  - a customer-owned request is never offered a `PRODUCT` line;
 *  - the adjustment-reason rule is mirrored in **both** directions, as
 *    `computeDraftPricing` enforces it;
 *  - a refusal is classified from the envelope, never from its message;
 *  - the selected version and the customer-current version stay distinct.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import { normalizeApiClientError } from '@embroidery/api-client';
import type { AdminQuotationVersionResponse } from '@embroidery/api-client';

import {
  formatExactAmount,
  formatExactMoney,
  formatExactPercent,
  isWellFormedAmount,
  isZeroAmount,
} from '../../src/features/request-quotation/model/exact-money';
import {
  CATALOG_LINE_KINDS,
  COP_LINE_KINDS,
  emptyForm,
  lineKindsFor,
  toCreateBody,
  toVersionBody,
  validateForm,
  type AuthoringForm,
} from '../../src/features/request-quotation/model/quotation-authoring-form';
import {
  classifyDraftingFailure,
  classifyReadFailure,
  classifySendFailure,
  preservesDraftFields,
  RequestQuotationApiError,
  requiresReconciliation,
} from '../../src/features/request-quotation/model/request-quotation-failure';
import {
  isAcceptedQuotation,
  isCustomerCurrent,
  isImmutableVersion,
  isSendable,
  presentInstant,
  presentLineKind,
  presentRequestStatus,
  presentVersionStatus,
  resolveSelectedVersion,
  subjectKindOf,
} from '../../src/features/request-quotation/model/quotation-presentation';
import { REQUEST_QUOTATION_COPY as COPY } from '../../src/features/request-quotation/model/request-quotation-copy';
import { makeApiClientError, makeNetworkError } from '../support/api-error';
import {
  makeCatalogRequest,
  makeCopRequest,
  makeHeader,
  makeVersion,
  QUOTATION_ID,
  QUOTATION_REQUEST_ID,
  VERSION_1_ID,
  VERSION_2_ID,
} from '../support/request-quotation-fixture';

function apiError(status: number, code: string): RequestQuotationApiError {
  return new RequestQuotationApiError(
    normalizeApiClientError(makeApiClientError({ status, code, message: 'Chi tiết máy chủ.' })),
  );
}

describe('exact money is displayed, never computed', () => {
  it('groups a whole-đồng amount without changing its value', () => {
    expect(formatExactAmount('1234567.00')).toBe('1.234.567');
    expect(formatExactAmount('1000.00')).toBe('1.000');
    expect(formatExactAmount('999')).toBe('999');
    expect(formatExactAmount('-1234.00')).toBe('-1.234');
    expect(formatExactAmount('0.00')).toBe('0');
  });

  it('shows an unexpected fraction verbatim rather than truncating it', () => {
    // This is the whole safety property: a value this system never wrote is
    // surfaced as it is, so an operator can see something is wrong. Truncating
    // would silently misreport the figure.
    expect(formatExactAmount('1234567.89')).toBe('1234567.89');
  });

  it('returns an unparseable amount untouched instead of guessing', () => {
    expect(formatExactAmount('abc')).toBe('abc');
    expect(formatExactAmount('')).toBe('');
    expect(formatExactAmount('1,234')).toBe('1,234');
  });

  it('never loses a digit of a very large amount — no float ever holds it', () => {
    // 9007199254740993 is Number.MAX_SAFE_INTEGER + 2, which a double cannot
    // represent. A parse-and-reprint round trip would render …992.
    expect(formatExactAmount('9007199254740993.00')).toBe('9.007.199.254.740.993');
  });

  it('appends the currency mark without touching the number', () => {
    expect(formatExactMoney('1234567.00')).toBe('1.234.567 ₫');
  });

  it('renders the version-priced deposit share as stored', () => {
    expect(formatExactPercent('37.50')).toBe('37.5%');
    expect(formatExactPercent('30.00')).toBe('30%');
    expect(formatExactPercent('nonsense')).toBe('nonsense');
  });

  it('decides "no adjustment" by digits, not by numeric conversion', () => {
    expect(isZeroAmount('')).toBe(true);
    expect(isZeroAmount('0')).toBe(true);
    expect(isZeroAmount('0.00')).toBe(true);
    expect(isZeroAmount('-0.00')).toBe(true);
    expect(isZeroAmount('0.01')).toBe(false);
    expect(isZeroAmount('-500')).toBe(false);
  });

  it('mirrors the server money shape and refuses what the server would refuse', () => {
    expect(isWellFormedAmount('100000')).toBe(true);
    expect(isWellFormedAmount('100000.50')).toBe(true);
    expect(isWellFormedAmount('-2500.00')).toBe(true);
    expect(isWellFormedAmount('100000.505')).toBe(false);
    expect(isWellFormedAmount('1234567890123')).toBe(false);
    expect(isWellFormedAmount('1e5')).toBe(false);
    expect(isWellFormedAmount('')).toBe(false);
  });

  it('contains no numeric-coercion call anywhere in the feature source', () => {
    // A grep-style guard, because the rule is about code shape rather than one
    // output: a future edit that reintroduces `Number(total)` would keep every
    // assertion above green.
    const root = join(__dirname, '..', '..', 'src', 'features', 'request-quotation');

    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) return walk(full);
        return /\.tsx?$/.test(entry.name) ? [full] : [];
      });

    const files = walk(root);
    expect(files.length).toBeGreaterThan(10);

    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      // Strip block and line comments: the doc blocks in this feature discuss
      // the forbidden calls by name, and flagging prose would make the guard
      // useless.
      const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      for (const pattern of [
        /\bparseFloat\s*\(/,
        /\bNumber\s*\(/,
        /\bMath\.round\s*\(/,
        /\bNumber\.parseFloat\s*\(/,
      ]) {
        if (pattern.test(code)) {
          offenders.push(`${basename(file)}: ${pattern.source}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('the offered line kinds', () => {
  it('offers a product line only for a catalog request', () => {
    expect(lineKindsFor('CATALOG')).toContain('PRODUCT');
    expect(lineKindsFor('CUSTOMER_OWNED')).not.toContain('PRODUCT');
  });

  it('treats an unreadable subject as the narrower offer', () => {
    expect(lineKindsFor('UNKNOWN')).toEqual(COP_LINE_KINDS);
  });

  it('offers neither SHIPPING nor ADJUSTMENT, which have their own body fields', () => {
    for (const kinds of [CATALOG_LINE_KINDS, COP_LINE_KINDS]) {
      expect(kinds).not.toContain('SHIPPING');
      expect(kinds).not.toContain('ADJUSTMENT');
    }
  });

  it('reads the subject branch from the contract discriminator', () => {
    expect(subjectKindOf(makeCatalogRequest())).toBe('CATALOG');
    expect(subjectKindOf(makeCopRequest())).toBe('CUSTOMER_OWNED');
    expect(subjectKindOf(makeCatalogRequest({ subject: null }))).toBe('UNKNOWN');
  });
});

describe('form validation mirrors the server, in both directions', () => {
  const valid: AuthoringForm = {
    quantityTotal: '12',
    stitchCount: '15000',
    shippingFeeAmount: '50000',
    manualAdjustmentAmount: '',
    adjustmentReason: '',
    lineItems: [
      {
        lineKind: 'EMBROIDERY',
        description: 'Thêu logo',
        quantity: '12',
        unitPriceAmount: '102880.66',
      },
    ],
  };

  it('accepts a well-formed form', () => {
    expect(validateForm(valid)).toEqual([]);
  });

  it('requires a reason when the operator adjusts the price', () => {
    const issues = validateForm({ ...valid, manualAdjustmentAmount: '-50000' });
    expect(issues).toEqual([
      { field: 'adjustmentReason', message: COPY.validation.adjustmentReasonRequired },
    ]);
  });

  it('refuses a reason with no adjustment to explain — the half a mirror usually misses', () => {
    const issues = validateForm({ ...valid, adjustmentReason: 'Giảm cho khách quen' });
    expect(issues).toEqual([
      { field: 'adjustmentReason', message: COPY.validation.adjustmentReasonUnexpected },
    ]);
  });

  it('treats an explicit zero adjustment exactly as the server does — as no adjustment', () => {
    expect(
      validateForm({
        ...valid,
        manualAdjustmentAmount: '0.00',
        adjustmentReason: 'Vì lý do gì đó',
      }),
    ).toEqual([{ field: 'adjustmentReason', message: COPY.validation.adjustmentReasonUnexpected }]);
  });

  it('binds every line issue to the control it is about', () => {
    const issues = validateForm({
      ...valid,
      lineItems: [
        valid.lineItems[0]!,
        { lineKind: 'OTHER', description: '  ', quantity: '0', unitPriceAmount: '1e5' },
      ],
    });
    expect(issues.map((issue) => issue.field)).toEqual([
      'lineItems.1.description',
      'lineItems.1.quantity',
      'lineItems.1.unitPriceAmount',
    ]);
  });

  it('refuses a non-positive total quantity', () => {
    expect(validateForm({ ...valid, quantityTotal: '0' })[0]?.field).toBe('quantityTotal');
    expect(validateForm({ ...valid, quantityTotal: '' })[0]?.field).toBe('quantityTotal');
  });

  it('starts an empty form with one line of the first offered kind', () => {
    expect(emptyForm(COP_LINE_KINDS).lineItems).toHaveLength(1);
    expect(emptyForm(COP_LINE_KINDS).lineItems[0]?.lineKind).toBe('EMBROIDERY');
  });
});

describe('the submitted body', () => {
  const form: AuthoringForm = {
    quantityTotal: ' 12 ',
    stitchCount: '',
    shippingFeeAmount: ' 50000.00 ',
    manualAdjustmentAmount: ' -50000.00 ',
    adjustmentReason: '  Giảm cho khách quen  ',
    lineItems: [
      {
        lineKind: 'EMBROIDERY',
        description: ' Thêu logo ',
        quantity: '12',
        unitPriceAmount: ' 102880.66 ',
      },
    ],
  };

  it('sends every amount as the exact string the operator typed', () => {
    const body = toVersionBody(form);
    expect(body.shippingFeeAmount).toBe('50000.00');
    expect(body.manualAdjustmentAmount).toBe('-50000.00');
    expect(body.lineItems[0]?.unitPriceAmount).toBe('102880.66');
    for (const amount of [
      body.shippingFeeAmount,
      body.manualAdjustmentAmount,
      body.lineItems[0]?.unitPriceAmount,
    ]) {
      expect(typeof amount).toBe('string');
    }
  });

  it('carries no derived figure — the body is .strict() and the server prices it', () => {
    const keys = Object.keys(toVersionBody(form));
    for (const derived of [
      'subtotalAmount',
      'totalAmount',
      'depositAmount',
      'depositPercent',
      'remainingAmount',
      'lineTotalAmount',
    ]) {
      expect(keys).not.toContain(derived);
    }
    expect(Object.keys(toVersionBody(form).lineItems[0]!)).not.toContain('lineTotalAmount');
  });

  it('omits an optional field rather than sending it empty', () => {
    const body = toVersionBody({ ...form, manualAdjustmentAmount: '', adjustmentReason: '' });
    expect(body).not.toHaveProperty('stitchCount');
    expect(body).not.toHaveProperty('manualAdjustmentAmount');
    expect(body).not.toHaveProperty('adjustmentReason');
  });

  it('omits the reason when the adjustment is zero, which is the shape B01 refuses', () => {
    const body = toVersionBody({ ...form, manualAdjustmentAmount: '0.00' });
    expect(body).not.toHaveProperty('adjustmentReason');
  });

  it('sends the two counts as integers, and they are not money', () => {
    const body = toVersionBody({ ...form, stitchCount: ' 15000 ' });
    expect(body.quantityTotal).toBe(12);
    expect(body.stitchCount).toBe(15_000);
  });

  it('addresses the create body at the request, and adds nothing else', () => {
    const create = toCreateBody(QUOTATION_REQUEST_ID, form);
    expect(create.customRequestId).toBe(QUOTATION_REQUEST_ID);
    const { customRequestId: _ignored, ...rest } = create;
    expect(rest).toEqual(toVersionBody(form));
  });
});

describe('failures are classified from the envelope', () => {
  it('merges "no such request" and "not yours" into one read outcome', () => {
    expect(classifyReadFailure(apiError(404, 'REQUEST_NOT_FOUND'))).toBe('missing');
    expect(classifyReadFailure(apiError(403, 'FORBIDDEN'))).toBe('missing');
    expect(classifyReadFailure(apiError(400, 'VALIDATION_FAILED'))).toBe('missing');
    expect(classifyReadFailure(apiError(401, 'UNAUTHENTICATED'))).toBe('unauthenticated');
    expect(classifyReadFailure(apiError(500, 'INTERNAL_ERROR'))).toBe('retryable');
    expect(classifyReadFailure(new Error('boom'))).toBe('retryable');
  });

  it('separates the recoverable conflict from the unrecoverable one by code', () => {
    expect(classifyDraftingFailure(apiError(409, 'QUOTATION_ALREADY_EXISTS'))).toBe('exists');
    expect(classifyDraftingFailure(apiError(409, 'REQUEST_NOT_QUOTABLE'))).toBe('stale');
  });

  it('treats a pricing refusal as something the operator can fix', () => {
    expect(classifyDraftingFailure(apiError(400, 'QUOTATION_PRICING_INVALID'))).toBe('rejected');
    expect(classifyDraftingFailure(apiError(422, 'QUOTATION_PRICING_INVALID'))).toBe('rejected');
    expect(preservesDraftFields('rejected')).toBe(true);
    expect(preservesDraftFields('exists')).toBe(false);
  });

  it('sends every reason to look again down one path', () => {
    for (const status of [409, 404, 403, 400]) {
      expect(classifySendFailure(apiError(status, 'ANY'))).toBe('stale');
    }
    expect(requiresReconciliation('stale')).toBe(true);
    expect(classifySendFailure(apiError(503, 'QUOTATION_POLICY_UNAVAILABLE'))).toBe('unavailable');
    expect(requiresReconciliation('unavailable')).toBe(false);
    expect(classifySendFailure(makeNetworkError())).toBe('retryable');
  });

  it('never carries a server message into what the screen will render', () => {
    const error = apiError(409, 'QUOTATION_ALREADY_EXISTS');
    // The classification is a closed union; the message stays on the envelope
    // and no copy string interpolates it.
    expect(classifyDraftingFailure(error)).toBe('exists');
    expect(error.message).not.toContain('Chi tiết máy chủ.');
    expect(Object.values(COPY.validation)).not.toContain(error.normalized.message);
    expect(JSON.stringify(COPY)).not.toContain('QUOTATION_ALREADY_EXISTS');
  });
});

describe('presentation never echoes a raw server token', () => {
  it('labels every known status and degrades an unknown one', () => {
    expect(presentVersionStatus('SENT')).toBe(COPY.versionStatus.SENT);
    expect(presentVersionStatus('SOMETHING_NEW')).toBe(COPY.versionStatus.unknown);
    expect(presentVersionStatus('SOMETHING_NEW')).not.toContain('SOMETHING_NEW');
  });

  // APP6-A01-C1. The browser pass found the rail rendering `detail.status`
  // straight from the contract, so an operator on a Vietnamese screen was shown
  // `UNDER_REVIEW`. Every status the request lifecycle can hold is covered here
  // rather than one sample, because the defect was a missing mapping and a
  // single-value test is exactly what would have missed it.
  it('labels every request status the lifecycle can hold', () => {
    const lifecycle = [
      'NEW',
      'UNDER_REVIEW',
      'NEEDS_CLARIFICATION',
      'QUOTED',
      'QUOTE_ACCEPTED',
      'DIGITIZING',
      'DESIGN_REVIEW',
      'APPROVED',
      'REJECTED',
      'CANCELLED',
    ];
    for (const status of lifecycle) {
      const label = presentRequestStatus(status);
      expect(label).not.toBe(status);
      expect(label).not.toBe(COPY.requestStatus.unknown);
    }
  });

  it('degrades an unmapped or non-string request status instead of echoing it', () => {
    expect(presentRequestStatus('SOMETHING_NEW')).toBe(COPY.requestStatus.unknown);
    expect(presentRequestStatus('SOMETHING_NEW')).not.toContain('SOMETHING_NEW');
    expect(presentRequestStatus(undefined)).toBe(COPY.requestStatus.unknown);
    expect(presentRequestStatus(42)).toBe(COPY.requestStatus.unknown);
  });

  // The history column renders the *version* status. It was borrowing the
  // request-status label, so the same page named two different things the same.
  it('gives the version-history column a label distinct from the request status', () => {
    expect(COPY.versionStatus.column).not.toBe(COPY.context.status);
  });

  it('labels every line kind, including the two the form does not offer', () => {
    expect(presentLineKind('SHIPPING')).toBe(COPY.lineKinds.SHIPPING);
    expect(presentLineKind('MYSTERY')).toBe(COPY.lineKinds.OTHER);
  });

  it('renders an absent instant as a dash rather than as "Invalid Date"', () => {
    expect(presentInstant(null)).toBe('—');
    expect(presentInstant('')).toBe('—');
    expect(presentInstant('not-a-date')).toBe('—');
    expect(presentInstant('2026-08-15T03:00:00.000Z')).not.toBe('—');
  });
});

describe('the selected version and the customer-current version are different questions', () => {
  const draft = makeVersion({ versionId: VERSION_2_ID, version: 2, status: 'DRAFT' });
  const sent = makeVersion({ versionId: VERSION_1_ID, version: 1, status: 'SENT' });

  it('prefers the newest DRAFT when the operator has picked nothing', () => {
    expect(resolveSelectedVersion([sent, draft], null)?.versionId).toBe(VERSION_2_ID);
  });

  it('falls back to the newest version when no DRAFT exists', () => {
    const second = makeVersion({ versionId: VERSION_2_ID, version: 2, status: 'SENT' });
    expect(resolveSelectedVersion([sent, second], null)?.versionId).toBe(VERSION_2_ID);
  });

  it('honours an explicit pick, and falls back when that version has vanished', () => {
    expect(resolveSelectedVersion([sent, draft], VERSION_1_ID)?.versionId).toBe(VERSION_1_ID);
    expect(resolveSelectedVersion([sent, draft], 'gone')?.versionId).toBe(VERSION_2_ID);
    expect(resolveSelectedVersion([], VERSION_1_ID)).toBeUndefined();
  });

  it('calls nothing customer-current before the first send', () => {
    const header = makeHeader({ currentVersionId: null });
    expect(isCustomerCurrent(header, sent)).toBe(false);
    expect(isCustomerCurrent(header, draft)).toBe(false);
  });

  it('reads customer-current from the header pointer, not from a status', () => {
    const header = makeHeader({ currentVersionId: VERSION_1_ID });
    const alsoSent: AdminQuotationVersionResponse = makeVersion({
      versionId: VERSION_2_ID,
      version: 2,
      status: 'SENT',
    });
    expect(isCustomerCurrent(header, sent)).toBe(true);
    // Both are SENT; only the pointer says which one the customer sees.
    expect(isCustomerCurrent(header, alsoSent)).toBe(false);
  });

  it('offers the send control for a DRAFT only, and marks the rest immutable', () => {
    expect(isSendable(draft)).toBe(true);
    expect(isImmutableVersion(draft)).toBe(false);
    for (const status of ['SENT', 'ACCEPTED', 'REJECTED', 'SUPERSEDED', 'EXPIRED']) {
      const version = makeVersion({ status });
      expect(isSendable(version)).toBe(false);
      expect(isImmutableVersion(version)).toBe(true);
    }
  });

  it('reads acceptance from the quotation header', () => {
    expect(isAcceptedQuotation(makeHeader({ quotationStatus: 'ACCEPTED' }))).toBe(true);
    expect(isAcceptedQuotation(makeHeader({ quotationStatus: 'SENT' }))).toBe(false);
    expect(makeHeader().quotationId).toBe(QUOTATION_ID);
  });
});
