/**
 * `APP6-B11` — `design.approve` replay and atomic rollback, against a real
 * PostgreSQL instance.
 *
 * Two properties, and both are about what *does not* happen twice:
 *
 * - a duplicate approval returns the committed Approval Snapshot and writes
 *   nothing — not a second review, snapshot, acceptance, transition, audit row,
 *   event or rewritten timestamp;
 * - a failure anywhere in the transaction leaves the whole approval undone, and
 *   a legitimate retry afterwards is a **first** attempt rather than a replay of
 *   a half-approval.
 */
import { sql } from 'drizzle-orm';

import {
  canonicalApproveTerms,
  approveFingerprint,
} from '../../domain/review/design-approve-idempotency';
import { createDesignDecisionContext } from './customer-design-decision-context';
import type {
  DesignDecisionTestContext,
  SeededPlacement,
} from './customer-design-decision-context';
import {
  approvalBody,
  claimCountFor,
  failureOf,
  requestStatusOf,
  seedApprovable,
  versionStatusOf,
  writeCountsFor,
} from './customer-design-approval-fixtures';

describe('APP6-B11 design approval — replay and rollback (integration)', () => {
  let context: DesignDecisionTestContext;
  let placement: SeededPlacement;

  beforeAll(async () => {
    context = await createDesignDecisionContext('app6-b11-approve-idempotency');
  }, 240_000);

  afterAll(async () => {
    await context?.close();
  });

  beforeEach(async () => {
    await context.reset();
    await context.publishPolicies();
    await context.publishAgreementContent();
    placement = await context.seedPlacement();
  });

  describe('the fingerprint', () => {
    it('treats the accepted agreements as a set, not as an array', () => {
      const a = { agreementVersionId: 'v-a', contentHash: 'sha256:aa' };
      const b = { agreementVersionId: 'v-b', contentHash: 'sha256:bb' };

      // Order is a rendering decision on the client. Two submissions binding the
      // identical evidence must replay, never conflict.
      expect(canonicalApproveTerms([a, b])).toBe(canonicalApproveTerms([b, a]));
      expect(
        approveFingerprint({
          versionId: 'v1',
          documentHash: 'sha256:doc',
          acceptedAgreements: [a, b],
        }),
      ).toBe(
        approveFingerprint({
          versionId: 'v1',
          documentHash: 'sha256:doc',
          acceptedAgreements: [b, a],
        }),
      );
    });

    it('distinguishes the same agreement id under a different content hash', () => {
      // A superseding version reusing an id would otherwise share a fingerprint
      // with the terms it replaced, and a replay would confirm an approval
      // against text the customer never read.
      expect(
        canonicalApproveTerms([{ agreementVersionId: 'v-a', contentHash: 'sha256:aa' }]),
      ).not.toBe(canonicalApproveTerms([{ agreementVersionId: 'v-a', contentHash: 'sha256:bb' }]));
    });
  });

  describe('duplicate approval', () => {
    it('replays the committed snapshot with zero new writes', async () => {
      const fixture = await seedApprovable(context, placement);
      const body = approvalBody(fixture);

      const first = await context.asRequest(() => context.approval.approve(body));
      const before = await writeCountsFor(context, fixture.target, fixture.versionId);
      const second = await context.asRequest(() => context.approval.approve(body));

      expect(first.replayed).toBe(false);
      expect(second.replayed).toBe(true);
      expect(second.approvalSnapshotId).toBe(first.approvalSnapshotId);
      expect(second.versionStatus).toBe('APPROVED');
      expect(second.requestStatus).toBe('APPROVED');
      // The committed instant, not the instant of the retry: a rewritten
      // timestamp would be a second approval wearing the first one's id.
      expect(second.approvedAt.toISOString()).toBe(first.approvedAt.toISOString());
      expect(await writeCountsFor(context, fixture.target, fixture.versionId)).toEqual(before);
    });

    it('replays regardless of the order the agreements arrive in', async () => {
      const fixture = await seedApprovable(context, placement);
      const body = approvalBody(fixture);

      const first = await context.asRequest(() => context.approval.approve(body));
      // A client that re-rendered its screen may legitimately submit the same
      // evidence in a different order. That must replay, not raise a conflict.
      const second = await context.asRequest(() =>
        context.approval.approve({
          ...body,
          acceptedAgreements: [...fixture.agreements].reverse(),
        }),
      );

      expect(second.replayed).toBe(true);
      expect(second.approvalSnapshotId).toBe(first.approvalSnapshotId);
      expect(
        await context.count(
          sql`select count(*)::text as count from approval_snapshots
               where design_version_id = ${fixture.versionId}`,
        ),
      ).toBe(1);
    });

    it('replays without requiring a still-open step-up window', async () => {
      const fixture = await seedApprovable(context, placement);
      const body = approvalBody(fixture);
      await context.asRequest(() => context.approval.approve(body));

      // The customer's verification has since aged out. A replay performs no
      // write, so demanding a fresh one would ask them to re-verify in order to
      // be shown a decision they already made — and would disclose nothing new,
      // because B10 already answers the same holder of the same live grant.
      await context.rows(
        sql`update contact_verification_challenges
               set verified_at = now() - interval '2 hours'
             where contact_point_id = ${fixture.target.contactPointId}`,
      );

      await expect(context.asRequest(() => context.approval.approve(body))).resolves.toMatchObject({
        replayed: true,
      });
    });

    it('reports a conflicting fingerprint on the same scope', async () => {
      const fixture = await seedApprovable(context, placement);
      // A claim already stands for this version under different evidence.
      await context.inTransaction(() =>
        context.idempotency.claim(
          {
            namespace: 'design.approve',
            scopeKey: fixture.versionId,
            fingerprint: `sha256:${'9'.repeat(64)}`,
          },
          new Date(Date.now() + 60_000),
        ),
      );

      expect(
        await failureOf(() =>
          context.asRequest(() => context.approval.approve(approvalBody(fixture))),
        ),
      ).toBe('IDEMPOTENCY_CONFLICT');
      expect(await versionStatusOf(context, fixture.versionId)).toBe('SENT_FOR_REVIEW');
    });

    it('reports an in-flight claim on the same evidence as retryable', async () => {
      const fixture = await seedApprovable(context, placement);
      // The same fingerprint this approval will compute, already claimed and not
      // yet completed — another attempt is mid-flight.
      await context.inTransaction(() =>
        context.idempotency.claim(
          {
            namespace: 'design.approve',
            scopeKey: fixture.versionId,
            fingerprint: approveFingerprint({
              versionId: fixture.versionId,
              documentHash: fixture.documentHash,
              acceptedAgreements: fixture.agreements,
            }),
          },
          new Date(Date.now() + 60_000),
        ),
      );

      expect(
        await failureOf(() =>
          context.asRequest(() => context.approval.approve(approvalBody(fixture))),
        ),
      ).toBe('DUPLICATE_OPERATION');
      expect(await versionStatusOf(context, fixture.versionId)).toBe('SENT_FOR_REVIEW');
    });
  });

  describe('atomic rollback', () => {
    it('rolls back every write when the last statement fails, then a retry succeeds', async () => {
      const fixture = await seedApprovable(context, placement);
      const body = approvalBody(fixture);

      // The injection point is the **last** write in the transaction, so
      // everything before it has already happened when it fails: the review row,
      // the snapshot, its two agreement children and three thread colours, the
      // request transition and the audit row are all in flight, and only the
      // rollback undoes them. Failing earlier would prove far less.
      await context.rows(
        sql`create or replace function app6_b11_block_event() returns trigger as $fn$
              begin
                raise exception 'APP6-B11 injected outbox failure';
              end;
            $fn$ language plpgsql`,
      );
      await context.rows(
        sql`create trigger app6_b11_block_event before insert on outbox_events
              for each row execute function app6_b11_block_event()`,
      );

      await expect(context.asRequest(() => context.approval.approve(body))).rejects.toThrow();

      expect(await writeCountsFor(context, fixture.target, fixture.versionId)).toEqual({
        reviews: 0,
        snapshots: 0,
        acceptances: 0,
        transitions: 0,
        audits: 0,
        events: 0,
        completedClaims: 0,
      });
      expect(await versionStatusOf(context, fixture.versionId)).toBe('SENT_FOR_REVIEW');
      expect(await requestStatusOf(context, fixture.target.requestId)).toBe('DESIGN_REVIEW');
      // No claim of any status either, so the retry below is a genuine first
      // attempt rather than a replay of a half-approval — and there is no
      // compensation path anywhere, because one transaction needs none.
      expect(await claimCountFor(context, fixture.versionId)).toBe(0);
      expect(
        await context.count(
          sql`select count(*)::text as count from approval_snapshot_thread_colors`,
        ),
      ).toBe(0);

      await context.rows(sql`drop trigger app6_b11_block_event on outbox_events`);
      const retried = await context.asRequest(() => context.approval.approve(body));

      expect(retried.replayed).toBe(false);
      expect(retried.versionStatus).toBe('APPROVED');
      expect(await writeCountsFor(context, fixture.target, fixture.versionId)).toEqual({
        reviews: 1,
        snapshots: 1,
        acceptances: 2,
        transitions: 1,
        audits: 1,
        events: 1,
        completedClaims: 1,
      });
    });
  });
});
