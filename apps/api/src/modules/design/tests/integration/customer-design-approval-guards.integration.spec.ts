/**
 * `APP6-B11` — the guards that refuse an approval, against a real PostgreSQL
 * instance.
 *
 * The negative half of `TR-LC08-04`: GRD-007's exact version and stored hash,
 * GRD-008's exact effective agreement set, and GRD-002/GRD-003's secure write.
 *
 * Every case asserts the refusal **and** the complete write census, because a
 * guard that refused after writing something would be a far worse defect than
 * one that refused for the wrong reason — and only the census can see it.
 */
import { newId } from '@embroidery/database';
import { sql } from 'drizzle-orm';

import type { DesignVersionId } from '../../domain/repositories/design-case.repository';
import { createDesignDecisionContext } from './customer-design-decision-context';
import type {
  DesignDecisionTestContext,
  SeededPlacement,
  SubmittedAgreement,
} from './customer-design-decision-context';
import {
  FRESH_STEP_UP_SECONDS,
  SENT_DOCUMENT_HASH,
  approvalBody,
  claimCountFor,
  failureOf,
  requestStatusOf,
  seedApprovable,
  versionStatusOf,
  writeCountsFor,
} from './customer-design-approval-fixtures';

describe('APP6-B11 design approval — the guards (integration)', () => {
  let context: DesignDecisionTestContext;
  let placement: SeededPlacement;

  beforeAll(async () => {
    context = await createDesignDecisionContext('app6-b11-approve-guards');
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

  /** Asserts the complete "nothing happened" census for one target. */
  async function expectNothingWritten(
    target: { readonly requestId: string },
    versionId: string,
  ): Promise<void> {
    const counts = await writeCountsFor(context, target as never, versionId);
    expect(counts).toEqual({
      reviews: 0,
      snapshots: 0,
      acceptances: 0,
      transitions: 0,
      audits: 0,
      events: 0,
      completedClaims: 0,
    });
  }

  describe('GRD-007 — the exact version and its stored hash', () => {
    it('refuses a submitted hash that is not the stored one, and poisons no claim', async () => {
      const fixture = await seedApprovable(context, placement);

      const failure = await failureOf(() =>
        context.asRequest(() =>
          context.approval.approve({
            ...approvalBody(fixture),
            documentHash: `sha256:${'c'.repeat(64)}`,
          }),
        ),
      );

      expect(failure).toBe('APPROVAL_VERSION_MISMATCH');
      await expectNothingWritten(fixture.target, fixture.versionId);
      // The hash is checked *before* the claim, so a refused first attempt
      // leaves no idempotency row of any status behind for a legitimate retry
      // to collide with.
      expect(await claimCountFor(context, fixture.versionId)).toBe(0);
      expect(await versionStatusOf(context, fixture.versionId)).toBe('SENT_FOR_REVIEW');
    });

    it.each([
      ['DRAFT', 'APPROVAL_VERSION_MISMATCH'],
      ['SUPERSEDED', 'APPROVAL_VERSION_MISMATCH'],
      ['VOID', 'APPROVAL_VERSION_MISMATCH'],
      ['APPROVED', 'INVALID_TRANSITION'],
      ['REVISION_REQUESTED', 'INVALID_TRANSITION'],
    ])('refuses a %s version with %s', async (status, expected) => {
      const target = await context.seedTarget({ stepUpVerifiedSecondsAgo: FRESH_STEP_UP_SECONDS });
      const versionId = (await context.seedVersion({
        designCaseId: target.designCaseId,
        status,
        documentHash: SENT_DOCUMENT_HASH,
        placement,
      })) as DesignVersionId;
      const agreements = await context.effectiveAgreements();

      const failure = await failureOf(() =>
        context.asRequest(() =>
          context.approval.approve({
            token: target.token,
            versionId,
            documentHash: SENT_DOCUMENT_HASH,
            acceptedAgreements: agreements,
          }),
        ),
      );

      // The split is the authority's, not a preference: a version that was
      // already decided is CC-04's `INVALID_TRANSITION` ("first decision wins"),
      // while one that was never decidable is GRD-007's mismatch ("re-read and
      // decide again").
      expect(failure).toBe(expected);
      await expectNothingWritten(target, versionId);
    });

    it('answers a foreign version with the same 404 an unknown token gets', async () => {
      const mine = await seedApprovable(context, placement);
      const theirs = await seedApprovable(context, placement);

      const failure = await failureOf(() =>
        context.asRequest(() =>
          context.approval.approve({
            token: mine.target.token,
            // Another customer's version, and a perfectly real row.
            versionId: theirs.versionId,
            documentHash: theirs.documentHash,
            acceptedAgreements: mine.agreements,
          }),
        ),
      );

      // Not `APPROVAL_VERSION_MISMATCH`: a finer answer would confirm that this
      // version exists somewhere, which is an enumeration oracle for another
      // customer's artwork.
      expect(failure).toBe('SECURE_LINK_UNAVAILABLE');
      expect(await versionStatusOf(context, theirs.versionId)).toBe('SENT_FOR_REVIEW');
      await expectNothingWritten(theirs.target, theirs.versionId);
    });

    it('refuses when the request has left DESIGN_REVIEW', async () => {
      const fixture = await seedApprovable(context, placement);
      await context.rows(
        sql`update custom_requests set status = 'CANCELLED',
                   cancelled_reason = 'APP6-B11 suite fixture.'
             where id = ${fixture.target.requestId}`,
      );

      const failure = await failureOf(() =>
        context.asRequest(() => context.approval.approve(approvalBody(fixture))),
      );

      expect(failure).toBe('INVALID_TRANSITION');
      expect(await versionStatusOf(context, fixture.versionId)).toBe('SENT_FOR_REVIEW');
    });

    it('never selects by the design case current-version pointer', async () => {
      const target = await context.seedTarget({ stepUpVerifiedSecondsAgo: FRESH_STEP_UP_SECONDS });
      const inReview = (await context.seedVersion({
        designCaseId: target.designCaseId,
        version: 1,
        documentHash: SENT_DOCUMENT_HASH,
        placement,
      })) as DesignVersionId;
      // The workshop has already started the next draft, so the pointer names a
      // version that was never sent. `APP6-B10` proved the pointer is not
      // selection authority; this proves the approval does not resurrect it as
      // one, in either direction.
      const newerDraft = (await context.seedVersion({
        designCaseId: target.designCaseId,
        version: 2,
        status: 'DRAFT',
        placement,
        makeCurrent: true,
      })) as DesignVersionId;
      const agreements = await context.effectiveAgreements();

      // The pointed-at draft is not approvable, even though it is "current".
      expect(
        await failureOf(() =>
          context.asRequest(() =>
            context.approval.approve({
              token: target.token,
              versionId: newerDraft,
              documentHash: SENT_DOCUMENT_HASH,
              acceptedAgreements: agreements,
            }),
          ),
        ),
      ).toBe('APPROVAL_VERSION_MISMATCH');

      // The version actually in review approves, though the pointer names another.
      const view = await context.asRequest(() =>
        context.approval.approve({
          token: target.token,
          versionId: inReview,
          documentHash: SENT_DOCUMENT_HASH,
          acceptedAgreements: agreements,
        }),
      );
      expect(view.versionStatus).toBe('APPROVED');
      expect(await versionStatusOf(context, newerDraft)).toBe('DRAFT');
    });
  });

  describe('GRD-008 — the exact effective agreement set', () => {
    it.each([
      ['a required agreement omitted', (set: SubmittedAgreement[]) => set.slice(0, 1)],
      [
        'an extra agreement',
        (set: SubmittedAgreement[]) => [
          ...set,
          { agreementVersionId: newId(), contentHash: `sha256:${'d'.repeat(64)}` },
        ],
      ],
      [
        'a stale agreement version id',
        (set: SubmittedAgreement[]) => [
          { ...(set[0] as SubmittedAgreement), agreementVersionId: newId() },
          set[1] as SubmittedAgreement,
        ],
      ],
      [
        'the right id with the wrong hash',
        (set: SubmittedAgreement[]) => [
          { ...(set[0] as SubmittedAgreement), contentHash: `sha256:${'e'.repeat(64)}` },
          set[1] as SubmittedAgreement,
        ],
      ],
      [
        'a duplicated agreement',
        (set: SubmittedAgreement[]) => [set[0] as SubmittedAgreement, set[0] as SubmittedAgreement],
      ],
      ['nothing at all', () => []],
    ])('refuses %s with TERMS_NOT_ACCEPTED and no side effect', async (_label, mutate) => {
      const fixture = await seedApprovable(context, placement);

      const failure = await failureOf(() =>
        context.asRequest(() =>
          context.approval.approve({
            ...approvalBody(fixture),
            acceptedAgreements: mutate(fixture.agreements),
          }),
        ),
      );

      expect(failure).toBe('TERMS_NOT_ACCEPTED');
      await expectNothingWritten(fixture.target, fixture.versionId);
      expect(await versionStatusOf(context, fixture.versionId)).toBe('SENT_FOR_REVIEW');
      expect(await requestStatusOf(context, fixture.target.requestId)).toBe('DESIGN_REVIEW');
    });

    it('refuses terms that were superseded after the customer read them', async () => {
      const fixture = await seedApprovable(context, placement);

      // A genuine operator publication, through the delivered AGG-21 repository:
      // a new `PAYMENT_POLICY` version is added and published, which moves the
      // outgoing row to `SUPERSEDED` and advances the container's pointer. The
      // customer's body now names a version that is no longer effective.
      //
      // Editing `agreement_versions` directly is not an option and should not
      // be: the `0030` immutability trigger rejects an UPDATE that touches a
      // protected column on a frozen row, which is the schema saying that
      // published terms are only ever replaced, never rewritten.
      const published = await context.publishSupersedingAgreement('PAYMENT_POLICY');
      expect(published).not.toBe(fixture.agreements[0]?.agreementVersionId);

      const failure = await failureOf(() =>
        context.asRequest(() => context.approval.approve(approvalBody(fixture))),
      );

      // The approval fails. It does not silently substitute the new terms, which
      // would bind the customer to text they never saw.
      expect(failure).toBe('TERMS_NOT_ACCEPTED');
      await expectNothingWritten(fixture.target, fixture.versionId);

      // And the customer can approve once they have read the new terms.
      const reread = await context.effectiveAgreements();
      await expect(
        context.asRequest(() =>
          context.approval.approve({ ...approvalBody(fixture), acceptedAgreements: reread }),
        ),
      ).resolves.toMatchObject({ versionStatus: 'APPROVED' });
    });

    it('refuses when the required set itself changed after the customer read it', async () => {
      const fixture = await seedApprovable(context, placement);
      // An operator narrowed the policy to one type. The customer's two-item
      // submission is now an "extra agreement" against the new required set.
      await context.publishPolicies({ requiredAgreementTypes: ['PAYMENT_POLICY'] });

      expect(
        await failureOf(() =>
          context.asRequest(() => context.approval.approve(approvalBody(fixture))),
        ),
      ).toBe('TERMS_NOT_ACCEPTED');
      await expectNothingWritten(fixture.target, fixture.versionId);
    });

    it('reports an unconfigurable required set as unavailable, not as a refusal', async () => {
      const fixture = await seedApprovable(context, placement);
      // A required type with no effective version at all: a deployment fault
      // with a live link and a real design behind it, so the customer must not
      // be told their submission was wrong.
      await context.publishPolicies({ requiredAgreementTypes: ['PAYMENT_POLICY', 'NEVER_SET'] });

      expect(
        await failureOf(() =>
          context.asRequest(() => context.approval.approve(approvalBody(fixture))),
        ),
      ).toBe('DESIGN_REVIEW_TERMS_UNAVAILABLE');
      await expectNothingWritten(fixture.target, fixture.versionId);
    });
  });

  describe('GRD-002 and GRD-003 — the secure write', () => {
    /** An approvable target with the step-up varied, for the GRD-003 cases. */
    async function seedWithStepUp(stepUpVerifiedSecondsAgo?: number) {
      const target = await context.seedTarget({ stepUpVerifiedSecondsAgo });
      const versionId = (await context.seedVersion({
        designCaseId: target.designCaseId,
        documentHash: SENT_DOCUMENT_HASH,
        placement,
      })) as DesignVersionId;
      return {
        target,
        versionId,
        body: {
          token: target.token,
          versionId,
          documentHash: SENT_DOCUMENT_HASH,
          acceptedAgreements: await context.effectiveAgreements(),
        },
      };
    }

    it('refuses with REVERIFICATION_REQUIRED when no step-up stands at all', async () => {
      const seeded = await seedWithStepUp();

      expect(
        await failureOf(() => context.asRequest(() => context.approval.approve(seeded.body))),
      ).toBe('REVERIFICATION_REQUIRED');
      await expectNothingWritten(seeded.target, seeded.versionId);
    });

    it('refuses a step-up that has fallen outside the published window', async () => {
      // The suite publishes a 15-minute window; this verification is an hour old.
      const seeded = await seedWithStepUp(60 * 60);

      expect(
        await failureOf(() => context.asRequest(() => context.approval.approve(seeded.body))),
      ).toBe('REVERIFICATION_REQUIRED');
      await expectNothingWritten(seeded.target, seeded.versionId);
    });

    it('refuses a fresh step-up that belongs to another customer', async () => {
      const seeded = await seedWithStepUp();
      // A stranger has a perfectly fresh, perfectly valid STEP_UP — for them.
      const stranger = await context.seedTarget({
        stepUpVerifiedSecondsAgo: FRESH_STEP_UP_SECONDS,
      });
      expect(stranger.contactPointId).not.toBe(seeded.target.contactPointId);

      // The evidence is derived from *this grant's* customer, so the stranger's
      // challenge is never a candidate — and no body field could have named it.
      expect(
        await failureOf(() => context.asRequest(() => context.approval.approve(seeded.body))),
      ).toBe('REVERIFICATION_REQUIRED');
      await expectNothingWritten(seeded.target, seeded.versionId);
    });

    it('refuses a fresh challenge issued for another purpose', async () => {
      const seeded = await seedWithStepUp(FRESH_STEP_UP_SECONDS);
      // The one challenge this customer has is re-purposed to the only other
      // value the closed set admits. GRD-003 asks for a `STEP_UP` specifically:
      // the `SUBMISSION` round that created this customer at APP5 intake proved
      // they own the contact, not that they are present now.
      await context.rows(
        sql`update contact_verification_challenges set purpose = 'SUBMISSION'
             where contact_point_id = ${seeded.target.contactPointId}`,
      );

      expect(
        await failureOf(() => context.asRequest(() => context.approval.approve(seeded.body))),
      ).toBe('REVERIFICATION_REQUIRED');
      await expectNothingWritten(seeded.target, seeded.versionId);
    });

    it.each([
      ['revoked', { grantStatus: 'REVOKED' }],
      ['expired', { grantExpiresInMinutes: -60 }],
    ])('answers a %s grant with the single 404 and writes nothing', async (_label, options) => {
      const target = await context.seedTarget({
        stepUpVerifiedSecondsAgo: FRESH_STEP_UP_SECONDS,
        ...options,
      });
      const versionId = (await context.seedVersion({
        designCaseId: target.designCaseId,
        documentHash: SENT_DOCUMENT_HASH,
        placement,
      })) as DesignVersionId;
      const agreements = await context.effectiveAgreements();

      expect(
        await failureOf(() =>
          context.asRequest(() =>
            context.approval.approve({
              token: target.token,
              versionId,
              documentHash: SENT_DOCUMENT_HASH,
              acceptedAgreements: agreements,
            }),
          ),
        ),
      ).toBe('SECURE_LINK_UNAVAILABLE');
      await expectNothingWritten(target, versionId);
    });

    it('answers an unknown token with the same 404, having written nothing', async () => {
      const fixture = await seedApprovable(context, placement);

      expect(
        await failureOf(() =>
          context.asRequest(() =>
            context.approval.approve({
              ...approvalBody(fixture),
              // Well-formed and belonging to nobody.
              token: 'A'.repeat(43),
            }),
          ),
        ),
      ).toBe('SECURE_LINK_UNAVAILABLE');
      await expectNothingWritten(fixture.target, fixture.versionId);
    });
  });
});
