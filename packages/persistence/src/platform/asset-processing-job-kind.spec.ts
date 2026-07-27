/**
 * APP2-DB01 — the job kind APP2-W01's asset-inspection handler will file its
 * attempt evidence under.
 *
 * The W01 audit raised the question: the runtime's existing suites all use
 * `OUTBOX_DISPATCH`, which names the *transport*, while `ASSET_PROCESSING` is
 * the canonical domain kind for this work. The ruling picked the domain kind,
 * which is only safe if the I02 seam really does carry a handler-provided kind
 * rather than assuming the transport one — otherwise the handler would declare
 * a kind the claim path could not write, and the defect would appear as a
 * failed expired-lease reclaim in production, not here.
 *
 * These are static assertions about the seam, not a re-test of the runtime:
 * they pin the value's existence and its acceptance by the guard every write
 * path goes through. The live claim/reclaim behaviour is already covered by the
 * I02 integration suites.
 */
import { BACKGROUND_JOB_KINDS, assertKnownJobKind } from './background-job-attempt-store';
import type { BackgroundJobKind } from './background-job-attempt-store';
import type { RegisteredJobType } from './worker-job-queue.types';

const ASSET_INSPECTION_EVENT_TYPE = 'asset.inspection.requested';

describe('APP2-W01 job-kind handoff', () => {
  it('offers ASSET_PROCESSING as a canonical background job kind', () => {
    expect(BACKGROUND_JOB_KINDS).toContain('ASSET_PROCESSING');
  });

  it('accepts it at the guard every attempt write passes through', () => {
    expect(() => assertKnownJobKind('ASSET_PROCESSING')).not.toThrow();
  });

  it('types a registered handler pair for the asset inspection event', () => {
    // Compile-time proof that the registry's pair accepts the domain kind: if
    // `BackgroundJobKind` did not include it, this file would not type-check.
    const registered: RegisteredJobType = {
      eventType: ASSET_INSPECTION_EVENT_TYPE,
      jobKind: 'ASSET_PROCESSING',
    };
    expect(registered.jobKind satisfies BackgroundJobKind).toBe('ASSET_PROCESSING');
  });

  it('still recognises the transport kind the I02 runtime suites use', () => {
    // OUTBOX_DISPATCH is not removed or repurposed — W01 simply stops being
    // filed under it.
    expect(() => assertKnownJobKind('OUTBOX_DISPATCH')).not.toThrow();
  });

  it('rejects an unknown kind', () => {
    expect(() => assertKnownJobKind('ASSET_INSPECTION')).toThrow();
  });
});
