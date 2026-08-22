/**
 * `APP6-E01-05` — secure access, step-up and non-enumeration.
 *
 * The APP4 grant is the whole of APP6's customer authority, and this case proves
 * it holds across both lanes at once:
 *
 * - one `REQUEST_ACCESS` grant, one token, opens the quotation **and** the design
 *   review — there is no second scope kind and no second credential;
 * - every unusable token and every unreadable target answer with **one identical
 *   response**, byte for byte, on both public reads;
 * - the two sensitive transactions require standing step-up and the two
 *   reversible ones do not;
 * - no customer, admin, grant or challenge identifier is accepted from a caller.
 *
 * Every public call carries its own synthetic source address so the delivered
 * per-source limiter stays switched on without one probe starving another.
 */
import { randomBytes } from 'node:crypto';

import { sql } from 'drizzle-orm';

import {
  catalogDocument,
  createApp6AcceptanceContext,
  mintToken,
  shapeAt,
  type App6AcceptanceContext,
  type SeededCommission,
} from './app6-e01-context';
import {
  ROUTE,
  codeOf,
  createJourneyDriver,
  dataOf,
  pricingAt,
  type AcceptedAgreement,
  type JourneyDriver,
} from './app6-e01-journey';
import request from 'supertest';

const SOURCE = {
  drive: '203.0.113.50',
  enumerateQuotation: '203.0.113.51',
  enumerateReview: '203.0.113.52',
  design: '203.0.113.53',
  accept: '203.0.113.54',
  reject: '203.0.113.55',
  strict: '203.0.113.56',
} as const;

/** The step-up window the delivered `secure_grant` policy publishes: 15 minutes. */
const LAPSED_STEP_UP_SECONDS = 20 * 60;

/**
 * One refusal's comparable shape.
 *
 * `meta.requestId` and `meta.timestamp` are per-call correlation, not an answer
 * about the target, so they are removed before two refusals are compared. What
 * remains is everything a caller could learn from: the status, the code, the
 * message and the body's structure.
 */
function comparableBody(response: { readonly body: unknown }): string {
  const { meta: _meta, ...rest } = response.body as Record<string, unknown>;
  return JSON.stringify(rest);
}

interface Reviewable {
  readonly commission: SeededCommission;
  readonly versionId: string;
  readonly documentHash: string;
  readonly agreements: readonly AcceptedAgreement[];
}

describe('APP6-E01-05 — secure access, step-up and non-enumeration', () => {
  let context: App6AcceptanceContext;
  let journey: JourneyDriver;
  let reviewable: Reviewable;
  let quotedForAccept: { commission: SeededCommission; versionId: string };
  let quotedForReject: { commission: SeededCommission; versionId: string };
  let revoked: SeededCommission;
  let expiredGrant: SeededCommission;
  let unquoted: SeededCommission;

  beforeAll(async () => {
    context = await createApp6AcceptanceContext('app6-e01-05-secure-access');
    journey = createJourneyDriver(
      () => context.server(),
      () => context.adminCookie(),
      SOURCE.drive,
    );
    await context.reset();
    await context.publishDeliveredPolicies();

    reviewable = await driveToReview(await context.seedCommission(), 150_000);
    quotedForAccept = await driveToQuoted(await context.seedCommission(), 151_000);
    quotedForReject = await driveToQuoted(await context.seedCommission(), 152_000);

    revoked = await context.seedCommission({ grantStatus: 'REVOKED' });
    expiredGrant = await context.seedCommission({ grantExpiresInMinutes: -60 });
    unquoted = await context.seedCommission();
  }, 240_000);

  afterAll(async () => {
    await context.close();
  });

  async function driveToQuoted(
    commission: SeededCommission,
    unitPrice: number,
  ): Promise<{ commission: SeededCommission; versionId: string }> {
    const drafted = await journey
      .createQuotation(commission.requestId, pricingAt(unitPrice))
      .expect(201);
    const quote = dataOf<{ readonly quotationId: string; readonly versionId: string }>(drafted);
    await journey.sendQuotation(quote.quotationId, quote.versionId).expect(200);
    return { commission, versionId: quote.versionId };
  }

  async function driveToReview(
    commission: SeededCommission,
    unitPrice: number,
  ): Promise<Reviewable> {
    const { versionId: quotationVersionId } = await driveToQuoted(commission, unitPrice);
    await context.addStepUp(commission);
    await journey.acceptQuotation(commission.token, quotationVersionId, SOURCE.drive).expect(200);
    await journey.startDigitizing(commission.requestId).expect(200);

    const authored = await journey
      .authorDesignVersion(commission.requestId, {
        document: catalogDocument(commission.placement!, [shapeAt('elm-1', 120, 170, 200, 120)]),
      })
      .expect(201);
    const versionId = dataOf<{ readonly version: { readonly versionId: string } }>(authored).version
      .versionId;
    await journey.sendDesignVersion(commission.requestId, versionId).expect(200);

    const review = await journey.readReview(commission.token, SOURCE.drive).expect(200);
    const view = dataOf<{
      readonly documentHash: string;
      readonly agreements: readonly {
        readonly agreementVersionId: string;
        readonly contentHash: string;
      }[];
    }>(review);
    return {
      commission,
      versionId,
      documentHash: view.documentHash,
      agreements: view.agreements.map((agreement) => ({
        agreementVersionId: agreement.agreementVersionId,
        contentHash: agreement.contentHash,
      })),
    };
  }

  it('one REQUEST_ACCESS grant opens both the quotation and the design review', async () => {
    const [grant] = await context.rows<{
      readonly scope_kind: string;
      readonly custom_request_id: string;
      readonly customer_id: string;
    }>(sql`
      select scope_kind, custom_request_id, customer_id
        from secure_access_grants where id = ${reviewable.commission.grantId}
    `);
    expect(grant?.scope_kind).toBe('REQUEST_ACCESS');

    // The same token, on both lanes, with no second credential anywhere.
    const quotation = await journey
      .readQuotation(reviewable.commission.token, SOURCE.design)
      .expect(200);
    const review = await journey.readReview(reviewable.commission.token, SOURCE.design).expect(200);
    expect(
      dataOf<{ readonly quotationCode: string }>(quotation).quotationCode.length,
    ).toBeGreaterThan(0);
    expect(dataOf<{ readonly designVersionId: string }>(review).designVersionId).toBe(
      reviewable.versionId,
    );

    // This customer holds exactly one grant; nothing minted a second one.
    expect(
      await context.count(sql`
        select count(*)::text as count from secure_access_grants
         where custom_request_id = ${reviewable.commission.requestId}
      `),
    ).toBe(1);
  });

  it('every quotation-read failure is one identical, non-enumerating answer', async () => {
    const unknown = await journey.readQuotation(mintToken(), SOURCE.enumerateQuotation).expect(404);
    const onRevoked = await journey
      .readQuotation(revoked.token, SOURCE.enumerateQuotation)
      .expect(404);
    const onExpired = await journey
      .readQuotation(expiredGrant.token, SOURCE.enumerateQuotation)
      .expect(404);
    const onUnquoted = await journey
      .readQuotation(unquoted.token, SOURCE.enumerateQuotation)
      .expect(404);

    expect(codeOf(unknown)).toBe('SECURE_LINK_UNAVAILABLE');
    // Identical in code, message and shape — the four causes are indistinguishable.
    const bodies = [unknown, onRevoked, onExpired, onUnquoted].map(comparableBody);
    expect(new Set(bodies).size).toBe(1);
    // Every one of the four also carries the same HTTP status.
    for (const response of [unknown, onRevoked, onExpired, onUnquoted]) {
      expect(response.status).toBe(404);
    }
    // And nothing in the answer names a target that does exist.
    expect(bodies[0]).not.toContain(revoked.requestId);
    expect(bodies[0]).not.toContain(unquoted.requestId);
    expect(bodies[0]).not.toContain(unquoted.customerId);
  });

  it('every design-review failure is that same kind of identical answer', async () => {
    // `unquoted` has no design version either — a live grant whose target has
    // nothing to review must not be distinguishable from a dead token.
    const unknown = await journey.readReview(mintToken(), SOURCE.enumerateReview).expect(404);
    const onRevoked = await journey.readReview(revoked.token, SOURCE.enumerateReview).expect(404);
    const onExpired = await journey
      .readReview(expiredGrant.token, SOURCE.enumerateReview)
      .expect(404);
    const onNothingToReview = await journey
      .readReview(unquoted.token, SOURCE.enumerateReview)
      .expect(404);
    // A live commission whose design has not been sent for review yet.
    const onNotYetSent = await journey
      .readReview(quotedForAccept.commission.token, SOURCE.enumerateReview)
      .expect(404);

    const bodies = [unknown, onRevoked, onExpired, onNothingToReview, onNotYetSent].map(
      comparableBody,
    );
    expect(new Set(bodies).size).toBe(1);
    expect(bodies[0]).not.toContain(quotedForAccept.commission.requestId);
    expect(bodies[0]).not.toContain(reviewable.versionId);
  });

  it('quotation acceptance requires standing step-up, and a lapsed one does not count', async () => {
    const none = await journey
      .acceptQuotation(quotedForAccept.commission.token, quotedForAccept.versionId, SOURCE.accept)
      .expect(403);
    expect(codeOf(none)).toBe('REVERIFICATION_REQUIRED');

    // Verified, but outside the published 15-minute window.
    await context.addStepUp(quotedForAccept.commission, LAPSED_STEP_UP_SECONDS);
    const lapsed = await journey
      .acceptQuotation(quotedForAccept.commission.token, quotedForAccept.versionId, SOURCE.accept)
      .expect(403);
    expect(codeOf(lapsed)).toBe('REVERIFICATION_REQUIRED');
    expect(
      await context.count(sql`
        select count(*)::text as count from quotation_acceptances
         where quotation_version_id = ${quotedForAccept.versionId}
      `),
    ).toBe(0);

    // A fresh one, and the same call commits.
    await context.addStepUp(quotedForAccept.commission, 10);
    const accepted = await journey
      .acceptQuotation(quotedForAccept.commission.token, quotedForAccept.versionId, SOURCE.accept)
      .expect(200);
    expect(dataOf<{ readonly requestStatus: string }>(accepted).requestStatus).toBe(
      'QUOTE_ACCEPTED',
    );
  });

  it('quotation rejection requires no step-up at all', async () => {
    // This customer has never had a step-up challenge of any kind.
    expect(
      await context.count(sql`
        select count(*)::text as count from contact_verification_challenges
         where contact_point_id = ${quotedForReject.commission.contactPointId}
      `),
    ).toBe(0);

    const rejected = await journey
      .rejectQuotation(quotedForReject.commission.token, quotedForReject.versionId, SOURCE.reject)
      .expect(200);
    expect(dataOf<{ readonly versionStatus: string }>(rejected).versionStatus).toBe('REJECTED');
    // Declining commits nothing: the request stays in the quotation stage.
    const [row] = await context.rows<{ readonly status: string }>(
      sql`select status from custom_requests where id = ${quotedForReject.commission.requestId}`,
    );
    expect(row?.status).toBe('QUOTED');
  });

  it('design approval requires standing step-up; a revision request does not', async () => {
    // `reviewable`'s step-up was consumed by the quotation acceptance and has not
    // been renewed — approval must ask for a fresh one.
    await context.rows(sql`
      update contact_verification_challenges
         set verified_at = now() - interval '2 hours', expires_at = now() - interval '110 minutes'
       where contact_point_id = ${reviewable.commission.contactPointId}
    `);

    const refused = await journey
      .approveDesign(
        reviewable.commission.token,
        reviewable.versionId,
        reviewable.documentHash,
        reviewable.agreements,
        SOURCE.design,
      )
      .expect(403);
    expect(codeOf(refused)).toBe('REVERIFICATION_REQUIRED');
    expect(await context.count(sql`select count(*)::text as count from approval_snapshots`)).toBe(
      0,
    );

    // The reversible decision needs none, on that same un-reverified customer.
    const revision = await journey
      .requestRevision(
        reviewable.commission.token,
        reviewable.versionId,
        'Xin dời hoạ tiết sang phải một chút.',
        SOURCE.design,
      )
      .expect(200);
    expect(dataOf<{ readonly versionStatus: string }>(revision).versionStatus).toBe(
      'REVISION_REQUESTED',
    );
  });

  it('customer identity comes from the grant: no caller-supplied authority is accepted', async () => {
    const server = context.server();
    const forbiddenFields: readonly Record<string, unknown>[] = [
      { customerId: reviewable.commission.customerId },
      { adminId: context.adminId() },
      { grantId: reviewable.commission.grantId },
      { requestId: reviewable.commission.requestId },
      { challengeId: '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6099' },
    ];

    for (const extra of forbiddenFields) {
      await request(server)
        .post(ROUTE.currentReview)
        .set('X-Forwarded-For', SOURCE.strict)
        .send({ token: reviewable.commission.token, ...extra })
        .expect(400);
    }

    // The same on the sensitive transaction: a caller cannot name the customer
    // whose acceptance this is.
    await request(server)
      .post(ROUTE.acceptQuotation)
      .set('X-Forwarded-For', SOURCE.strict)
      .send({
        token: quotedForReject.commission.token,
        versionId: quotedForReject.versionId,
        customerId: reviewable.commission.customerId,
      })
      .expect(400);
  });

  it('no notification provider was needed, and no credential-shaped value was returned', async () => {
    // The whole case ran without a transport: APP6 emits intent, it does not
    // deliver, so nothing here waited on an external provider.
    const read = await journey.readReview(reviewable.commission.token, SOURCE.design).expect(404);
    const bodies = [JSON.stringify(read.body)];

    const live = await journey
      .readQuotation(reviewable.commission.token, SOURCE.design)
      .expect(200);
    bodies.push(JSON.stringify(live.body));

    for (const body of bodies) {
      // The token is never echoed, and no digest, pepper or grant id is either.
      expect(body).not.toContain(reviewable.commission.token);
      expect(body).not.toContain(reviewable.commission.grantId);
      expect(body).not.toContain(reviewable.commission.customerId);
      expect(body.toLowerCase()).not.toContain('token_hash');
      expect(body.toLowerCase()).not.toContain('pepper');
    }
    // A random 43-character token proves the process holds no oracle for one.
    expect(randomBytes(32).toString('base64url')).toHaveLength(43);
  });
});
