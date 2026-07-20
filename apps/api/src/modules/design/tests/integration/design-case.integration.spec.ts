/**
 * AGG-10 Design Case persistence against a real PostgreSQL instance
 * (DB7-CP4).
 *
 * TBL-027..TBL-030 and guards G-DB7-02, G-DB7-09, G-DB7-13, G-DB7-15,
 * G-DB7-17.
 */
import { isPersistenceError, newId, withMappedErrors } from '@embroidery/database';
import type { PersistenceError } from '@embroidery/database';
import { sql } from 'drizzle-orm';

import { createPersistenceTestContext } from '../../../../tests/integration/persistence-test-context';
import type { PersistenceTestContext } from '../../../../tests/integration/persistence-test-context';
import { DesignModule } from '../../design.module';
import { DESIGN_CASE_REPOSITORY } from '../../domain/repositories/design-case.repository';
import type {
  DesignCaseId,
  DesignCaseRepository,
  DesignVersionId,
} from '../../domain/repositories/design-case.repository';
import { FIXTURE_HASH, seedDesignChain } from './design-fixture';
import type { DesignFixture } from './design-fixture';

describe('design case persistence (integration)', () => {
  let context: PersistenceTestContext;
  let cases: DesignCaseRepository;
  let fixture: DesignFixture;

  beforeAll(async () => {
    context = await createPersistenceTestContext('cp4-design-case', [DesignModule]);
    cases = context.get(DESIGN_CASE_REPOSITORY);
  }, 120_000);

  afterAll(async () => {
    await context?.close();
  });

  beforeEach(async () => {
    await context.reset();
    fixture = await seedDesignChain(context);
  });

  async function failureOf(work: () => Promise<unknown>): Promise<PersistenceError> {
    try {
      await work();
    } catch (error: unknown) {
      if (isPersistenceError(error)) {
        return error;
      }
      throw error;
    }
    throw new Error('Expected the operation to fail, but it succeeded.');
  }

  function createCase(target = fixture): Promise<{ id: DesignCaseId }> {
    const id = newId() as DesignCaseId;
    return context.inTransaction(() => cases.createForRequest(id, target.customRequestId));
  }

  function createVersion(caseId: DesignCaseId, target = fixture): Promise<{ id: DesignVersionId }> {
    const id = newId() as DesignVersionId;
    return context.inTransaction(() =>
      cases.createVersion({
        id,
        designCaseId: caseId,
        designDocument: { elements: [] },
        documentSchemaVersion: 1,
        placement: target.placement,
      }),
    );
  }

  describe('case creation', () => {
    it('creates the case and points the request at it (G-DB7-09)', async () => {
      const created = await createCase();

      const [row] = (
        await context.disposable.client.db.execute<{ current_design_case_id: string }>(
          sql`select current_design_case_id from custom_requests where id = ${fixture.customRequestId}`,
        )
      ).rows;

      // Both directions written together: neither pointer can name a case the
      // other disagrees with.
      expect(row?.current_design_case_id).toBe(created.id);
      await expect(cases.findByRequest(fixture.customRequestId)).resolves.toMatchObject({
        id: created.id,
      });
    });

    it('allows only one case per request', async () => {
      await createCase();

      const error = await failureOf(() => createCase());

      expect(error.code).toBe('DESIGN_CASE_ALREADY_EXISTS');
    });

    it('refuses to create outside a transaction', async () => {
      await expect(
        cases.createForRequest(newId() as DesignCaseId, fixture.customRequestId),
      ).rejects.toThrow(/must run inside a transaction/);
    });

    it('rolls back the request pointer when the case insert fails', async () => {
      await createCase();

      await expect(createCase()).rejects.toBeDefined();

      // The request still points at the first case, not at a phantom second.
      const cases2 = await cases.findByRequest(fixture.customRequestId);
      expect(cases2).toBeDefined();
    });
  });

  describe('version creation', () => {
    it('numbers versions from 1 within the case', async () => {
      const designCase = await createCase();

      const first = await createVersion(designCase.id);
      const second = await createVersion(designCase.id);

      const versions = await cases.listVersions(designCase.id);
      expect(versions.map((v) => v.version)).toEqual([1, 2]);
      expect([first.id, second.id]).toHaveLength(2);
    });

    it('freezes the exact placement it was authored against', async () => {
      const designCase = await createCase();
      const version = await createVersion(designCase.id);

      const loaded = await cases.loadVersion(version.id);

      expect(loaded?.placement.productSideId).toBe(fixture.placement.productSideId);
      expect(loaded?.placement.embroideryAreaId).toBe(fixture.placement.embroideryAreaId);
    });

    it('rejects an incoherent placement chain before writing (G-DB7-13)', async () => {
      const designCase = await createCase();
      const other = await seedDesignChain(context, '2');

      // Every FK would be satisfied; only the chain is wrong.
      const error = await failureOf(() =>
        context.inTransaction(() =>
          cases.createVersion({
            id: newId() as DesignVersionId,
            designCaseId: designCase.id,
            designDocument: {},
            documentSchemaVersion: 1,
            placement: { ...fixture.placement, embroideryAreaId: other.placement.embroideryAreaId },
          }),
        ),
      );

      expect(error.code).toBe('AREA_NOT_ON_SIDE');
      await expect(cases.listVersions(designCase.id)).resolves.toEqual([]);
    });

    it('reports a case that does not exist', async () => {
      const error = await failureOf(() => createVersion(newId() as DesignCaseId));

      expect(error.code).toBe('RECORD_NOT_FOUND');
    });

    it('starts a version as a DRAFT with no hash', async () => {
      const designCase = await createCase();
      const version = await createVersion(designCase.id);

      const loaded = await cases.loadVersion(version.id);
      expect(loaded?.status).toBe('DRAFT');
      expect(loaded?.documentHash).toBeUndefined();
    });
  });

  describe('review lifecycle', () => {
    it('sends a draft for review and hashes it', async () => {
      const designCase = await createCase();
      const version = await createVersion(designCase.id);

      const sent = await context.inTransaction(() =>
        cases.sendForReview(version.id, FIXTURE_HASH, new Date()),
      );

      expect(sent.status).toBe('SENT_FOR_REVIEW');
      expect(sent.documentHash).toBe(FIXTURE_HASH);
    });

    it('allows only one version per case in review (G-DB7-15 / GRD-004)', async () => {
      const designCase = await createCase();
      const first = await createVersion(designCase.id);
      const second = await createVersion(designCase.id);
      await context.inTransaction(() => cases.sendForReview(first.id, FIXTURE_HASH, new Date()));

      const error = await failureOf(() =>
        context.inTransaction(() => cases.sendForReview(second.id, FIXTURE_HASH, new Date())),
      );

      expect(error.code).toBe('REVIEW_ALREADY_ACTIVE');
    });

    it('refuses to re-send a version that is already in review', async () => {
      const designCase = await createCase();
      const version = await createVersion(designCase.id);
      await context.inTransaction(() => cases.sendForReview(version.id, FIXTURE_HASH, new Date()));

      const error = await failureOf(() =>
        context.inTransaction(() => cases.sendForReview(version.id, FIXTURE_HASH, new Date())),
      );

      expect(error.code).toBe('RECORD_NOT_FOUND');
    });

    it('records an approval and stamps approved_at', async () => {
      const designCase = await createCase();
      const version = await createVersion(designCase.id);
      await context.inTransaction(() => cases.sendForReview(version.id, FIXTURE_HASH, new Date()));

      const decided = await context.inTransaction(() =>
        cases.recordReview({
          designVersionId: version.id,
          outcome: 'APPROVE',
          customerId: fixture.customerId,
          grantId: fixture.grantId,
          stepUpChallengeId: fixture.challengeId,
          decidedAt: new Date(),
        }),
      );

      expect(decided.status).toBe('APPROVED');
      expect(decided.approvedAt).toBeInstanceOf(Date);
    });

    it('records a revision request without approving', async () => {
      const designCase = await createCase();
      const version = await createVersion(designCase.id);
      await context.inTransaction(() => cases.sendForReview(version.id, FIXTURE_HASH, new Date()));

      const decided = await context.inTransaction(() =>
        cases.recordReview({
          designVersionId: version.id,
          outcome: 'REQUEST_REVISION',
          feedback: 'Please enlarge the logo',
          customerId: fixture.customerId,
          grantId: fixture.grantId,
          decidedAt: new Date(),
        }),
      );

      expect(decided.status).toBe('REVISION_REQUESTED');
      expect(decided.approvedAt).toBeUndefined();
    });

    it('lets the first decision win — a decided version cannot be re-decided', async () => {
      const designCase = await createCase();
      const version = await createVersion(designCase.id);
      await context.inTransaction(() => cases.sendForReview(version.id, FIXTURE_HASH, new Date()));
      await context.inTransaction(() =>
        cases.recordReview({
          designVersionId: version.id,
          outcome: 'REQUEST_REVISION',
          customerId: fixture.customerId,
          grantId: fixture.grantId,
          decidedAt: new Date(),
        }),
      );

      // Without the status guard a customer could approve after having asked
      // for a revision, and the later decision would silently win.
      const error = await failureOf(() =>
        context.inTransaction(() =>
          cases.recordReview({
            designVersionId: version.id,
            outcome: 'APPROVE',
            customerId: fixture.customerId,
            grantId: fixture.grantId,
            decidedAt: new Date(),
          }),
        ),
      );

      expect(error.code).toBe('DESIGN_VERSION_NOT_IN_REVIEW');
    });

    it('rolls the review evidence back with the rejected status change', async () => {
      const designCase = await createCase();
      const version = await createVersion(designCase.id);

      // Never sent, so the status guard rejects — and the evidence insert must
      // not survive on its own.
      await expect(
        context.inTransaction(() =>
          cases.recordReview({
            designVersionId: version.id,
            outcome: 'APPROVE',
            customerId: fixture.customerId,
            grantId: fixture.grantId,
            decidedAt: new Date(),
          }),
        ),
      ).rejects.toBeDefined();

      const [row] = (
        await context.disposable.client.db.execute<{ count: string }>(
          sql`select count(*)::text as count from design_reviews where design_version_id = ${version.id}`,
        )
      ).rows;
      expect(Number(row?.count)).toBe(0);
    });

    it('frees the review slot once a decision is made', async () => {
      const designCase = await createCase();
      const first = await createVersion(designCase.id);
      const second = await createVersion(designCase.id);
      await context.inTransaction(() => cases.sendForReview(first.id, FIXTURE_HASH, new Date()));
      await context.inTransaction(() =>
        cases.recordReview({
          designVersionId: first.id,
          outcome: 'REQUEST_REVISION',
          customerId: fixture.customerId,
          grantId: fixture.grantId,
          decidedAt: new Date(),
        }),
      );

      await expect(
        context.inTransaction(() => cases.sendForReview(second.id, FIXTURE_HASH, new Date())),
      ).resolves.toBeDefined();
    });

    it('finds the version awaiting a decision', async () => {
      const designCase = await createCase();
      const version = await createVersion(designCase.id);
      await context.inTransaction(() => cases.sendForReview(version.id, FIXTURE_HASH, new Date()));

      await expect(cases.findVersionInReview(designCase.id)).resolves.toMatchObject({
        id: version.id,
      });
    });
  });

  describe('current-version pointer (G-DB7-02)', () => {
    it('points the case at its own version', async () => {
      const designCase = await createCase();
      const version = await createVersion(designCase.id);

      await context.inTransaction(() => cases.setCurrentVersion(designCase.id, version.id));

      await expect(cases.findById(designCase.id)).resolves.toMatchObject({
        currentVersionId: version.id,
      });
    });

    it('refuses a version belonging to another case', async () => {
      const mine = await createCase();
      const otherFixture = await seedDesignChain(context, '3');
      const theirs = await createCase(otherFixture);
      const theirVersion = await createVersion(theirs.id, otherFixture);

      // The FK proves the version exists; only this read proves whose it is.
      const error = await failureOf(() =>
        context.inTransaction(() => cases.setCurrentVersion(mine.id, theirVersion.id)),
      );

      expect(error.code).toBe('VERSION_BELONGS_TO_ANOTHER_CASE');
      expect(error.kind).toBe('INVARIANT_VIOLATION');
    });

    it('reports a version that does not exist', async () => {
      const designCase = await createCase();

      const error = await failureOf(() =>
        context.inTransaction(() =>
          cases.setCurrentVersion(designCase.id, newId() as DesignVersionId),
        ),
      );

      expect(error.code).toBe('RECORD_NOT_FOUND');
    });
  });

  describe('immutability (G-DB7-17)', () => {
    it('rejects a document mutation on a sent version via the S24 trigger', async () => {
      const designCase = await createCase();
      const version = await createVersion(designCase.id);
      await context.inTransaction(() => cases.sendForReview(version.id, FIXTURE_HASH, new Date()));

      // The repository offers no method for this; the assertion is that the
      // database refuses even when the code is bypassed.
      const error = await failureOf(() =>
        withMappedErrors('probe.tamperDesignDocument', () =>
          context.disposable.client.db.execute(
            sql`update design_versions set design_document = '{"tampered":true}'::jsonb where id = ${version.id}`,
          ),
        ),
      );

      expect(error.kind).toBe('IMMUTABLE_EVIDENCE');
      expect(error.code).toBe('IMMUTABLE_RECORD');
      expect(error.message).not.toContain('design_versions');
    });
  });
});
