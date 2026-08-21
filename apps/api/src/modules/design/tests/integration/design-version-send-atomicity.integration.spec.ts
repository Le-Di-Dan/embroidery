/**
 * `APP6-B09` §14 — the send transaction is atomic, proved by breaking it.
 *
 * One failure injection, placed as late as it can meaningfully go. By the time
 * `DesignVersionSendRecorder.record` is called the transaction has already:
 *
 * ```text
 * moved the version DRAFT -> SENT_FOR_REVIEW, with its hash and its instant
 * marked the TR-LC08-05 predecessor SUPERSEDED
 * appended the TR-LC11-08 transition and moved the request to DESIGN_REVIEW
 * ```
 *
 * so a rollback that is only *partly* real would leave one of those behind. The
 * assertions below check every one of them, plus the two rows the recorder was
 * about to write.
 *
 * Everything else is the real application: the real routes, the real guards, the
 * real repositories and the real transaction boundary. Only the last
 * collaborator is replaced, and it is replaced with something that throws rather
 * than something that records — the rollback under test is the application's.
 *
 * One strong injection rather than many: a second one placed earlier could only
 * prove that fewer writes had happened before it.
 */
import request from 'supertest';
import { sql } from 'drizzle-orm';

import {
  catalogDocument,
  createDesignVersionContext,
  ROUTE,
  shapeAt,
  SIDE_GEOMETRY,
  type DesignVersionTestContext,
  type SeededPlacement,
} from './design-version-context';
import { DesignVersionSendModule } from '../../design-version-send.module';
import { DesignVersionSendRecorder } from '../../application/sending/design-version-send.recorder';

class ExplodingRecorder {
  record(): Promise<void> {
    return Promise.reject(new Error('Injected failure after every domain write.'));
  }
}

interface VersionRow {
  readonly status: string;
  readonly document_hash: string | null;
  readonly sent_at: Date | null;
  readonly superseded_at: Date | null;
}

describe('APP6-B09 send atomicity', () => {
  let context: DesignVersionTestContext;
  let placement: SeededPlacement;
  let customerId: string;

  beforeAll(async () => {
    context = await createDesignVersionContext(
      'app6-b09-atomicity',
      DesignVersionSendModule,
      (builder) => builder.overrideProvider(DesignVersionSendRecorder).useClass(ExplodingRecorder),
    );
  }, 120_000);

  afterAll(async () => {
    await context.close();
  });

  beforeEach(async () => {
    await context.reset();
    await context.seedAdminSession();
    customerId = await context.seedCustomer();
    placement = await context.seedPlacement();
  });

  const versionRow = async (id: string): Promise<VersionRow> => {
    const [row] = await context.rows<VersionRow>(
      sql`select status, document_hash, sent_at, superseded_at from design_versions where id = ${id}`,
    );
    return row as VersionRow;
  };

  it('rolls back every write when the last step of the transaction fails', async () => {
    const seeded = await context.seedRequest({ customerId, status: 'DESIGN_REVIEW', placement });
    const designCaseId = seeded.designCaseId as string;
    const sessionId = await context.seedSession({
      placement,
      submittedRequestId: seeded.requestId,
    });
    await context.rows(
      sql`update custom_requests set submitted_session_id = ${sessionId} where id = ${seeded.requestId}`,
    );

    const document = catalogDocument(placement, [
      shapeAt('shape-1', SIDE_GEOMETRY.areaXPx + 10, SIDE_GEOMETRY.areaYPx + 10, 50, 40),
    ]);
    const predecessorId = await context.seedVersion({
      designCaseId,
      version: 1,
      document,
      documentSchemaVersion: 1,
      placement,
      status: 'REVISION_REQUESTED',
      makeCurrent: false,
      physicalWidthMm: SIDE_GEOMETRY.physicalWidthMm,
      physicalHeightMm: SIDE_GEOMETRY.physicalHeightMm,
    });
    const versionId = await context.seedVersion({
      designCaseId,
      version: 2,
      document,
      documentSchemaVersion: 1,
      placement,
      parentVersionId: predecessorId,
      physicalWidthMm: SIDE_GEOMETRY.physicalWidthMm,
      physicalHeightMm: SIDE_GEOMETRY.physicalHeightMm,
    });

    const [caseBefore] = await context.rows<{ current_version_id: string }>(
      sql`select current_version_id from design_cases where id = ${designCaseId}`,
    );

    // The platform filter sanitises the injected failure into a 500 — which is
    // the right answer for a defect, and is not shaped into a business refusal.
    await request(context.server())
      .post(ROUTE.send(seeded.requestId, versionId))
      .set('Cookie', context.adminCookie())
      .expect(500);

    // The version never left DRAFT, and gained neither a hash nor an instant.
    const version = await versionRow(versionId);
    expect(version.status).toBe('DRAFT');
    expect(version.document_hash).toBeNull();
    expect(version.sent_at).toBeNull();

    // The TR-LC08-05 predecessor was not superseded.
    const predecessor = await versionRow(predecessorId);
    expect(predecessor.status).toBe('REVISION_REQUESTED');
    expect(predecessor.superseded_at).toBeNull();

    // The design case pointer is exactly where it was.
    const [caseAfter] = await context.rows<{ current_version_id: string }>(
      sql`select current_version_id from design_cases where id = ${designCaseId}`,
    );
    expect(caseAfter?.current_version_id).toBe(caseBefore?.current_version_id);

    // The request never moved, and no transition row survived.
    const [requestRow] = await context.rows<{ status: string }>(
      sql`select status from custom_requests where id = ${seeded.requestId}`,
    );
    expect(requestRow?.status).toBe('DESIGN_REVIEW');
    expect(
      await context.count(
        sql`select count(*)::text as count from custom_request_transitions
             where custom_request_id = ${seeded.requestId}`,
      ),
    ).toBe(0);

    // And nothing was recorded or announced.
    expect(
      await context.count(
        sql`select count(*)::text as count from audit_events where action = 'design_version.sent'`,
      ),
    ).toBe(0);
    expect(
      await context.count(
        sql`select count(*)::text as count from outbox_events
             where event_type = 'design.review-ready'`,
      ),
    ).toBe(0);
  });

  it('also rolls back the DIGITIZING projection, so no request is left mid-move', async () => {
    const seeded = await context.seedRequest({ customerId, status: 'DIGITIZING', placement });
    const designCaseId = seeded.designCaseId as string;
    const sessionId = await context.seedSession({
      placement,
      submittedRequestId: seeded.requestId,
    });
    await context.rows(
      sql`update custom_requests set submitted_session_id = ${sessionId} where id = ${seeded.requestId}`,
    );
    const versionId = await context.seedVersion({
      designCaseId,
      version: 1,
      document: catalogDocument(placement),
      documentSchemaVersion: 1,
      placement,
      physicalWidthMm: SIDE_GEOMETRY.physicalWidthMm,
      physicalHeightMm: SIDE_GEOMETRY.physicalHeightMm,
    });

    await request(context.server())
      .post(ROUTE.send(seeded.requestId, versionId))
      .set('Cookie', context.adminCookie())
      .expect(500);

    const [requestRow] = await context.rows<{ status: string }>(
      sql`select status from custom_requests where id = ${seeded.requestId}`,
    );
    expect(requestRow?.status).toBe('DIGITIZING');
    expect(
      await context.count(
        sql`select count(*)::text as count from custom_request_transitions
             where custom_request_id = ${seeded.requestId}`,
      ),
    ).toBe(0);
    expect((await versionRow(versionId)).status).toBe('DRAFT');
  });
});
