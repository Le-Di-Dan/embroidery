/**
 * `APP7-W01` — the job kind the `design.approved` order-conversion handler files
 * its attempt evidence under.
 *
 * The same question `APP2-DB01` answered for asset processing, with the same
 * answer: the **domain** kind, not the transport kind. `OUTBOX_DISPATCH` names
 * how the work arrived; `ORDER_CREATION` names what it does, and an operator
 * looking for failed order conversions in `background_job_attempts` searches for
 * the latter. Filing domain work under the transport kind would hide it in the
 * same bucket as every other dispatched job.
 *
 * `job_kind` is `text` with **no CHECK** (TBL-075), so this list is the G-DB7-51
 * write-time guard and adding a value is a source change, not a schema change —
 * exactly the terms `OUTBOX_AGGREGATE_KINDS` gained `PRODUCT` and
 * `NOTIFICATION_INTENT` on. No migration accompanies it.
 *
 * These are static assertions about the seam, not a re-test of the runtime: they
 * pin the value's existence and its acceptance by the guard every write path
 * goes through. The live claim/reclaim behaviour is already covered by the I02
 * integration suites.
 */
import { BACKGROUND_JOB_KINDS, assertKnownJobKind } from './background-job-attempt-store';
import type { BackgroundJobKind } from './background-job-attempt-store';
import type { RegisteredJobType } from './worker-job-queue.types';

const DESIGN_APPROVED_EVENT_TYPE = 'design.approved';

describe('APP7-W01 job-kind handoff', () => {
  it('offers ORDER_CREATION as a canonical background job kind', () => {
    expect(BACKGROUND_JOB_KINDS).toContain('ORDER_CREATION');
  });

  it('accepts it at the guard every attempt write passes through', () => {
    expect(() => assertKnownJobKind('ORDER_CREATION')).not.toThrow();
  });

  it('types a registered handler pair for the design approval event', () => {
    // Compile-time proof that the registry's pair accepts the domain kind: if
    // `BackgroundJobKind` did not include it, this file would not type-check.
    const registered: RegisteredJobType = {
      eventType: DESIGN_APPROVED_EVENT_TYPE,
      jobKind: 'ORDER_CREATION',
    };
    expect(registered.jobKind satisfies BackgroundJobKind).toBe('ORDER_CREATION');
  });

  it('adds the kind without disturbing the delivered ones', () => {
    // The list is read by operators' queries; a value that moved or vanished
    // would silently empty one of those.
    expect(BACKGROUND_JOB_KINDS).toEqual([
      'OUTBOX_DISPATCH',
      'NOTIFICATION_DELIVERY',
      'ASSET_PROCESSING',
      'MOCKUP_RENDERING',
      'WATERMARK_RENDERING',
      'SESSION_CLEANUP',
      'PAYMENT_RECONCILIATION',
      'RETENTION_SWEEP',
      'ORDER_CREATION',
    ]);
  });

  it('rejects an unknown kind', () => {
    expect(() => assertKnownJobKind('ORDER_CONVERSION')).toThrow();
  });
});
