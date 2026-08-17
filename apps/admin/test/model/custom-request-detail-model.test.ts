/**
 * The A02 decisions that are pure, and are therefore provable without a DOM
 * (`APP5-A02` §27).
 *
 * These are the assertions where being wrong is expensive: an action offered in
 * a state that refuses it, a customer-visible reason sent on a move that forbids
 * one, a rejection silently filed as spam, or a stale conflict treated as a
 * retryable failure. `APP5-B05`'s own lifecycle matrix is not duplicated here —
 * that suite belongs to the backend and was not rerun.
 */
import {
  classifyDetailFailure,
  classifyEvidenceFailure,
  classifyModerationFailure,
  CustomRequestDetailApiError,
  preservesEnteredFields,
  requiresDetailReload,
} from '../../src/features/custom-request-detail/model/custom-request-detail-failure';
import { moderationActionsFor } from '../../src/features/custom-request-detail/model/moderation-actions';
import {
  buildAppendNoteBody,
  buildTransitionBody,
  EMPTY_MODERATION_FORM,
  validateModerationForm,
  validateStandaloneNote,
} from '../../src/features/custom-request-detail/model/moderation-command';
import {
  isViewableAsset,
  resolveSubjectBranch,
} from '../../src/features/custom-request-detail/model/request-detail-presentation';
import {
  makeAsset,
  makeCatalogDetail,
  makeCopDetail,
} from '../support/custom-request-detail-fixture';

const failureWith = (httpStatus: number) =>
  new CustomRequestDetailApiError({ code: 'X', message: 'raw server text', httpStatus });

describe('the action-presentation matrix', () => {
  it('offers exactly the two moves APP5 owns from NEW', () => {
    expect(moderationActionsFor('NEW').map((action) => action.target)).toEqual([
      'UNDER_REVIEW',
      'CANCELLED',
    ]);
  });

  it('offers exactly the three moves APP5 owns from UNDER_REVIEW', () => {
    expect(moderationActionsFor('UNDER_REVIEW').map((action) => action.target)).toEqual([
      'NEEDS_CLARIFICATION',
      'REJECTED',
      'CANCELLED',
    ]);
  });

  it('offers exactly the three moves APP5 owns from NEEDS_CLARIFICATION', () => {
    expect(moderationActionsFor('NEEDS_CLARIFICATION').map((action) => action.target)).toEqual([
      'UNDER_REVIEW',
      'REJECTED',
      'CANCELLED',
    ]);
  });

  it.each(['QUOTED', 'QUOTE_ACCEPTED', 'DIGITIZING', 'DESIGN_REVIEW', 'APPROVED'])(
    'offers no action in the APP6 state %s',
    (status) => {
      expect(moderationActionsFor(status)).toHaveLength(0);
    },
  );

  it.each(['REJECTED', 'CANCELLED'])('offers no action in the terminal state %s', (status) => {
    expect(moderationActionsFor(status)).toHaveLength(0);
  });

  it('fails closed on a status the client does not recognise', () => {
    expect(moderationActionsFor('SOMETHING_NEW')).toHaveLength(0);
    expect(moderationActionsFor(undefined)).toHaveLength(0);
  });

  it('never offers a target outside the four APP5 accepts', () => {
    const targets = new Set(
      ['NEW', 'UNDER_REVIEW', 'NEEDS_CLARIFICATION'].flatMap((status) =>
        moderationActionsFor(status).map((action) => action.target),
      ),
    );
    expect([...targets].sort()).toEqual([
      'CANCELLED',
      'NEEDS_CLARIFICATION',
      'REJECTED',
      'UNDER_REVIEW',
    ]);
  });
});

describe('the UNDER_REVIEW moves', () => {
  it('send the target and nothing else', () => {
    const body = buildTransitionBody('UNDER_REVIEW', 'direct', EMPTY_MODERATION_FORM);
    expect(body).toEqual({ toStatus: 'UNDER_REVIEW' });
  });

  it('omit the customer-visible reason even when the form somehow carries one', () => {
    // The dialog cannot produce this, but the builder is what guarantees it:
    // B05 refuses the move outright if the key is present.
    const body = buildTransitionBody('UNDER_REVIEW', 'direct', {
      ...EMPTY_MODERATION_FORM,
      customerVisibleReason: 'leftover text',
      internalReason: 'leftover internal',
    });
    expect('customerVisibleReason' in body).toBe(false);
    expect('internalReason' in body).toBe(false);
  });

  it('require nothing of the operator', () => {
    expect(validateModerationForm('direct', EMPTY_MODERATION_FORM)).toEqual({});
  });
});

describe('the clarification command', () => {
  const values = {
    ...EMPTY_MODERATION_FORM,
    internalReason: 'Ảnh mờ, không đọc được chữ.',
    customerVisibleReason: 'Nhờ chị gửi lại ảnh rõ hơn ạ.',
    note: 'Đã nhắn khách gửi lại ảnh.',
  };

  it('requires both reasons and a note', () => {
    const errors = validateModerationForm('clarify', EMPTY_MODERATION_FORM);
    expect(errors.internalReason).toBeDefined();
    expect(errors.customerVisibleReason).toBeDefined();
    expect(errors.note).toBeDefined();
  });

  it('pins the note kind to CLARIFY and keeps the two reasons apart', () => {
    const body = buildTransitionBody('NEEDS_CLARIFICATION', 'clarify', values);
    expect(body).toEqual({
      toStatus: 'NEEDS_CLARIFICATION',
      internalReason: 'Ảnh mờ, không đọc được chữ.',
      customerVisibleReason: 'Nhờ chị gửi lại ảnh rõ hơn ạ.',
      moderationNote: 'Đã nhắn khách gửi lại ảnh.',
      moderationNoteKind: 'CLARIFY',
    });
    expect(body.internalReason).not.toBe(body.customerVisibleReason);
  });

  it('treats whitespace as absent rather than as a reason', () => {
    const errors = validateModerationForm('clarify', {
      ...values,
      customerVisibleReason: '   \n  ',
    });
    expect(errors.customerVisibleReason).toBeDefined();
  });
});

describe('the rejection command', () => {
  const values = {
    ...EMPTY_MODERATION_FORM,
    internalReason: 'Yêu cầu không khả thi.',
    customerVisibleReason: 'Xin lỗi chị, xưởng không nhận mẫu này.',
    note: 'Từ chối vì kỹ thuật.',
  };

  it('requires both reasons and a note', () => {
    const errors = validateModerationForm('reject', EMPTY_MODERATION_FORM);
    expect(errors.internalReason).toBeDefined();
    expect(errors.customerVisibleReason).toBeDefined();
    expect(errors.note).toBeDefined();
  });

  it('defaults to REJECT and never to SPAM', () => {
    expect(EMPTY_MODERATION_FORM.rejectNoteKind).toBe('REJECT');
    const body = buildTransitionBody('REJECTED', 'reject', values);
    expect(body.moderationNoteKind).toBe('REJECT');
  });

  it('files SPAM only when the operator chose it explicitly', () => {
    const body = buildTransitionBody('REJECTED', 'reject', {
      ...values,
      rejectNoteKind: 'SPAM',
    });
    expect(body.moderationNoteKind).toBe('SPAM');
  });
});

describe('the cancellation command', () => {
  const values = {
    ...EMPTY_MODERATION_FORM,
    internalReason: 'Khách gọi điện xin huỷ.',
    customerVisibleReason: 'Đã huỷ theo yêu cầu của chị.',
  };

  it('requires both reasons but not a note', () => {
    const errors = validateModerationForm('cancel', values);
    expect(errors).toEqual({});
  });

  it('still requires the two reasons', () => {
    const errors = validateModerationForm('cancel', EMPTY_MODERATION_FORM);
    expect(errors.internalReason).toBeDefined();
    expect(errors.customerVisibleReason).toBeDefined();
    expect(errors.note).toBeUndefined();
  });

  it('sends no note keys at all when the operator wrote none', () => {
    const body = buildTransitionBody('CANCELLED', 'cancel', values);
    expect(body).toEqual({
      toStatus: 'CANCELLED',
      internalReason: 'Khách gọi điện xin huỷ.',
      customerVisibleReason: 'Đã huỷ theo yêu cầu của chị.',
    });
    expect('moderationNote' in body).toBe(false);
    expect('moderationNoteKind' in body).toBe(false);
  });

  it('sends a kind alongside an optional note, never a bare note', () => {
    const body = buildTransitionBody('CANCELLED', 'cancel', { ...values, note: 'Khách đổi ý.' });
    expect(body.moderationNote).toBe('Khách đổi ý.');
    expect(body.moderationNoteKind).toBe('NOTE');
  });
});

describe('every transition body', () => {
  const cases = [
    buildTransitionBody('UNDER_REVIEW', 'direct', EMPTY_MODERATION_FORM),
    buildTransitionBody('NEEDS_CLARIFICATION', 'clarify', {
      ...EMPTY_MODERATION_FORM,
      internalReason: 'a',
      customerVisibleReason: 'b',
      note: 'c',
    }),
    buildTransitionBody('CANCELLED', 'cancel', {
      ...EMPTY_MODERATION_FORM,
      internalReason: 'a',
      customerVisibleReason: 'b',
    }),
  ];

  it.each([
    'fromStatus',
    'expectedFrom',
    'adminId',
    'customerId',
    'actorKind',
    'correlationId',
    'sequence',
    'timestamp',
  ])('never carries the server-owned field %s', (field) => {
    for (const body of cases) {
      expect(field in body).toBe(false);
    }
  });
});

describe('the standalone note', () => {
  it('is filed as NOTE, never as a moderation verdict', () => {
    expect(buildAppendNoteBody('Khách hay gọi buổi tối.')).toEqual({
      kind: 'NOTE',
      note: 'Khách hay gọi buổi tối.',
    });
  });

  it('carries no client id, author or timestamp', () => {
    const body = buildAppendNoteBody('x');
    expect(Object.keys(body).sort()).toEqual(['kind', 'note']);
  });

  it('refuses an empty note', () => {
    expect(validateStandaloneNote('   ')).toBeDefined();
    expect(validateStandaloneNote('có nội dung')).toBeUndefined();
  });
});

describe('safe error mapping', () => {
  it('reports a missing and a forbidden request identically', () => {
    expect(classifyDetailFailure(failureWith(404))).toBe('missing');
    expect(classifyDetailFailure(failureWith(403))).toBe('missing');
  });

  it('separates an expired session from a transient failure', () => {
    expect(classifyDetailFailure(failureWith(401))).toBe('unauthenticated');
    expect(classifyDetailFailure(failureWith(503))).toBe('retryable');
    expect(classifyDetailFailure(new Error('boom'))).toBe('retryable');
  });

  it('collapses every evidence refusal into one unavailable outcome', () => {
    expect(classifyEvidenceFailure(failureWith(404))).toBe('unavailable');
    expect(classifyEvidenceFailure(failureWith(403))).toBe('unavailable');
    expect(classifyEvidenceFailure(failureWith(400))).toBe('unavailable');
    expect(classifyEvidenceFailure(failureWith(503))).toBe('retryable');
  });

  it('treats both B05 conflicts as stale, and neither as retryable', () => {
    // REQUEST_TRANSITION_STALE and INVALID_TRANSITION are both 409: the request
    // is not in the state the operator decided against, and the next step is the
    // same in either case.
    expect(classifyModerationFailure(failureWith(409))).toBe('stale');
    expect(requiresDetailReload('stale')).toBe(true);
    expect(preservesEnteredFields('stale')).toBe(false);
  });

  it('keeps the typed text on a recoverable failure', () => {
    expect(classifyModerationFailure(failureWith(503))).toBe('retryable');
    expect(preservesEnteredFields('retryable')).toBe(true);
    expect(preservesEnteredFields('invalid')).toBe(true);
  });
});

describe('subject discrimination', () => {
  it('reads the Catalog branch from the discriminator', () => {
    expect(resolveSubjectBranch(makeCatalogDetail()).kind).toBe('CATALOG');
  });

  it('reads the customer-owned branch from the discriminator', () => {
    expect(resolveSubjectBranch(makeCopDetail()).kind).toBe('CUSTOMER_OWNED');
  });

  it('still reads CATALOG when every optional catalog label is gone', () => {
    // The exact request the missing-label copy exists for: a field-sniffing
    // reader would call this customer-owned and render the wrong panel.
    const stripped = makeCatalogDetail({
      subject: { kind: 'CATALOG', productId: '01940000-0000-7000-8000-0000000000p1' },
    });
    expect(resolveSubjectBranch(stripped).kind).toBe('CATALOG');
  });

  it('reports an absent subject rather than guessing a branch', () => {
    // Omitted, not `undefined`: `APP5-B04` drops the key when the subject row
    // is gone, and `exactOptionalPropertyTypes` makes the two genuinely
    // different shapes.
    expect(resolveSubjectBranch({}).kind).toBe('UNKNOWN');
  });
});

describe('which assets may be opened', () => {
  it('opens the two evidence roles', () => {
    expect(isViewableAsset(makeAsset({ role: 'COP_IMAGE' }))).toBe(true);
    expect(isViewableAsset(makeAsset({ role: 'REFERENCE' }))).toBe(true);
  });

  it('never requests an ATTACHMENT or an unrecognised role', () => {
    expect(isViewableAsset(makeAsset({ role: 'ATTACHMENT' }))).toBe(false);
    expect(isViewableAsset(makeAsset({ role: 'SOMETHING' }))).toBe(false);
  });

  it('never requests a tombstoned file whose association is still listed', () => {
    expect(isViewableAsset(makeAsset({ mimeType: undefined }))).toBe(false);
  });
});
