/**
 * `APP6-B11` — `TR-LC08-03`, the customer asking for a revision, against a real
 * PostgreSQL instance.
 *
 * The load-bearing property of this suite is an **absence**: a revision request
 * needs no step-up, creates no challenge, moves no request, freezes no snapshot
 * and accepts no terms. Several tests below therefore succeed on a fixture that
 * has *no* verified STEP_UP at all — which is the only honest way to prove the
 * guard is absent rather than merely satisfied.
 */
import { sql } from 'drizzle-orm';

import type { DesignVersionId } from '../../domain/repositories/design-case.repository';
import { createDesignDecisionContext } from './customer-design-decision-context';
import type {
  DesignDecisionTestContext,
  SeededDecisionTarget,
  SeededPlacement,
} from './customer-design-decision-context';
import {
  FRESH_STEP_UP_SECONDS,
  SENT_DOCUMENT_HASH,
  failureOf,
  requestStatusOf,
  versionStatusOf,
} from './customer-design-approval-fixtures';

const FEEDBACK = 'Vui lòng dời logo sang trái khoảng 10mm và dùng chỉ đậm hơn.';

describe('APP6-B11 design revision request (integration)', () => {
  let context: DesignDecisionTestContext;
  let placement: SeededPlacement;

  beforeAll(async () => {
    context = await createDesignDecisionContext('app6-b11-revision');
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

  /**
   * A request awaiting a decision, with **no** step-up unless one is asked for.
   *
   * The default is deliberate: every positive case below runs without one, so a
   * regression that started requiring GRD-003 on this path would fail the suite
   * rather than pass it unnoticed.
   */
  async function seedDecidable(
    options: { readonly status?: string; readonly stepUpVerifiedSecondsAgo?: number } = {},
  ): Promise<{ readonly target: SeededDecisionTarget; readonly versionId: DesignVersionId }> {
    const target = await context.seedTarget({
      stepUpVerifiedSecondsAgo: options.stepUpVerifiedSecondsAgo,
    });
    const versionId = (await context.seedVersion({
      designCaseId: target.designCaseId,
      status: options.status ?? 'SENT_FOR_REVIEW',
      documentHash: SENT_DOCUMENT_HASH,
      placement,
      makeCurrent: true,
    })) as DesignVersionId;
    return { target, versionId };
  }

  describe('the committed revision request', () => {
    it('records REQUEST_REVISION with the customer feedback, and no step-up', async () => {
      const seeded = await seedDecidable();

      const view = await context.asRequest(() =>
        context.revision.requestRevision({
          token: seeded.target.token,
          versionId: seeded.versionId,
          feedback: FEEDBACK,
        }),
      );

      expect(view.versionStatus).toBe('REVISION_REQUESTED');
      const [review] = await context.rows<{
        readonly outcome: string;
        readonly feedback: string | null;
        readonly customer_id: string;
        readonly grant_id: string;
        readonly step_up_challenge_id: string | null;
      }>(
        sql`select outcome, feedback, customer_id, grant_id, step_up_challenge_id
              from design_reviews where design_version_id = ${seeded.versionId}`,
      );
      expect(review).toMatchObject({
        outcome: 'REQUEST_REVISION',
        feedback: FEEDBACK,
        customer_id: seeded.target.customerId,
        grant_id: seeded.target.grantId,
        // Nullable for exactly this outcome, and null because GRD-003 does not
        // guard `TR-LC08-03`: recording a challenge here would be evidence of a
        // verification that was never required and never performed.
        step_up_challenge_id: null,
      });
    });

    it('succeeds with no verified challenge in the database at all', async () => {
      const seeded = await seedDecidable();
      expect(
        await context.count(
          sql`select count(*)::text as count from contact_verification_challenges`,
        ),
      ).toBe(0);

      await expect(
        context.asRequest(() =>
          context.revision.requestRevision({
            token: seeded.target.token,
            versionId: seeded.versionId,
            feedback: FEEDBACK,
          }),
        ),
      ).resolves.toMatchObject({ versionStatus: 'REVISION_REQUESTED' });

      // And none was created on the way: the path composes no step-up
      // capability, so it can neither consume nor issue a challenge.
      expect(
        await context.count(
          sql`select count(*)::text as count from contact_verification_challenges`,
        ),
      ).toBe(0);
    });

    it('leaves the request in DESIGN_REVIEW with no transition row', async () => {
      const seeded = await seedDecidable();

      const view = await context.asRequest(() =>
        context.revision.requestRevision({
          token: seeded.target.token,
          versionId: seeded.versionId,
          feedback: FEEDBACK,
        }),
      );

      expect(view.requestStatus).toBe('DESIGN_REVIEW');
      expect(await requestStatusOf(context, seeded.target.requestId)).toBe('DESIGN_REVIEW');
      // No self-edge, and no backward move to DIGITIZING. LC-11 has no
      // `DESIGN_REVIEW → DESIGN_REVIEW`, and a row claiming one would record a
      // move that did not happen.
      expect(
        await context.count(
          sql`select count(*)::text as count from custom_request_transitions
               where custom_request_id = ${seeded.target.requestId}`,
        ),
      ).toBe(0);
    });

    it('freezes no approval evidence and authors no next draft', async () => {
      const seeded = await seedDecidable();

      await context.asRequest(() =>
        context.revision.requestRevision({
          token: seeded.target.token,
          versionId: seeded.versionId,
          feedback: FEEDBACK,
        }),
      );

      for (const table of [
        'approval_snapshots',
        'approval_snapshot_agreement_acceptances',
        'approval_snapshot_thread_colors',
        // `design.approve` has no counterpart namespace here: `APP6-G01` §10
        // dispositions this action as naturally idempotent.
        'idempotency_records',
      ]) {
        expect(
          await context.count(sql`select count(*)::text as count from ${sql.identifier(table)}`),
        ).toBe(0);
      }
      // `APP6-B08` owns revision authoring; at this instant the workshop has
      // authored nothing, so the case still has exactly the one version.
      expect(
        await context.count(
          sql`select count(*)::text as count from design_versions
               where design_case_id = ${seeded.target.designCaseId}`,
        ),
      ).toBe(1);
    });

    it('emits design.revision-requested exactly once, on the version, with no secret', async () => {
      const seeded = await seedDecidable();

      await context.asRequest(() =>
        context.revision.requestRevision({
          token: seeded.target.token,
          versionId: seeded.versionId,
          feedback: FEEDBACK,
        }),
      );

      const events = await context.rows<{
        readonly event_type: string;
        readonly aggregate_kind: string;
        readonly aggregate_id: string;
        readonly payload: Record<string, unknown>;
      }>(sql`select event_type, aggregate_kind, aggregate_id, payload from outbox_events`);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        event_type: 'design.revision-requested',
        // §SE-004 names the version ("per (version)").
        aggregate_kind: 'DESIGN_VERSION',
        aggregate_id: seeded.versionId,
      });

      const payload = JSON.stringify(events[0]?.payload ?? {});
      for (const forbidden of [seeded.target.token, seeded.target.grantId, FEEDBACK]) {
        // The customer's words belong on the decision record where the Admin
        // surface reads them, not in an event payload that is delivered onward.
        expect(payload).not.toContain(forbidden);
      }
    });

    it('appends one audit row that does not carry the feedback text', async () => {
      const seeded = await seedDecidable();

      await context.asRequest(() =>
        context.revision.requestRevision({
          token: seeded.target.token,
          versionId: seeded.versionId,
          feedback: FEEDBACK,
        }),
      );

      const [audit] = await context.rows<{
        readonly actor_kind: string;
        readonly target_kind: string;
        readonly target_id: string;
        readonly summary: Record<string, unknown>;
      }>(
        sql`select actor_kind, target_kind, target_id, summary from audit_events
             where action = 'design_version.revision_requested'`,
      );
      expect(audit).toMatchObject({
        actor_kind: 'CUSTOMER',
        target_kind: 'DESIGN_VERSION',
        target_id: seeded.versionId,
      });
      expect(audit?.summary).toMatchObject({
        fromStatus: 'SENT_FOR_REVIEW',
        toStatus: 'REVISION_REQUESTED',
        requestTransitioned: false,
      });
      expect(JSON.stringify(audit?.summary ?? {})).not.toContain(FEEDBACK);
    });
  });

  describe('the refusals', () => {
    it.each([['DRAFT'], ['SUPERSEDED'], ['VOID'], ['APPROVED'], ['REVISION_REQUESTED']])(
      'refuses a %s version with INVALID_TRANSITION and never a GRD-007 code',
      async (status) => {
        const seeded = await seedDecidable({ status });

        const failure = await failureOf(() =>
          context.asRequest(() =>
            context.revision.requestRevision({
              token: seeded.target.token,
              versionId: seeded.versionId,
              feedback: FEEDBACK,
            }),
          ),
        );

        // Every ineligible state is one answer here. `TR-LC08-03` carries no
        // GRD-007, so publishing `APPROVAL_VERSION_MISMATCH` from this surface
        // would invent a refusal the guard catalog does not give it.
        expect(failure).toBe('INVALID_TRANSITION');
        expect(await versionStatusOf(context, seeded.versionId)).toBe(status);
        expect(await context.count(sql`select count(*)::text as count from outbox_events`)).toBe(0);
      },
    );

    it('refuses a second revision request on the same version', async () => {
      const seeded = await seedDecidable();
      const body = {
        token: seeded.target.token,
        versionId: seeded.versionId,
        feedback: FEEDBACK,
      };
      await context.asRequest(() => context.revision.requestRevision(body));

      // Naturally idempotent, not replayed: the version's state is the record,
      // and a repeat is refused rather than duplicated (`APP6-G01` §10).
      expect(
        await failureOf(() => context.asRequest(() => context.revision.requestRevision(body))),
      ).toBe('INVALID_TRANSITION');
      expect(
        await context.count(
          sql`select count(*)::text as count from design_reviews
               where design_version_id = ${seeded.versionId}`,
        ),
      ).toBe(1);
    });

    it('answers a foreign version with the same 404 an unknown token gets', async () => {
      const mine = await seedDecidable();
      const theirs = await seedDecidable();

      expect(
        await failureOf(() =>
          context.asRequest(() =>
            context.revision.requestRevision({
              token: mine.target.token,
              versionId: theirs.versionId,
              feedback: FEEDBACK,
            }),
          ),
        ),
      ).toBe('SECURE_LINK_UNAVAILABLE');
      expect(await versionStatusOf(context, theirs.versionId)).toBe('SENT_FOR_REVIEW');
    });

    it.each([
      ['revoked', { grantStatus: 'REVOKED' }],
      ['expired', { grantExpiresInMinutes: -60 }],
    ])('answers a %s grant with the single 404 and writes nothing', async (_label, options) => {
      const target = await context.seedTarget(options);
      const versionId = (await context.seedVersion({
        designCaseId: target.designCaseId,
        documentHash: SENT_DOCUMENT_HASH,
        placement,
      })) as DesignVersionId;

      expect(
        await failureOf(() =>
          context.asRequest(() =>
            context.revision.requestRevision({
              token: target.token,
              versionId,
              feedback: FEEDBACK,
            }),
          ),
        ),
      ).toBe('SECURE_LINK_UNAVAILABLE');
      expect(await versionStatusOf(context, versionId)).toBe('SENT_FOR_REVIEW');
      expect(await context.count(sql`select count(*)::text as count from design_reviews`)).toBe(0);
    });

    it('never answers REVERIFICATION_REQUIRED, even with a stale step-up', async () => {
      // An hour-old verification would fail GRD-003 on the approval path. Here
      // it is simply irrelevant.
      const seeded = await seedDecidable({ stepUpVerifiedSecondsAgo: 60 * 60 });

      await expect(
        context.asRequest(() =>
          context.revision.requestRevision({
            token: seeded.target.token,
            versionId: seeded.versionId,
            feedback: FEEDBACK,
          }),
        ),
      ).resolves.toMatchObject({ versionStatus: 'REVISION_REQUESTED' });
    });

    it('succeeds even when the required agreement set is unpublishable', async () => {
      const seeded = await seedDecidable({ stepUpVerifiedSecondsAgo: FRESH_STEP_UP_SECONDS });
      // A configuration fault that stops an *approval* dead. A revision request
      // binds no terms, so it must not be affected at all.
      await context.publishPolicies({ requiredAgreementTypes: ['NEVER_SET'] });

      await expect(
        context.asRequest(() =>
          context.revision.requestRevision({
            token: seeded.target.token,
            versionId: seeded.versionId,
            feedback: FEEDBACK,
          }),
        ),
      ).resolves.toMatchObject({ versionStatus: 'REVISION_REQUESTED' });
    });
  });

  describe('atomic rollback', () => {
    it('leaves no decision, audit row or event when the last write fails', async () => {
      const seeded = await seedDecidable();
      await context.rows(
        sql`create or replace function app6_b11_block_revision_event() returns trigger as $fn$
              begin
                raise exception 'APP6-B11 injected outbox failure';
              end;
            $fn$ language plpgsql`,
      );
      await context.rows(
        sql`create trigger app6_b11_block_revision_event before insert on outbox_events
              for each row execute function app6_b11_block_revision_event()`,
      );
      const body = {
        token: seeded.target.token,
        versionId: seeded.versionId,
        feedback: FEEDBACK,
      };

      await expect(
        context.asRequest(() => context.revision.requestRevision(body)),
      ).rejects.toThrow();

      expect(await versionStatusOf(context, seeded.versionId)).toBe('SENT_FOR_REVIEW');
      expect(await context.count(sql`select count(*)::text as count from design_reviews`)).toBe(0);
      expect(
        await context.count(
          sql`select count(*)::text as count from audit_events
               where action = 'design_version.revision_requested'`,
        ),
      ).toBe(0);
      expect(await requestStatusOf(context, seeded.target.requestId)).toBe('DESIGN_REVIEW');

      await context.rows(sql`drop trigger app6_b11_block_revision_event on outbox_events`);
      await expect(
        context.asRequest(() => context.revision.requestRevision(body)),
      ).resolves.toMatchObject({ versionStatus: 'REVISION_REQUESTED' });
    });
  });
});
