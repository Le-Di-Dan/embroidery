/**
 * The one normalization context that is *not yet* an answer (`APP3-W01C`,
 * `IMP-D048` PO-08).
 *
 * Every other way a context can fail is a verdict: a retired Product Side, a
 * re-pointed association, a rejected Asset. Those are recorded once and the job
 * completes. A Design Session upload is different in one respect only — its
 * association and its inspection request are committed in the *same*
 * transaction, so the two become visible together and a normalization attempt
 * can genuinely arrive before inspection has finished. The Asset is not
 * ineligible; it has not been judged yet.
 *
 * Treating that as a verdict is what `APP3-G08` measured and refused: the
 * terminal `NORMALIZATION_CONTEXT_NO_LONGER_ELIGIBLE` would strand every session
 * upload that lost the race, with no derivative, no retry and nothing surfaced
 * to anyone. So it is raised as a *failed attempt* instead, which is the one
 * thing the existing runtime already knows how to do properly.
 *
 * `JOB_TRANSIENT_FAILURE` is deliberate and is not a new mechanism:
 * `dispositionOf` retries it under the existing backoff and lease policy and
 * turns it terminal at the attempt cap, so a session whose inspection never
 * completes dead-letters for an operator rather than looping forever. No
 * scheduler, no sweep, no second event and no sleeping inside an attempt.
 *
 * This is raised **before** the derivative claim is taken, so a retrying attempt
 * leaves no `PROCESSING` row behind to block the next one.
 */
import { WorkerJobError } from '../../../runtime/errors/worker-job-error';

/**
 * The Asset states a Session upload may still be travelling through when its
 * normalization request is claimed.
 *
 * Only `INSPECTING`. `UPLOADED` is deliberately absent: the producer appends the
 * normalization event in the same transaction that moves the Asset out of
 * `UPLOADED`, so a committed request can never observe it — and admitting a
 * state that cannot occur would turn a real defect into a silent retry loop.
 */
export const SESSION_TRANSIENT_ASSET_STATUSES: readonly string[] = Object.freeze(['INSPECTING']);

export function isSessionInspectionPending(status: string): boolean {
  return SESSION_TRANSIENT_ASSET_STATUSES.includes(status);
}

/**
 * A retryable attempt failure. Fixed text: no asset, session, association or
 * storage identity appears, because only `errorClass` is ever persisted and the
 * message is read live by an operator.
 */
export function inspectionPendingFailure(): WorkerJobError {
  return new WorkerJobError(
    'JOB_TRANSIENT_FAILURE',
    'Asset inspection has not completed yet; normalization will be retried.',
  );
}
