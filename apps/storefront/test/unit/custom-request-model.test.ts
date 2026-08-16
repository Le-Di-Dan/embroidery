/**
 * The `APP5-S01` decision layer, asserted directly.
 *
 * These are the rules a component could only demonstrate indirectly — that no
 * default variant exists, that a quantity line has nowhere to put a variant,
 * that `bindable` and not `ACCEPTED` decides submission, and that a COP payload
 * has no catalog fields. Testing them here means a later refactor of the markup
 * cannot quietly move any of them.
 */
import { CustomRequestAssetStatusResponseState } from '@embroidery/api-client';

import { resolveCatalogEntry } from '../../src/features/custom-request/model/catalog-entry-context';
import {
  customRequestFlowReducer,
  initialFlowState,
} from '../../src/features/custom-request/model/custom-request-flow';
import { customerOwnedIssues } from '../../src/features/custom-request/model/customer-owned-draft';
import {
  breakdownReady,
  parseQuantity,
  toQuantityLines,
} from '../../src/features/custom-request/model/quantity-breakdown';
import {
  applyStatus,
  bindableSlots,
  roleCapReached,
  toAssetBindings,
  type AssetSlot,
} from '../../src/features/custom-request/model/request-asset-slot';
import {
  attachmentsReady,
  subjectReady,
  submissionReady,
} from '../../src/features/custom-request/model/step-readiness';
import {
  buildCatalogSubmission,
  buildCustomerOwnedSubmission,
} from '../../src/features/custom-request/model/submission-payload';
import { submissionOutcomeOf } from '../../src/features/custom-request/model/submission-outcome';
import {
  selectionStillEligible,
  variantLabel,
} from '../../src/features/custom-request/model/variant-option';
import {
  makeVariant,
  PRODUCT_ID,
  PRODUCT_SLUG,
  VARIANT_BLUE,
  VARIANT_RED,
} from '../support/custom-request-fixture';

const CHALLENGE = 'challenge-verified-0001';
const SESSION = 'session-0001';

function slot(overrides: Partial<AssetSlot> = {}): AssetSlot {
  return {
    key: 'slot-0',
    role: 'COP_IMAGE',
    fileName: 'a.png',
    phase: 'TRACKING',
    assetId: 'asset-0',
    state: CustomRequestAssetStatusResponseState.ACCEPTED,
    bindable: true,
    failure: undefined,
    ...overrides,
  };
}

describe('subject XOR', () => {
  it('starts with neither branch chosen, so neither is a default', () => {
    expect(initialFlowState.subject).toBeUndefined();
    expect(
      subjectReady({ state: initialFlowState, designSessionId: SESSION, variantsSelectable: true }),
    ).toBe(false);
  });

  it('switching branch clears the other branch, so both can never hold data', () => {
    let state = customRequestFlowReducer(initialFlowState, {
      type: 'SUBJECT_CHOSEN',
      subject: 'CATALOG',
    });
    state = customRequestFlowReducer(state, {
      type: 'VARIANT_SELECTED',
      productVariantId: VARIANT_RED,
    });
    state = customRequestFlowReducer(state, {
      type: 'CUSTOMER_OWNED_CHANGED',
      field: 'name',
      value: 'Áo khoác',
    });

    const switched = customRequestFlowReducer(state, {
      type: 'SUBJECT_CHOSEN',
      subject: 'CUSTOMER_OWNED',
    });

    expect(switched.subject).toBe('CUSTOMER_OWNED');
    expect(switched.selectedVariantId).toBeUndefined();
    expect(switched.customerOwned.name).toBe('');
  });
});

describe('variant selection', () => {
  it('never composes an invented name and falls back only when both labels are null', () => {
    expect(variantLabel(makeVariant(VARIANT_RED, 'Đỏ', 'M'))).toBe('Đỏ · M');
    expect(variantLabel(makeVariant(VARIANT_RED, 'Đỏ', null))).toBe('Đỏ');
    expect(variantLabel(makeVariant(VARIANT_RED, null, 'M'))).toBe('M');
    expect(variantLabel(makeVariant(VARIANT_RED, null, null))).not.toContain(VARIANT_RED);
  });

  it('reports no selection as ineligible rather than selecting the first row', () => {
    const variants = [makeVariant(VARIANT_RED, 'Đỏ', 'M'), makeVariant(VARIANT_BLUE, 'Xanh', 'L')];
    expect(selectionStillEligible(variants, undefined)).toBe(false);
    expect(selectionStillEligible(variants, VARIANT_BLUE)).toBe(true);
    expect(selectionStillEligible(variants, 'variant-withdrawn')).toBe(false);
  });

  it('withdrawing a selection keeps every other answer the customer gave', () => {
    let state = customRequestFlowReducer(initialFlowState, {
      type: 'SUBJECT_CHOSEN',
      subject: 'CATALOG',
    });
    state = customRequestFlowReducer(state, {
      type: 'VARIANT_SELECTED',
      productVariantId: VARIANT_RED,
    });
    state = customRequestFlowReducer(state, {
      type: 'QUANTITY_CHANGED',
      key: state.quantityLines[0]!.key,
      field: 'quantity',
      value: '7',
    });
    state = customRequestFlowReducer(state, { type: 'VERIFIED', challengeId: CHALLENGE });

    const withdrawn = customRequestFlowReducer(state, { type: 'VARIANT_WITHDRAWN' });

    expect(withdrawn.selectedVariantId).toBeUndefined();
    expect(withdrawn.variantWithdrawn).toBe(true);
    expect(withdrawn.quantityLines[0]?.quantity).toBe('7');
    expect(withdrawn.verifiedChallengeId).toBe(CHALLENGE);
  });
});

describe('quantity breakdown', () => {
  it('accepts only positive integers within the published bound', () => {
    expect(parseQuantity('3')).toBe(3);
    expect(parseQuantity(' 3 ')).toBe(3);
    expect(parseQuantity('')).toBeUndefined();
    expect(parseQuantity('0')).toBeUndefined();
    expect(parseQuantity('1.5')).toBeUndefined();
    expect(parseQuantity('1e3')).toBeUndefined();
    expect(parseQuantity('100001')).toBeUndefined();
  });

  it('emits lines carrying a size and a count and no variant field at all', () => {
    const lines = toQuantityLines([
      { key: 'l0', sizeLabel: 'M', quantity: '2' },
      { key: 'l1', sizeLabel: '', quantity: '3' },
      { key: 'l2', sizeLabel: '', quantity: '' },
    ]);

    expect(lines).toEqual([{ quantity: 2, sizeLabel: 'M' }, { quantity: 3 }]);
    for (const line of lines) {
      expect(Object.keys(line)).not.toContain('productVariantId');
    }
  });

  it('requires a line on the catalog branch and permits none on the COP branch', () => {
    const blank = [{ key: 'l0', sizeLabel: '', quantity: '' }];
    expect(breakdownReady(blank, true)).toBe(false);
    expect(breakdownReady(blank, false)).toBe(true);
  });
});

describe('catalog readiness', () => {
  const chosen = (() => {
    let state = customRequestFlowReducer(initialFlowState, {
      type: 'SUBJECT_CHOSEN',
      subject: 'CATALOG',
    });
    state = customRequestFlowReducer(state, {
      type: 'VARIANT_SELECTED',
      productVariantId: VARIANT_BLUE,
    });
    return customRequestFlowReducer(state, {
      type: 'QUANTITY_CHANGED',
      key: state.quantityLines[0]!.key,
      field: 'quantity',
      value: '2',
    });
  })();

  it('is ready only with a session, a selectable product and an explicit variant', () => {
    expect(
      subjectReady({ state: chosen, designSessionId: SESSION, variantsSelectable: true }),
    ).toBe(true);
    // Each gate removed on its own.
    expect(
      subjectReady({ state: chosen, designSessionId: undefined, variantsSelectable: true }),
    ).toBe(false);
    expect(
      subjectReady({ state: chosen, designSessionId: SESSION, variantsSelectable: false }),
    ).toBe(false);
    expect(
      subjectReady({
        state: { ...chosen, selectedVariantId: undefined },
        designSessionId: SESSION,
        variantsSelectable: true,
      }),
    ).toBe(false);
  });

  it('refuses to submit without a retained verified challenge', () => {
    const input = { state: chosen, designSessionId: SESSION, variantsSelectable: true };
    expect(submissionReady(input, [])).toBe(false);
    expect(
      submissionReady({ ...input, state: { ...chosen, verifiedChallengeId: CHALLENGE } }, []),
    ).toBe(true);
  });
});

describe('upload eligibility is `bindable`, not a state comparison', () => {
  it('copies the server flag verbatim rather than deriving it', () => {
    const tracked = applyStatus(slot({ bindable: false, state: undefined }), {
      assetId: 'asset-0',
      // ACCEPTED but explicitly not bindable: the flag wins, which is the whole
      // point of not re-deriving `APP5-B01`'s binding rules in the browser.
      state: CustomRequestAssetStatusResponseState.ACCEPTED,
      bindable: false,
    });

    expect(tracked.state).toBe(CustomRequestAssetStatusResponseState.ACCEPTED);
    expect(bindableSlots([tracked])).toHaveLength(0);
  });

  it('blocks a COP submission until an accepted item photo is bindable', () => {
    const state = { ...initialFlowState, subject: 'CUSTOMER_OWNED' as const };
    expect(attachmentsReady(state, [slot({ bindable: false })])).toBe(false);
    expect(attachmentsReady(state, [slot({ bindable: true })])).toBe(true);
  });

  it('blocks submission while any upload is still being inspected', () => {
    const state = { ...initialFlowState, subject: 'CUSTOMER_OWNED' as const };
    const pending = slot({
      key: 'slot-1',
      state: CustomRequestAssetStatusResponseState.INSPECTING,
      bindable: false,
    });
    expect(attachmentsReady(state, [slot(), pending])).toBe(false);
  });

  it('caps a role at ten live slots', () => {
    const slots = Array.from({ length: 10 }, (_, index) => slot({ key: `slot-${index}` }));
    expect(roleCapReached(slots, 'COP_IMAGE')).toBe(true);
    expect(roleCapReached(slots, 'REFERENCE')).toBe(false);
  });
});

describe('submission payloads', () => {
  const shared = {
    challengeId: CHALLENGE,
    breakdown: [{ quantity: 2, sizeLabel: 'M' }],
    assets: toAssetBindings([slot()]),
    customerNote: '  ',
  };

  it('carries the real selected variant on the catalog branch', () => {
    const body = buildCatalogSubmission({
      ...shared,
      productId: PRODUCT_ID,
      productVariantId: VARIANT_BLUE,
      designSessionId: SESSION,
    });

    expect(body.catalog).toEqual({
      productId: PRODUCT_ID,
      productVariantId: VARIANT_BLUE,
      designSessionId: SESSION,
    });
    expect(body.challengeId).toBe(CHALLENGE);
    // Server-owned facts are absent because there is no field for them.
    expect(body).not.toHaveProperty('customerId');
    expect(body).not.toHaveProperty('submittedSessionId');
    expect(body).not.toHaveProperty('idempotencyKey');
    // A whitespace-only note is omitted, not sent as an empty string.
    expect(body).not.toHaveProperty('customerNote');
  });

  it('carries no catalog or session field on the customer-owned branch', () => {
    const body = buildCustomerOwnedSubmission({
      ...shared,
      draft: { name: ' Áo khoác ', description: '', widthMm: '120.5', heightMm: '' },
    });

    expect(body).not.toHaveProperty('catalog');
    expect(JSON.stringify(body)).not.toContain('productVariantId');
    expect(JSON.stringify(body)).not.toContain('designSessionId');
    expect(body.customerOwnedProduct).toEqual({ name: 'Áo khoác', physicalWidthMm: '120.5' });
  });
});

describe('customer-owned validation', () => {
  it('requires a name and rejects a dimension the contract would refuse', () => {
    const issues = customerOwnedIssues({
      name: '   ',
      description: '',
      widthMm: '12.345',
      heightMm: '',
    });
    expect(issues.get('name')).toBe('NAME_REQUIRED');
    expect(issues.get('widthMm')).toBe('DIMENSION_INVALID');
  });
});

describe('submission outcomes are mapped by code, never by message', () => {
  it.each([
    ['IDEMPOTENCY_CONFLICT', 'CONFLICT'],
    ['DUPLICATE_OPERATION', 'IN_PROGRESS'],
    ['CUSTOMER_NOT_VERIFIED', 'NOT_VERIFIED'],
    ['SESSION_EXPIRED', 'SESSION_UNUSABLE'],
    ['SESSION_NOT_AUTHORIZED', 'SESSION_UNUSABLE'],
    ['REQUEST_ASSET_NOT_BINDABLE', 'ASSET_NOT_BINDABLE'],
  ])('%s maps to %s', (code, expected) => {
    expect(submissionOutcomeOf({ code, message: 'anything at all', httpStatus: 422 })).toBe(
      expected,
    );
  });

  it('treats a request that never got a verdict as uncertain, not as failed', () => {
    expect(submissionOutcomeOf({ code: 'NETWORK_ERROR', message: '' })).toBe('UNCERTAIN');
    expect(submissionOutcomeOf({ code: 'MALFORMED_RESPONSE', message: '', httpStatus: 503 })).toBe(
      'UNCERTAIN',
    );
    // A 4xx whose body did not parse is still a verdict.
    expect(submissionOutcomeOf({ code: 'MALFORMED_RESPONSE', message: '', httpStatus: 422 })).toBe(
      'FAILED',
    );
  });
});

describe('catalog entry context', () => {
  afterEach(() => {
    globalThis.localStorage.clear();
  });

  it('is absent unless all three placement codes are present', () => {
    expect(resolveCatalogEntry(new URLSearchParams('')).kind).toBe('ABSENT');
    expect(resolveCatalogEntry(new URLSearchParams(`san-pham=${PRODUCT_SLUG}`)).kind).toBe(
      'ABSENT',
    );
  });

  it('separates "no design session" from "no placement"', () => {
    const query = `san-pham=${PRODUCT_SLUG}&mat=truoc&vung=nguc`;
    expect(resolveCatalogEntry(new URLSearchParams(query)).kind).toBe('SESSION_MISSING');

    globalThis.localStorage.setItem(
      `embroidery.studio.session:${PRODUCT_SLUG}:truoc:nguc`,
      '018f4a1b-2c3d-7e4f-8a9b-0c1d2e3f4a5b',
    );
    const resolved = resolveCatalogEntry(new URLSearchParams(query));
    expect(resolved.kind).toBe('READY');
  });
});
