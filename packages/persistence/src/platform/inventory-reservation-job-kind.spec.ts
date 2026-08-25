/**
 * `APP8-W01` — the job kind the `payment.verified` reservation handler files its
 * attempt evidence under.
 *
 * The same question `APP2-DB01` and `APP7-W01` answered, with the same answer:
 * the **domain** kind, not the transport kind. `OUTBOX_DISPATCH` names how the
 * work arrived; `INVENTORY_RESERVATION` names what it does, and `TR-LC17-04`
 * expects an operator to find a failed reservation — *"admin alerted"* — in
 * `background_job_attempts`. Filing it under the transport kind would hide it in
 * the same bucket as every other dispatched job.
 *
 * `job_kind` is `text` with **no CHECK** (TBL-075), so this list is the G-DB7-51
 * write-time guard and adding a value is a source change, not a schema change.
 * No migration accompanies it (`APP8-W01` §18).
 *
 * These are static assertions about the seam, not a re-test of the runtime: they
 * pin the value's existence and its acceptance by the guard every write path
 * goes through. The live claim, retry and dead-letter behaviour is covered by
 * `inventory-reservation.integration.spec.ts`.
 */
import { BACKGROUND_JOB_KINDS, assertKnownJobKind } from './background-job-attempt-store';
import type { BackgroundJobKind } from './background-job-attempt-store';
import type { RegisteredJobType } from './worker-job-queue.types';

const PAYMENT_VERIFIED_EVENT_TYPE = 'payment.verified';

describe('APP8-W01 job-kind handoff', () => {
  it('offers INVENTORY_RESERVATION as a canonical background job kind', () => {
    expect(BACKGROUND_JOB_KINDS).toContain('INVENTORY_RESERVATION');
  });

  it('accepts it at the guard every attempt write passes through', () => {
    expect(() => assertKnownJobKind('INVENTORY_RESERVATION')).not.toThrow();
  });

  it('types a registered handler pair for the payment verification event', () => {
    // Compile-time proof that the registry's pair accepts the domain kind: if
    // `BackgroundJobKind` did not include it, this file would not type-check.
    const registered: RegisteredJobType = {
      eventType: PAYMENT_VERIFIED_EVENT_TYPE,
      jobKind: 'INVENTORY_RESERVATION',
    };
    expect(registered.jobKind satisfies BackgroundJobKind).toBe('INVENTORY_RESERVATION');
  });

  it('rejects a plausible near-miss', () => {
    expect(() => assertKnownJobKind('INVENTORY_RESERVE')).toThrow();
  });
});
