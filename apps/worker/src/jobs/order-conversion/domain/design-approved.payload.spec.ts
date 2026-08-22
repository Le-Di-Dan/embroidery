/**
 * The `design.approved` consumer contract, unit level (`APP7-W01` §18).
 *
 * Three things are pinned here and nowhere else: the event vocabulary matches
 * the producer's own constants, a payload that cannot identify an approval is
 * rejected before any effect is possible, and the effect key is derived from
 * the approval rather than the delivery.
 */
import {
  APPROVAL_SNAPSHOT_AGGREGATE_KIND,
  DESIGN_APPROVED_EVENT_TYPE,
  DESIGN_APPROVED_PAYLOAD_VERSION,
  deriveOrderConversionEffectKey,
  parseDesignApprovedPayload,
} from './design-approved.payload';

/** Exactly what `design-decision.recorder.ts` appends. */
const PRODUCER_PAYLOAD = {
  schemaVersion: 1,
  approvalSnapshotId: 'approval-1',
  designVersionId: 'version-1',
  designCaseId: 'case-1',
  customRequestId: 'request-1',
  customerId: 'customer-1',
  version: 3,
  documentHash: `sha256:${'a'.repeat(64)}`,
  quantityTotal: 25,
  approvedAt: '2026-08-22T00:00:00.000Z',
};

describe('design.approved consumer contract', () => {
  it('names the producer’s event type, version and aggregate', () => {
    expect(DESIGN_APPROVED_EVENT_TYPE).toBe('design.approved');
    expect(DESIGN_APPROVED_PAYLOAD_VERSION).toBe(1);
    expect(APPROVAL_SNAPSHOT_AGGREGATE_KIND).toBe('APPROVAL_SNAPSHOT');
  });

  it('accepts the producer’s payload and keeps only the lookup key', () => {
    const result = parseDesignApprovedPayload(PRODUCER_PAYLOAD);

    expect(result.valid).toBe(true);
    if (!result.valid) return;
    // The whole point of §3: nothing else survives, so no commercial or design
    // fact can reach the conversion from the event instead of from a row.
    expect(result.payload).toEqual({
      approvalSnapshotId: 'approval-1',
      customRequestId: 'request-1',
    });
  });

  it.each([
    ['not an object', 'design.approved'],
    ['null', null],
    ['an array', []],
    ['a missing approval id', { customRequestId: 'request-1' }],
    ['a missing request id', { approvalSnapshotId: 'approval-1' }],
    ['a blank approval id', { approvalSnapshotId: '', customRequestId: 'request-1' }],
    ['a non-string request id', { approvalSnapshotId: 'approval-1', customRequestId: 7 }],
  ])('refuses %s as JOB_PAYLOAD_INVALID', (_label, payload) => {
    const result = parseDesignApprovedPayload(payload);

    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.errorClass).toBe('JOB_PAYLOAD_INVALID');
  });

  it('derives the effect key from the approval, not the delivery', () => {
    const lookup = { approvalSnapshotId: 'approval-1', customRequestId: 'request-1' };

    // Two outbox rows for one approval — the duplicate delivery `APP7-W01` §15
    // requires to be safe — share one effect identity.
    expect(deriveOrderConversionEffectKey(lookup)).toBe('order-conversion:v1:approval-1');
    expect(deriveOrderConversionEffectKey({ ...lookup, customRequestId: 'other' })).toBe(
      'order-conversion:v1:approval-1',
    );
  });

  it('gives different approvals different effect keys', () => {
    expect(
      deriveOrderConversionEffectKey({
        approvalSnapshotId: 'approval-2',
        customRequestId: 'request-1',
      }),
    ).not.toBe(
      deriveOrderConversionEffectKey({
        approvalSnapshotId: 'approval-1',
        customRequestId: 'request-1',
      }),
    );
  });
});
