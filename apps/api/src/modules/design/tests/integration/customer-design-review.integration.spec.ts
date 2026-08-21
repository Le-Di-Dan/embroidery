/**
 * `APP6-B10` — the customer's secure design review read, end to end.
 *
 * Real module, real secure-link admission, real peppered digest, real narrow
 * AGG-10 read port, real agreement publication. Nothing under test is stubbed.
 *
 * The load-bearing case is the third `describe` below: a design case whose
 * `current_version_id` points at a **newer DRAFT** while an **older** version is
 * `SENT_FOR_REVIEW`. That state is what separates "the version under review"
 * from "the current version", and a read that followed the pointer would show a
 * customer an unsent draft and let them approve it.
 */
import { sql } from 'drizzle-orm';

import { isSecureLinkError } from '../../../customer/domain/grant/secure-link.errors';
import { isDesignReviewTermsUnavailable } from '../../domain/review/design-review.errors';
import {
  callerFrom,
  catalogDocument,
  createCustomerDesignReviewContext,
  customerOwnedDocument,
  mintToken,
  shapeAt,
  type CustomerDesignReviewTestContext,
} from './customer-design-review-context';

const CALLER = callerFrom('203.0.113.44');
const REQUIRED = ['PAYMENT_POLICY', 'RETURN_POLICY'] as const;
const SENT_AT = new Date('2026-08-19T08:30:00.000Z');
const REVIEW_HASH = `sha256:${'b'.repeat(64)}`;

describe('APP6-B10 — customer secure design review read', () => {
  let context: CustomerDesignReviewTestContext;

  beforeAll(async () => {
    context = await createCustomerDesignReviewContext('app6-b10-design-review');
  }, 180_000);

  afterAll(async () => {
    await context?.close();
  });

  beforeEach(async () => {
    await context.reset();
    await context.publishSecureLinkPolicy();
    await context.publishAgreementsPolicy(REQUIRED);
    await context.publishAgreementContent();
  });

  /**
   * The default world: one granted request whose case has one sent version.
   *
   * Catalog-branch by default, because that is the ordinary shape and it also
   * proves the read never touches the four placement FKs it does not project.
   */
  async function seedReviewable(
    document: unknown,
    schemaVersion: number,
    branch: 'CATALOG' | 'CUSTOMER_OWNED' = 'CATALOG',
  ) {
    const seeded = await context.seedRequest();
    const placement = branch === 'CATALOG' ? await context.seedPlacement() : undefined;
    const versionId = await context.seedVersion({
      designCaseId: seeded.designCaseId,
      version: 1,
      document,
      documentSchemaVersion: schemaVersion,
      status: 'SENT_FOR_REVIEW',
      documentHash: REVIEW_HASH,
      sentAt: SENT_AT,
      makeCurrent: true,
      ...(placement === undefined ? {} : { placement }),
    });
    return { seeded, versionId };
  }

  /**
   * Asserts the read refused, and refused with the expected vocabulary.
   *
   * A helper rather than `.rejects.toSatisfy`, which this Jest build does not
   * ship. It re-throws anything the predicate rejects, so an unexpected error —
   * a constraint violation, a DI failure — surfaces as itself rather than as a
   * bare "did not throw the right thing".
   */
  async function expectRefusal(
    work: Promise<unknown>,
    predicate: (error: unknown) => boolean,
  ): Promise<void> {
    await expect(work).rejects.toThrow();
    await work.catch((error: unknown) => {
      if (!predicate(error)) throw error;
    });
  }

  function read(token: string) {
    return context.asRequest(() => context.reader.read(CALLER, { token }));
  }

  describe('the exact document, for both schema versions', () => {
    it('returns the Catalog v1 document and the hash the send stored', async () => {
      const document = catalogDocument([shapeAt('el-1', 120, 160)]);
      const { seeded, versionId } = await seedReviewable(document, 1);

      const outcome = await read(seeded.token);

      expect(outcome.outcome).toBe('READ');
      if (outcome.outcome !== 'READ') throw new Error('unreachable');
      expect(outcome.view.designVersionId).toBe(versionId);
      expect(outcome.view.version).toBe(1);
      expect(outcome.view.documentSchemaVersion).toBe(1);
      // The stored hash, byte for byte. Not recomputed here and not re-derived
      // from the document: `GRD-007` binds an approval to the persisted value,
      // and a second authority that could disagree with it is the defect.
      expect(outcome.view.documentHash).toBe(REVIEW_HASH);
      expect(outcome.view.sentAt.toISOString()).toBe(SENT_AT.toISOString());
      // Deep equality against the fixture, so a migration, a re-quantization or
      // a key reordering on the read path would fail here.
      expect(outcome.view.document).toEqual(document);
      expect(outcome.view.accessExpiresAt.toISOString()).toBe(seeded.grantExpiresAt.toISOString());
    });

    it('returns the COP v2 document unchanged, and never migrates it to v1', async () => {
      const document = customerOwnedDocument([shapeAt('el-2', 10, 12)]);
      const { seeded } = await seedReviewable(document, 2, 'CUSTOMER_OWNED');

      const outcome = await read(seeded.token);

      if (outcome.outcome !== 'READ') throw new Error('unreachable');
      expect(outcome.view.documentSchemaVersion).toBe(2);
      expect(outcome.view.document).toEqual(document);
      // The v2 discriminators survive: a read that "helpfully" filled the two
      // nulls in from the Catalog branch would be inventing a placement chain the
      // ADR exists to prevent.
      const placement = (outcome.view.document as { placement: Record<string, unknown> }).placement;
      expect(placement['productSideId']).toBeNull();
      expect(placement['embroideryAreaId']).toBeNull();
    });

    it('leaves the persisted row exactly as it found it', async () => {
      const { seeded, versionId } = await seedReviewable(catalogDocument(), 1);
      const before = await context.rows(sql`
        select status, document_hash, sent_at, design_document from design_versions
         where id = ${versionId}
      `);

      await read(seeded.token);

      expect(
        await context.rows(sql`
          select status, document_hash, sent_at, design_document from design_versions
           where id = ${versionId}
        `),
      ).toEqual(before);
    });
  });

  describe('the review target is the sent version, never the current pointer', () => {
    it('returns the older SENT_FOR_REVIEW version while the pointer names a newer DRAFT', async () => {
      const seeded = await context.seedRequest();
      const reviewDocument = catalogDocument([shapeAt('under-review', 100, 100)]);
      const draftDocument = catalogDocument([shapeAt('not-yet-sent', 200, 200)]);

      const reviewVersionId = await context.seedVersion({
        designCaseId: seeded.designCaseId,
        version: 3,
        document: reviewDocument,
        documentSchemaVersion: 1,
        status: 'SENT_FOR_REVIEW',
        documentHash: REVIEW_HASH,
        sentAt: SENT_AT,
      });
      // The workshop has already started the next draft, so the case pointer has
      // moved on. This is the ordinary state during a review, not an edge case.
      const draftVersionId = await context.seedVersion({
        designCaseId: seeded.designCaseId,
        version: 4,
        document: draftDocument,
        documentSchemaVersion: 1,
        status: 'DRAFT',
        makeCurrent: true,
      });

      const outcome = await read(seeded.token);

      if (outcome.outcome !== 'READ') throw new Error('unreachable');
      expect(outcome.view.designVersionId).toBe(reviewVersionId);
      expect(outcome.view.version).toBe(3);
      expect(outcome.view.document).toEqual(reviewDocument);
      // The assertions that matter are the negatives: neither the newest row nor
      // the row the pointer names was served.
      expect(outcome.view.designVersionId).not.toBe(draftVersionId);
      expect(outcome.view.document).not.toEqual(draftDocument);

      const [pointer] = await context.rows<{ readonly current_version_id: string }>(sql`
        select current_version_id from design_cases where id = ${seeded.designCaseId}
      `);
      expect(pointer?.current_version_id).toBe(draftVersionId);
    });

    it('never serves a superseded, revision-requested, approved or drafted version', async () => {
      const seeded = await context.seedRequest();
      for (const [index, status] of [
        'DRAFT',
        'REVISION_REQUESTED',
        'SUPERSEDED',
        'APPROVED',
      ].entries()) {
        await context.seedVersion({
          designCaseId: seeded.designCaseId,
          version: index + 1,
          document: catalogDocument(),
          documentSchemaVersion: 1,
          status,
          makeCurrent: true,
        });
      }

      // A case with four versions and none in review reads exactly like a case
      // with none at all: "the workshop has not sent you a design" is a fact
      // about their progress, not a stranger's to learn.
      await expectRefusal(read(seeded.token), isSecureLinkError);
    });

    it('shows a later legitimate send on a fresh read, with nothing pinned', async () => {
      const seeded = await context.seedRequest();
      const first = await context.seedVersion({
        designCaseId: seeded.designCaseId,
        version: 1,
        document: catalogDocument([shapeAt('first', 10, 10)]),
        documentSchemaVersion: 1,
        status: 'SENT_FOR_REVIEW',
        documentHash: REVIEW_HASH,
        sentAt: SENT_AT,
        makeCurrent: true,
      });

      const before = await read(seeded.token);
      if (before.outcome !== 'READ') throw new Error('unreachable');
      expect(before.view.designVersionId).toBe(first);

      // The first version is decided and a second is sent — the shape LC-08's
      // revision cycle produces. Only one row may be `SENT_FOR_REVIEW` at a time
      // (`uq_design_versions__case__sent_for_review`), so the first must move.
      await context.rows(sql`
        update design_versions set status = 'SUPERSEDED', superseded_at = now()
         where id = ${first}
      `);
      const second = await context.seedVersion({
        designCaseId: seeded.designCaseId,
        version: 2,
        document: catalogDocument([shapeAt('second', 20, 20)]),
        documentSchemaVersion: 1,
        status: 'SENT_FOR_REVIEW',
        documentHash: `sha256:${'c'.repeat(64)}`,
        sentAt: new Date('2026-08-20T09:00:00.000Z'),
        makeCurrent: true,
      });

      const after = await read(seeded.token);
      if (after.outcome !== 'READ') throw new Error('unreachable');
      expect(after.view.designVersionId).toBe(second);
      expect(after.view.documentHash).toBe(`sha256:${'c'.repeat(64)}`);
    });
  });

  describe('the effective agreement set', () => {
    it('returns one effective version per required type, in published order', async () => {
      const { seeded } = await seedReviewable(catalogDocument(), 1);

      const outcome = await read(seeded.token);

      if (outcome.outcome !== 'READ') throw new Error('unreachable');
      expect(outcome.view.agreements.map((agreement) => agreement.agreementType)).toEqual([
        ...REQUIRED,
      ]);
      // Not `DESIGN_APPROVAL_TERMS`, and not a third type: `APP6-G01-C1` §5.2
      // rules the exact-design confirmation out of the agreement model entirely.
      expect(outcome.view.agreements).toHaveLength(2);
    });

    it('returns ids, hashes and content equal to the persisted effective rows', async () => {
      const { seeded } = await seedReviewable(catalogDocument(), 1);

      const outcome = await read(seeded.token);
      if (outcome.outcome !== 'READ') throw new Error('unreachable');

      const persisted = await context.rows<{
        readonly id: string;
        readonly agreement_type: string;
        readonly content_hash: string;
        readonly content: string;
        readonly language: string;
        readonly status: string;
      }>(sql`
        select v.id, a.agreement_type, v.content_hash, v.content, v.language, v.status
          from agreements a
          join agreement_versions v on v.id = a.current_version_id
      `);

      for (const agreement of outcome.view.agreements) {
        const row = persisted.find((entry) => entry.agreement_type === agreement.agreementType);
        expect(row).toBeDefined();
        expect(agreement.agreementVersionId).toBe(row?.id);
        expect(agreement.contentHash).toBe(row?.content_hash);
        expect(agreement.content).toBe(row?.content);
        expect(agreement.language).toBe('vi');
        expect(row?.status).toBe('PUBLISHED');
      }
    });

    it('reads the required set from policy rather than from a second allow-list', async () => {
      // Only one type is required by this deployment's policy, and the read must
      // follow it — a hard-coded pair would silently return two.
      await context.publishAgreementsPolicy(['RETURN_POLICY']);
      const { seeded } = await seedReviewable(catalogDocument(), 1);

      const outcome = await read(seeded.token);

      if (outcome.outcome !== 'READ') throw new Error('unreachable');
      expect(outcome.view.agreements.map((agreement) => agreement.agreementType)).toEqual([
        'RETURN_POLICY',
      ]);
    });

    it('fails closed, and not as a dead link, when a required type has no content', async () => {
      // A type the operator requires but has never published. The link is live
      // and the design is real, so a 404 would send the customer to support to
      // replace a working link while hiding the configuration fault.
      await context.publishAgreementsPolicy([...REQUIRED, 'DELIVERY_POLICY']);
      const { seeded } = await seedReviewable(catalogDocument(), 1);

      await expectRefusal(read(seeded.token), isDesignReviewTermsUnavailable);
    });

    it('fails closed when the required-type policy was never published', async () => {
      const { seeded } = await seedReviewable(catalogDocument(), 1);
      // The key exists with no current version — the state a deployment is in
      // between `ensureKey` and the first publish. The version rows are left
      // alone: `policy_configuration_versions` is immutable by design (DB4), and
      // clearing the pointer is exactly what makes the value unresolvable.
      await context.rows(sql`
        update policy_configurations set current_version_id = null
         where config_key = 'design_approval.agreements'
      `);

      await expectRefusal(read(seeded.token), isDesignReviewTermsUnavailable);
    });

    it('fails closed rather than serving a withdrawn term', async () => {
      const { seeded } = await seedReviewable(catalogDocument(), 1);
      // Withdrawal clears the current pointer, so the type has no effective
      // version. The read must not fall back to the withdrawn text.
      await context.rows(sql`
        update agreements set current_version_id = null
         where agreement_type = 'RETURN_POLICY'
      `);

      await expectRefusal(read(seeded.token), isDesignReviewTermsUnavailable);
    });
  });

  describe('one 404 for every unusable credential and every unreachable target', () => {
    it('refuses an unknown token', async () => {
      await seedReviewable(catalogDocument(), 1);
      await expectRefusal(read(mintToken()), isSecureLinkError);
    });

    it('refuses an expired grant', async () => {
      const seeded = await context.seedRequest({ grantExpiresInMinutes: -1 });
      await context.seedVersion({
        designCaseId: seeded.designCaseId,
        version: 1,
        document: catalogDocument(),
        documentSchemaVersion: 1,
        status: 'SENT_FOR_REVIEW',
        documentHash: REVIEW_HASH,
        sentAt: SENT_AT,
      });
      await expectRefusal(read(seeded.token), isSecureLinkError);
    });

    it('refuses a revoked grant', async () => {
      const seeded = await context.seedRequest({ grantStatus: 'REVOKED' });
      await context.seedVersion({
        designCaseId: seeded.designCaseId,
        version: 1,
        document: catalogDocument(),
        documentSchemaVersion: 1,
        status: 'SENT_FOR_REVIEW',
        documentHash: REVIEW_HASH,
        sentAt: SENT_AT,
      });
      await expectRefusal(read(seeded.token), isSecureLinkError);
    });

    it('refuses a request with no design case pointer', async () => {
      const seeded = await context.seedRequest({ withDesignCase: false });
      await expectRefusal(read(seeded.token), isSecureLinkError);
    });

    it('cannot be given a dangling design case pointer at all', async () => {
      const seeded = await context.seedRequest();

      // `fk_custom_requests__current_design_case_id` refuses the delete, so the
      // pointer cannot outlive its row. The read's `findReviewCase === undefined`
      // branch is therefore defence in depth rather than a reachable state —
      // recorded here rather than asserted as a refusal that cannot be produced,
      // because a test that quietly nulled the pointer first would be testing the
      // "no pointer" case under a name claiming otherwise.
      // The driver wraps the constraint violation, so the FK name is on the
      // cause rather than on the message — asserted there, because a bare "it
      // threw" would also pass if the delete failed for an unrelated reason.
      const refusal = await context
        .rows(sql`delete from design_cases where id = ${seeded.designCaseId}`)
        .then(
          () => undefined,
          (error: unknown) => error,
        );
      expect(refusal).toBeDefined();
      expect(String((refusal as { readonly cause?: unknown }).cause)).toContain(
        'fk_custom_requests__current_design_case_id',
      );
    });

    it('refuses a design case that belongs to another request', async () => {
      const mine = await context.seedRequest();
      const theirs = await context.seedRequest();
      await context.seedVersion({
        designCaseId: theirs.designCaseId,
        version: 1,
        document: catalogDocument([shapeAt('not-yours', 1, 1)]),
        documentSchemaVersion: 1,
        status: 'SENT_FOR_REVIEW',
        documentHash: REVIEW_HASH,
        sentAt: SENT_AT,
      });
      // The pointer resolves perfectly well — that is exactly why the back-check
      // exists. Without it, one request's pointer would serve another customer's
      // artwork.
      await context.rows(sql`
        update custom_requests set current_design_case_id = ${theirs.designCaseId}
         where id = ${mine.requestId}
      `);

      await expectRefusal(read(mine.token), isSecureLinkError);
    });

    it('gives one customer’s link no sight of another customer’s design', async () => {
      const mine = await seedReviewable(catalogDocument([shapeAt('mine', 5, 5)]), 1);
      const theirsDocument = catalogDocument([shapeAt('theirs', 9, 9)]);
      const theirs = await seedReviewable(theirsDocument, 1);

      const outcome = await read(mine.seeded.token);

      if (outcome.outcome !== 'READ') throw new Error('unreachable');
      expect(outcome.view.designVersionId).toBe(mine.versionId);
      expect(outcome.view.designVersionId).not.toBe(theirs.versionId);
      expect(outcome.view.document).not.toEqual(theirsDocument);
    });
  });

  describe('the read writes nothing and requires no step-up', () => {
    it('appends no transition, audit, outbox, notification, review or acceptance row', async () => {
      const { seeded } = await seedReviewable(catalogDocument(), 1);
      const tables = [
        'custom_request_transitions',
        'design_reviews',
        'approval_snapshots',
        'approval_snapshot_agreement_acceptances',
        'outbox_events',
        'notification_intents',
        'contact_verification_challenges',
      ] as const;

      const before = new Map<string, number>();
      for (const table of tables) {
        before.set(table, await context.count(sql`select count(*) from ${sql.identifier(table)}`));
      }

      await read(seeded.token);

      for (const table of tables) {
        expect({
          table,
          count: await context.count(sql`select count(*) from ${sql.identifier(table)}`),
        }).toEqual({ table, count: before.get(table) });
      }
    });

    it('leaves the grant live and unconsumed across repeated reads', async () => {
      const { seeded } = await seedReviewable(catalogDocument(), 1);

      await read(seeded.token);
      await read(seeded.token);
      const third = await read(seeded.token);

      expect(third.outcome).toBe('READ');
      const [grant] = await context.rows<{
        readonly status: string;
        // `timestamptz` arrives as the driver's own representation; compared
        // through `new Date(...)` so the assertion is about the instant rather
        // than about the shape `pg` happens to hand back.
        readonly expires_at: string;
        readonly revoked_at: string | null;
      }>(sql`select status, expires_at, revoked_at from secure_access_grants
               where id = ${seeded.grantId}`);
      expect(grant?.status).toBe('ACTIVE');
      expect(grant?.revoked_at).toBeNull();
      expect(new Date(grant?.expires_at ?? 0).toISOString()).toBe(
        seeded.grantExpiresAt.toISOString(),
      );
    });

    it('reads with no step-up challenge in existence at all', async () => {
      const { seeded } = await seedReviewable(catalogDocument(), 1);
      expect(await context.count(sql`select count(*) from contact_verification_challenges`)).toBe(
        0,
      );

      const outcome = await read(seeded.token);

      // A valid grant reads. Step-up authorises the `APP6-B11` approval, and a
      // read that consumed one would burn the challenge the decision needs.
      expect(outcome.outcome).toBe('READ');
      expect(await context.count(sql`select count(*) from contact_verification_challenges`)).toBe(
        0,
      );
    });

    it('does not advance the case or request pointers', async () => {
      const seeded = await context.seedRequest();
      const reviewVersionId = await context.seedVersion({
        designCaseId: seeded.designCaseId,
        version: 1,
        document: catalogDocument(),
        documentSchemaVersion: 1,
        status: 'SENT_FOR_REVIEW',
        documentHash: REVIEW_HASH,
        sentAt: SENT_AT,
      });
      // Deliberately left unset, so an implementation that "helpfully" repaired
      // it while reading would be visible here.
      await read(seeded.token);

      const [designCase] = await context.rows<{ readonly current_version_id: string | null }>(sql`
        select current_version_id from design_cases where id = ${seeded.designCaseId}
      `);
      expect(designCase?.current_version_id).toBeNull();
      expect(reviewVersionId).toBeDefined();

      const [request] = await context.rows<{ readonly status: string }>(sql`
        select status from custom_requests where id = ${seeded.requestId}
      `);
      expect(request?.status).toBe('DESIGN_REVIEW');
    });
  });
});
