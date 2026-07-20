/**
 * AGG-11 Approval Snapshot persistence against a real PostgreSQL instance
 * (DB7-CP4).
 *
 * TBL-031..TBL-033 and guards G-DB7-14 (GRD-007, exact version + hash),
 * G-DB7-16 (GRD-008, terms captured) and G-DB7-13 (placement chain).
 *
 * These are the tightest guards in the system: everything downstream — the
 * order, the production job, the machine file — is authorised by this row.
 */
import { isPersistenceError, newId, withMappedErrors } from '@embroidery/database';
import type { PersistenceError } from '@embroidery/database';
import { sql } from 'drizzle-orm';

import { createPersistenceTestContext } from '../../../../tests/integration/persistence-test-context';
import type { PersistenceTestContext } from '../../../../tests/integration/persistence-test-context';
import { DesignModule } from '../../design.module';
import { APPROVAL_SNAPSHOT_REPOSITORY } from '../../domain/repositories/approval-snapshot.repository';
import type {
  ApprovalSnapshotId,
  ApprovalSnapshotRepository,
  CreateApprovalSnapshotInput,
} from '../../domain/repositories/approval-snapshot.repository';
import { DESIGN_CASE_REPOSITORY } from '../../domain/repositories/design-case.repository';
import type {
  DesignCaseId,
  DesignCaseRepository,
  DesignVersionId,
} from '../../domain/repositories/design-case.repository';
import { AGREEMENT_HASH, FIXTURE_HASH, seedDesignChain } from './design-fixture';
import type { DesignFixture } from './design-fixture';

describe('approval snapshot persistence (integration)', () => {
  let context: PersistenceTestContext;
  let approvals: ApprovalSnapshotRepository;
  let cases: DesignCaseRepository;
  let fixture: DesignFixture;

  beforeAll(async () => {
    context = await createPersistenceTestContext('cp4-approval', [DesignModule]);
    approvals = context.get(APPROVAL_SNAPSHOT_REPOSITORY);
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

  /** A version sent for review, ready to approve. */
  async function seedSentVersion(target = fixture): Promise<DesignVersionId> {
    const caseId = newId() as DesignCaseId;
    const versionId = newId() as DesignVersionId;

    await context.inTransaction(async () => {
      await cases.createForRequest(caseId, target.customRequestId);
      await cases.createVersion({
        id: versionId,
        designCaseId: caseId,
        designDocument: { elements: [] },
        documentSchemaVersion: 1,
        placement: target.placement,
      });
      await cases.sendForReview(versionId, FIXTURE_HASH, new Date());
    });

    return versionId;
  }

  function approvalInput(
    versionId: DesignVersionId,
    overrides: Partial<CreateApprovalSnapshotInput> = {},
    target = fixture,
  ): CreateApprovalSnapshotInput {
    return {
      id: newId() as ApprovalSnapshotId,
      designVersionId: versionId,
      submittedDocumentHash: FIXTURE_HASH,
      customerId: target.customerId,
      grantId: target.grantId,
      stepUpChallengeId: target.challengeId,
      productName: 'Fixture Tee',
      variantLabel: 'Black / M',
      sideName: 'Front',
      areaName: 'Chest',
      quantityTotal: 25,
      contactEmail: 'approver@example.com',
      threadColors: [
        { position: 1, colorCode: '1801', colorName: 'Red' },
        { position: 2, colorCode: '1902', colorName: 'Navy' },
      ],
      agreementAcceptances: [
        {
          agreementVersionId: target.agreementVersionId,
          agreementType: 'TERMS_1',
          contentHash: AGREEMENT_HASH,
        },
      ],
      approvedAt: new Date(),
      ...overrides,
    };
  }

  describe('freezing an approval', () => {
    it('captures the version, its chain and its children', async () => {
      const versionId = await seedSentVersion();
      const input = approvalInput(versionId);

      const snapshot = await context.inTransaction(() => approvals.createFromVersion(input));

      expect(snapshot.documentHash).toBe(FIXTURE_HASH);
      // The chain is copied from the version, not taken from the caller.
      expect(snapshot.customRequestId).toBe(fixture.customRequestId);
      expect(snapshot.placement.embroideryAreaId).toBe(fixture.placement.embroideryAreaId);
      await expect(approvals.listThreadColors(snapshot.id)).resolves.toHaveLength(2);
      await expect(approvals.listAgreementAcceptances(snapshot.id)).resolves.toHaveLength(1);
    });

    it('freezes denormalised labels so a later rename cannot rewrite history', async () => {
      const versionId = await seedSentVersion();
      const snapshot = await context.inTransaction(() =>
        approvals.createFromVersion(approvalInput(versionId)),
      );

      await context.disposable.client.db.execute(
        sql`update products set name = 'Renamed Product' where id = ${fixture.placement.productId}`,
      );

      await expect(approvals.findById(snapshot.id)).resolves.toMatchObject({
        productName: 'Fixture Tee',
      });
    });

    it('allows only one approval per design version', async () => {
      const versionId = await seedSentVersion();
      await context.inTransaction(() => approvals.createFromVersion(approvalInput(versionId)));

      const error = await failureOf(() =>
        context.inTransaction(() => approvals.createFromVersion(approvalInput(versionId))),
      );

      expect(error.code).toBe('DESIGN_VERSION_ALREADY_APPROVED');
    });

    it('refuses to run outside a transaction', async () => {
      const versionId = await seedSentVersion();

      await expect(approvals.createFromVersion(approvalInput(versionId))).rejects.toThrow(
        /must run inside a transaction/,
      );
    });
  });

  describe('exact version and hash binding (G-DB7-14 / GRD-007)', () => {
    it('rejects a submitted hash that does not match the stored one', async () => {
      const versionId = await seedSentVersion();

      // A different hash means the document changed after the customer saw it;
      // approving would bind them to artwork they never reviewed.
      const error = await failureOf(() =>
        context.inTransaction(() =>
          approvals.createFromVersion(
            approvalInput(versionId, { submittedDocumentHash: `sha256:${'e'.repeat(64)}` }),
          ),
        ),
      );

      expect(error.code).toBe('APPROVAL_VERSION_MISMATCH');
      expect(error.kind).toBe('INVARIANT_VIOLATION');
    });

    it('rejects a version that was never sent for review, and so has no hash', async () => {
      const caseId = newId() as DesignCaseId;
      const versionId = newId() as DesignVersionId;
      await context.inTransaction(async () => {
        await cases.createForRequest(caseId, fixture.customRequestId);
        await cases.createVersion({
          id: versionId,
          designCaseId: caseId,
          designDocument: {},
          documentSchemaVersion: 1,
          placement: fixture.placement,
        });
      });

      const error = await failureOf(() =>
        context.inTransaction(() => approvals.createFromVersion(approvalInput(versionId))),
      );

      expect(error.code).toBe('DESIGN_VERSION_NOT_APPROVABLE');
    });

    it('reports a version that does not exist', async () => {
      const error = await failureOf(() =>
        context.inTransaction(() =>
          approvals.createFromVersion(approvalInput(newId() as DesignVersionId)),
        ),
      );

      expect(error.code).toBe('RECORD_NOT_FOUND');
    });
  });

  describe('agreement capture (G-DB7-16 / GRD-008)', () => {
    it('rejects an approval that captured no terms', async () => {
      const versionId = await seedSentVersion();

      // An approval with no captured terms is not evidence the customer
      // accepted any.
      const error = await failureOf(() =>
        context.inTransaction(() =>
          approvals.createFromVersion(approvalInput(versionId, { agreementAcceptances: [] })),
        ),
      );

      expect(error.code).toBe('TERMS_NOT_ACCEPTED');
    });

    it('records the exact content hash the customer accepted', async () => {
      const versionId = await seedSentVersion();

      const snapshot = await context.inTransaction(() =>
        approvals.createFromVersion(approvalInput(versionId)),
      );

      const acceptances = await approvals.listAgreementAcceptances(snapshot.id);
      expect(acceptances[0]?.contentHash).toBe(AGREEMENT_HASH);
    });

    it('rejects an agreement version that does not exist', async () => {
      const versionId = await seedSentVersion();

      const error = await failureOf(() =>
        context.inTransaction(() =>
          approvals.createFromVersion(
            approvalInput(versionId, {
              agreementAcceptances: [
                {
                  agreementVersionId: newId(),
                  agreementType: 'TERMS_1',
                  contentHash: AGREEMENT_HASH,
                },
              ],
            }),
          ),
        ),
      );

      expect(error.kind).toBe('INVALID_REFERENCE');
    });

    it('rolls the whole snapshot back when an acceptance fails', async () => {
      const versionId = await seedSentVersion();
      const input = approvalInput(versionId, {
        agreementAcceptances: [
          { agreementVersionId: newId(), agreementType: 'TERMS_1', contentHash: AGREEMENT_HASH },
        ],
      });

      await expect(
        context.inTransaction(() => approvals.createFromVersion(input)),
      ).rejects.toBeDefined();

      // A snapshot without its acceptances would claim an approval that never
      // captured the terms.
      await expect(approvals.findById(input.id)).resolves.toBeUndefined();
      await expect(approvals.findByDesignVersion(versionId)).resolves.toBeUndefined();
    });

    it('rejects the same agreement version captured twice', async () => {
      const versionId = await seedSentVersion();

      const error = await failureOf(() =>
        context.inTransaction(() =>
          approvals.createFromVersion(
            approvalInput(versionId, {
              agreementAcceptances: [
                {
                  agreementVersionId: fixture.agreementVersionId,
                  agreementType: 'TERMS_1',
                  contentHash: AGREEMENT_HASH,
                },
                {
                  agreementVersionId: fixture.agreementVersionId,
                  agreementType: 'TERMS_1',
                  contentHash: AGREEMENT_HASH,
                },
              ],
            }),
          ),
        ),
      );

      expect(error.kind).toBe('CONFLICT');
    });
  });

  describe('thread colours', () => {
    it('keeps them in position order', async () => {
      const versionId = await seedSentVersion();
      const snapshot = await context.inTransaction(() =>
        approvals.createFromVersion(approvalInput(versionId)),
      );

      const colors = await approvals.listThreadColors(snapshot.id);
      expect(colors.map((c) => c.position)).toEqual([1, 2]);
    });

    it('rejects a duplicate position', async () => {
      const versionId = await seedSentVersion();

      const error = await failureOf(() =>
        context.inTransaction(() =>
          approvals.createFromVersion(
            approvalInput(versionId, {
              threadColors: [
                { position: 1, colorCode: 'A' },
                { position: 1, colorCode: 'B' },
              ],
            }),
          ),
        ),
      );

      expect(error.kind).toBe('CONFLICT');
    });

    it('accepts an approval with no thread colours', async () => {
      const versionId = await seedSentVersion();

      const snapshot = await context.inTransaction(() =>
        approvals.createFromVersion(approvalInput(versionId, { threadColors: [] })),
      );

      await expect(approvals.listThreadColors(snapshot.id)).resolves.toEqual([]);
    });
  });

  describe('immutability', () => {
    it('rejects a mutation of the frozen approval via the S24 trigger', async () => {
      const versionId = await seedSentVersion();
      const snapshot = await context.inTransaction(() =>
        approvals.createFromVersion(approvalInput(versionId)),
      );

      const error = await failureOf(() =>
        withMappedErrors('probe.tamperApproval', () =>
          context.disposable.client.db.execute(
            sql`update approval_snapshots set document_hash = 'sha256:${sql.raw('f'.repeat(64))}' where id = ${snapshot.id}`,
          ),
        ),
      );

      expect(error.kind).toBe('IMMUTABLE_EVIDENCE');
    });

    it('rejects deleting a frozen approval', async () => {
      const versionId = await seedSentVersion();
      const snapshot = await context.inTransaction(() =>
        approvals.createFromVersion(approvalInput(versionId)),
      );

      const error = await failureOf(() =>
        withMappedErrors('probe.deleteApproval', () =>
          context.disposable.client.db.execute(
            sql`delete from approval_snapshots where id = ${snapshot.id}`,
          ),
        ),
      );

      expect(error.kind).toBe('IMMUTABLE_EVIDENCE');
    });
  });
});
