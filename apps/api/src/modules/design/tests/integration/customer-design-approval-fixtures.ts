/**
 * The seeding and assertion helpers the three `APP6-B11` approval suites share.
 *
 * Extracted so each suite stays inside the 600-line test limit *by
 * responsibility* rather than by an arbitrary cut: one suite proves what a
 * committed approval writes, one proves what its guards refuse, and one proves
 * idempotency and rollback. All three need the same "a request with a live link,
 * a fresh step-up and a version awaiting decision" fixture and the same
 * "nothing was written" census, and three copies of either would be three places
 * for a rule to drift.
 *
 * {@link writeCountsFor} is the load-bearing one. Most of these suites' negative
 * cases assert an absence, and an absence is only meaningful if the census is
 * complete — so it counts **every** table an approval touches: the decision
 * record, the snapshot, its agreement children, the request transition, the
 * audit row, the outbox event and the completed idempotency claim. A guard that
 * refused after writing one of them would show up here and nowhere else.
 *
 * Test-only.
 */
import { sql } from 'drizzle-orm';

import { isSecureLinkError } from '../../../customer/domain/grant/secure-link.errors';
import { isDesignDecisionError } from '../../domain/review/design-decision.errors';
import { isDesignReviewTermsUnavailable } from '../../domain/review/design-review.errors';
import type { DesignVersionId } from '../../domain/repositories/design-case.repository';
import type {
  DesignDecisionTestContext,
  SeededDecisionTarget,
  SeededPlacement,
  SubmittedAgreement,
} from './customer-design-decision-context';

/** Comfortably inside the suite's published 15-minute step-up window. */
export const FRESH_STEP_UP_SECONDS = 60;

/** The stored hash every approvable fixture is sent with. */
export const SENT_DOCUMENT_HASH = `sha256:${'b'.repeat(64)}`;

/** One request, one live link, one fresh step-up, one version awaiting decision. */
export interface ApprovableFixture {
  readonly target: SeededDecisionTarget;
  readonly versionId: DesignVersionId;
  readonly documentHash: string;
  readonly agreements: SubmittedAgreement[];
}

/** The failure code of whichever refusal family an error belongs to. */
export function codeOf(error: unknown): string {
  if (isDesignDecisionError(error)) return error.failure;
  if (isSecureLinkError(error)) return error.code;
  if (isDesignReviewTermsUnavailable(error)) return 'DESIGN_REVIEW_TERMS_UNAVAILABLE';
  // Rethrown rather than stringified: an unexpected error class is a defect, and
  // folding it into a code would let a suite report it as an expected refusal.
  throw error;
}

export async function failureOf(work: () => Promise<unknown>): Promise<string> {
  try {
    await work();
  } catch (error: unknown) {
    return codeOf(error);
  }
  throw new Error('Expected the decision to fail, but it succeeded.');
}

/**
 * A request whose design is ready to be approved.
 *
 * `placement` is supplied for the Catalog branch and omitted for the
 * customer-owned one, which CST-129 requires to be one or the other.
 */
export async function seedApprovable(
  context: DesignDecisionTestContext,
  placement: SeededPlacement,
  options: { readonly customerOwned?: boolean } = {},
): Promise<ApprovableFixture> {
  const customerOwned = options.customerOwned === true;
  const target = await context.seedTarget({
    stepUpVerifiedSecondsAgo: FRESH_STEP_UP_SECONDS,
    customerOwned,
  });
  const versionId = (await context.seedVersion({
    designCaseId: target.designCaseId,
    documentHash: SENT_DOCUMENT_HASH,
    placement: customerOwned ? undefined : placement,
    customerOwnedProductId: target.customerOwnedProductId,
    makeCurrent: true,
  })) as DesignVersionId;

  return {
    target,
    versionId,
    documentHash: SENT_DOCUMENT_HASH,
    // Read through the delivered reader, so a suite's "valid body" is by
    // construction the set the approval will require.
    agreements: await context.effectiveAgreements(),
  };
}

/** The approval body for a fixture, so a negative can vary exactly one field. */
export function approvalBody(fixture: ApprovableFixture) {
  return {
    token: fixture.target.token,
    versionId: fixture.versionId,
    documentHash: fixture.documentHash,
    acceptedAgreements: fixture.agreements,
  };
}

/** Every row an approval writes, counted. `all zero` is "nothing happened". */
export interface ApprovalWriteCounts {
  readonly reviews: number;
  readonly snapshots: number;
  readonly acceptances: number;
  readonly transitions: number;
  readonly audits: number;
  readonly events: number;
  readonly completedClaims: number;
}

export async function writeCountsFor(
  context: DesignDecisionTestContext,
  target: SeededDecisionTarget,
  versionId: string,
): Promise<ApprovalWriteCounts> {
  return {
    reviews: await context.count(
      sql`select count(*)::text as count from design_reviews
           where design_version_id = ${versionId}`,
    ),
    snapshots: await context.count(
      sql`select count(*)::text as count from approval_snapshots
           where design_version_id = ${versionId}`,
    ),
    acceptances: await context.count(
      sql`select count(*)::text as count from approval_snapshot_agreement_acceptances`,
    ),
    transitions: await context.count(
      sql`select count(*)::text as count from custom_request_transitions
           where custom_request_id = ${target.requestId} and to_status = 'APPROVED'`,
    ),
    audits: await context.count(
      sql`select count(*)::text as count from audit_events
           where target_id = ${versionId} and action = 'design_version.approved'`,
    ),
    events: await context.count(
      sql`select count(*)::text as count from outbox_events
           where event_type = 'design.approved'`,
    ),
    completedClaims: await context.count(
      sql`select count(*)::text as count from idempotency_records
           where operation_namespace = 'design.approve' and scope_key = ${versionId}
             and status = 'COMPLETED'`,
    ),
  };
}

/** Claims of any status on this scope — proves a refusal left no poisoned row. */
export async function claimCountFor(
  context: DesignDecisionTestContext,
  versionId: string,
): Promise<number> {
  return context.count(
    sql`select count(*)::text as count from idempotency_records where scope_key = ${versionId}`,
  );
}

export async function versionStatusOf(
  context: DesignDecisionTestContext,
  versionId: string,
): Promise<string> {
  const [row] = await context.rows<{ readonly status: string }>(
    sql`select status from design_versions where id = ${versionId}`,
  );
  return row?.status ?? 'MISSING';
}

export async function requestStatusOf(
  context: DesignDecisionTestContext,
  requestId: string,
): Promise<string> {
  const [row] = await context.rows<{ readonly status: string }>(
    sql`select status from custom_requests where id = ${requestId}`,
  );
  return row?.status ?? 'MISSING';
}
