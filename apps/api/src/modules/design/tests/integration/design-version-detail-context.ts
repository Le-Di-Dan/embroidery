/**
 * Extra seeding for the `APP6-A02` exact-version detail suite.
 *
 * A **companion** to `design-version-context.ts`, not a change to it. That
 * harness already stands up everything this suite needs to reach a version — an
 * Admin session, a catalog chain, a submitted Design Session, a request and its
 * design case — and it takes the feature module as a parameter, so A02 boots
 * `DesignVersionDetailReadModule` through the same code path B08 and B09 use.
 *
 * What A02 adds is decision and approval evidence, which neither predecessor
 * needed to seed. Adding it *there* would have changed source `APP6-B08` and
 * `APP6-B09` own, and their suites would then have had to be re-run to prove
 * their own fixtures still meant what they meant. Adding it here changes
 * nothing they own, which is why neither suite is part of this checkpoint's
 * validation set.
 *
 * Everything is written through the context's own `rows()` SQL seam, so this
 * file holds no database handle of its own.
 *
 * ### Why the evidence is seeded rather than driven through B10/B11
 *
 * The route under test is a read. Driving `APP6-B11`'s public decision surface
 * to produce a review would boot the customer decision module inside a suite
 * whose whole claim is that the Admin GET's injector cannot decide anything —
 * and the suite would then fail for B11's reasons rather than A02's. It is also
 * the only way to stand up an `APPROVED` version with a complete snapshot on the
 * customer-owned branch, which no single delivered route produces.
 *
 * Test-only. Every credential-shaped value here is synthetic; no `.env` file is
 * read or written and no real code, token or secret is minted.
 */
import { randomBytes } from 'node:crypto';

import { newId } from '@embroidery/database';
import { sql } from 'drizzle-orm';

import { GLOBAL_ROUTE_PREFIX } from '../../../../bootstrap/api-application';
import type { DesignVersionTestContext } from './design-version-context';

/** The exact-version detail route, under the global API prefix. */
export function detailRoute(requestId: string, versionId: string): string {
  return `/${GLOBAL_ROUTE_PREFIX}/admin/custom-requests/${requestId}/design-versions/${versionId}`;
}

export interface SeededCustomerEvidence {
  readonly customerId: string;
  readonly contactPointId: string;
  /** The normalized value the snapshot freezes, so a test can assert the mask. */
  readonly contactEmail: string;
  readonly contactPhone: string;
  readonly grantId: string;
  readonly stepUpChallengeId: string;
}

/**
 * A customer with one verified contact of each kind, a grant and a verified
 * step-up challenge.
 *
 * The four rows exist because `design_reviews` and `approval_snapshots` both
 * carry `restrict` foreign keys onto them. They are the evidence a real decision
 * would have been recorded against; nothing under test reads any of their
 * identifiers, and the point of several assertions is that none of them reaches
 * the response.
 */
export async function seedCustomerEvidence(
  context: DesignVersionTestContext,
  customerId: string,
  requestId: string,
): Promise<SeededCustomerEvidence> {
  const contactPointId = newId();
  const phonePointId = newId();
  const grantId = newId();
  const stepUpChallengeId = newId();
  const contactEmail = `mai.${randomBytes(4).toString('hex')}@vidu.com`;
  const contactPhone = '+84912345678';

  await context.rows(sql`
    insert into customer_contact_points
      (id, customer_id, contact_kind, normalized_value, display_value, is_primary,
       verified_at, verified_source)
    values (${contactPointId}, ${customerId}, 'EMAIL', ${contactEmail}, ${contactEmail}, true,
            now(), 'APP6-A02 suite fixture.')
  `);
  await context.rows(sql`
    insert into customer_contact_points
      (id, customer_id, contact_kind, normalized_value, display_value, is_primary,
       verified_at, verified_source)
    values (${phonePointId}, ${customerId}, 'PHONE', ${contactPhone}, ${contactPhone}, false,
            now(), 'APP6-A02 suite fixture.')
  `);
  await context.rows(sql`
    insert into contact_verification_challenges
      (id, contact_point_id, contact_kind, normalized_value, purpose, code_hash,
       status, expires_at, verified_at)
    values (${stepUpChallengeId}, ${contactPointId}, 'EMAIL', ${contactEmail}, 'STEP_UP',
            -- A synthetic digest. No real code is minted, hashed or stored: no
            -- path under test reads it, and a test must not put a
            -- credential-shaped value anywhere durable.
            ${`test-step-up-digest-${stepUpChallengeId}`},
            'VERIFIED', now() + interval '10 minutes', now())
  `);
  await context.rows(sql`
    insert into secure_access_grants
      (id, customer_id, custom_request_id, token_hash, scope_kind, status, expires_at)
    values (${grantId}, ${customerId}, ${requestId},
            ${`test-grant-digest-${grantId}`}, 'REQUEST_ACCESS', 'ACTIVE',
            now() + interval '7 days')
  `);

  return { customerId, contactPointId, contactEmail, contactPhone, grantId, stepUpChallengeId };
}

export interface SeedReviewOptions {
  readonly versionId: string;
  readonly outcome: 'APPROVE' | 'REQUEST_REVISION';
  readonly feedback?: string | undefined;
  readonly decidedAt: Date;
  readonly evidence: SeededCustomerEvidence;
}

/** One recorded customer decision, exactly as `APP6-B11` would have written it. */
export async function seedReview(
  context: DesignVersionTestContext,
  options: SeedReviewOptions,
): Promise<string> {
  // `design_reviews.id` is a sequence column, so it is not supplied: PostgreSQL
  // rejects a non-DEFAULT value for it outright.
  const [row] = await context.rows<{ id: string }>(sql`
    insert into design_reviews
      (design_version_id, outcome, feedback, customer_id, grant_id, step_up_challenge_id,
       decided_at)
    values (${options.versionId}, ${options.outcome}, ${options.feedback ?? null},
            ${options.evidence.customerId}, ${options.evidence.grantId},
            ${options.outcome === 'APPROVE' ? options.evidence.stepUpChallengeId : null},
            ${options.decidedAt})
    returning id
  `);
  return String(row?.id);
}

export interface SeedApprovalOptions {
  readonly versionId: string;
  readonly designCaseId: string;
  readonly requestId: string;
  readonly documentHash: string;
  readonly evidence: SeededCustomerEvidence;
  /** Catalog branch: the frozen quartet. Omit for the customer-owned branch. */
  readonly placement?: {
    readonly productId: string;
    readonly productVariantId: string;
    readonly productSideId: string;
    readonly embroideryAreaId: string;
  };
  readonly customerOwnedProductId?: string | undefined;
  readonly productName: string;
  readonly variantLabel?: string | undefined;
  readonly sideName: string;
  readonly areaName: string;
  readonly physicalWidthMm: string;
  readonly physicalHeightMm: string;
  readonly quantityTotal: number;
  readonly approvedAt: Date;
  /** The agreement acceptances `GRD-008` captured. */
  readonly agreements: readonly { readonly agreementType: string; readonly contentHash: string }[];
  /** Frozen contact copies. Defaults to the seeded evidence's own values. */
  readonly contactName?: string | undefined;
  readonly freezeContacts?: boolean;
}

/**
 * One frozen Approval Snapshot with its agreement acceptances.
 *
 * The frozen labels are supplied by the caller rather than read from Catalog, so
 * a test can seed a snapshot whose `product_name` deliberately **differs** from
 * the live product row — which is the only way to prove the response reads
 * snapshot truth rather than current truth.
 */
export async function seedApproval(
  context: DesignVersionTestContext,
  options: SeedApprovalOptions,
): Promise<string> {
  const snapshotId = newId();
  const freeze = options.freezeContacts !== false;

  await context.rows(sql`
    insert into approval_snapshots
      (id, design_version_id, design_case_id, custom_request_id, customer_id, document_hash,
       product_id, product_variant_id, product_side_id, embroidery_area_id,
       customer_owned_product_id, product_name, variant_label, side_name, area_name,
       physical_width_mm, physical_height_mm, quantity_total, contact_name, contact_email,
       contact_phone, grant_id, step_up_challenge_id, approved_at)
    values (${snapshotId}, ${options.versionId}, ${options.designCaseId}, ${options.requestId},
            ${options.evidence.customerId}, ${options.documentHash},
            ${options.placement?.productId ?? null},
            ${options.placement?.productVariantId ?? null},
            ${options.placement?.productSideId ?? null},
            ${options.placement?.embroideryAreaId ?? null},
            ${options.customerOwnedProductId ?? null},
            ${options.productName}, ${options.variantLabel ?? null},
            ${options.sideName}, ${options.areaName},
            ${options.physicalWidthMm}, ${options.physicalHeightMm}, ${options.quantityTotal},
            ${freeze ? (options.contactName ?? 'Nguyễn Thị Mai') : null},
            ${freeze ? options.evidence.contactEmail : null},
            ${freeze ? options.evidence.contactPhone : null},
            ${options.evidence.grantId}, ${options.evidence.stepUpChallengeId},
            ${options.approvedAt})
  `);

  for (const agreement of options.agreements) {
    const agreementVersionId = await ensureAgreementVersion(
      context,
      agreement.agreementType,
      agreement.contentHash,
    );
    await context.rows(sql`
      insert into approval_snapshot_agreement_acceptances
        (approval_snapshot_id, agreement_version_id, agreement_type, content_hash, accepted_at)
      values (${snapshotId}, ${agreementVersionId}, ${agreement.agreementType},
              ${agreement.contentHash}, ${options.approvedAt})
    `);
  }

  return snapshotId;
}

/**
 * A published agreement version of the given type, created on first use.
 *
 * `approval_snapshot_agreement_acceptances.agreement_version_id` carries a real
 * foreign key onto `agreement_versions` (REL-054), so an acceptance cannot be
 * seeded against an invented id — which is the constraint doing its job: an
 * acceptance is evidence that a *published* version was shown.
 *
 * `agreements.agreement_type` is unique (CST-044), so the container is upserted
 * and the version number is derived from what already exists. That makes the
 * helper safe to call twice for `PAYMENT_POLICY` inside one test, and safe
 * across tests after a truncate.
 *
 * These rows exist only to satisfy the foreign key. **Nothing under test reads
 * them** — `APP6-A02`'s approval projection reads the frozen `agreement_type`
 * and `content_hash` off the acceptance row itself, never through this join,
 * which is exactly the claim the suite makes when it asserts the published
 * agreement fields are three and the version integer is not among them.
 */
async function ensureAgreementVersion(
  context: DesignVersionTestContext,
  agreementType: string,
  contentHash: string,
): Promise<string> {
  const agreementId = newId();
  await context.rows(sql`
    insert into agreements (id, agreement_type, name)
    values (${agreementId}, ${agreementType}, ${`Chính sách ${agreementType}`})
    on conflict (agreement_type) do nothing
  `);
  const [existing] = await context.rows<{ id: string }>(
    sql`select id from agreements where agreement_type = ${agreementType}`,
  );
  const ownerId = String(existing?.id);

  const nextVersion = await context.count(
    sql`select count(*) from agreement_versions where agreement_id = ${ownerId}`,
  );
  const versionId = newId();
  await context.rows(sql`
    insert into agreement_versions
      (id, agreement_id, version, status, content, content_hash, language, effective_from,
       published_at)
    values (${versionId}, ${ownerId}, ${nextVersion + 1}, 'PUBLISHED',
            ${`Nội dung ${agreementType} (bản thử nghiệm).`}, ${contentHash}, 'vi',
            now() - interval '1 day', now() - interval '1 day')
  `);
  return versionId;
}
