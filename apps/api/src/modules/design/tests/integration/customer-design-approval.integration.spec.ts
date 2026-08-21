/**
 * `APP6-B11` — what a committed `TR-LC08-04` approval actually writes, against a
 * real PostgreSQL instance.
 *
 * This suite is the positive half: the decision record, the immutable Approval
 * Snapshot on **both** placement branches, its thread-colour and agreement
 * children, the `TR-LC11-09` system projection, the audit row and the `SE-005`
 * hand-off. The refusals are `customer-design-approval-guards`, and replay and
 * rollback are `customer-design-approval-idempotency`.
 */
import { sql } from 'drizzle-orm';

import {
  COP_AREA_LABEL,
  COP_SIDE_LABEL,
  EXPECTED_THREAD_COLORS,
  createDesignDecisionContext,
} from './customer-design-decision-context';
import type {
  DesignDecisionTestContext,
  SeededPlacement,
} from './customer-design-decision-context';
import { approvalBody, seedApprovable, writeCountsFor } from './customer-design-approval-fixtures';

describe('APP6-B11 design approval — the committed evidence (integration)', () => {
  let context: DesignDecisionTestContext;
  let placement: SeededPlacement;

  beforeAll(async () => {
    context = await createDesignDecisionContext('app6-b11-approve');
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

  describe('the approval transaction', () => {
    it('records the decision, freezes the snapshot and projects the request', async () => {
      const fixture = await seedApprovable(context, placement);

      const view = await context.asRequest(() => context.approval.approve(approvalBody(fixture)));

      expect(view.versionStatus).toBe('APPROVED');
      expect(view.requestStatus).toBe('APPROVED');
      expect(view.documentHash).toBe(fixture.documentHash);
      expect(view.replayed).toBe(false);

      expect(await writeCountsFor(context, fixture.target, fixture.versionId)).toEqual({
        reviews: 1,
        snapshots: 1,
        // Exactly the two required types, frozen — never one, never three.
        acceptances: 2,
        transitions: 1,
        audits: 1,
        events: 1,
        completedClaims: 1,
      });
    });

    it('records the truthful APPROVE outcome with its server-derived step-up', async () => {
      const fixture = await seedApprovable(context, placement);
      const [challenge] = await context.rows<{ readonly id: string }>(
        sql`select id from contact_verification_challenges
             where contact_point_id = ${fixture.target.contactPointId}`,
      );

      await context.asRequest(() => context.approval.approve(approvalBody(fixture)));

      const [review] = await context.rows<{
        readonly outcome: string;
        readonly feedback: string | null;
        readonly customer_id: string;
        readonly grant_id: string;
        readonly step_up_challenge_id: string | null;
      }>(
        sql`select outcome, feedback, customer_id, grant_id, step_up_challenge_id
              from design_reviews where design_version_id = ${fixture.versionId}`,
      );
      expect(review?.outcome).toBe('APPROVE');
      // An approval carries no feedback; the column exists for the other outcome.
      expect(review?.feedback).toBeNull();
      // Both actor facts come from the grant, never from a caller.
      expect(review?.customer_id).toBe(fixture.target.customerId);
      expect(review?.grant_id).toBe(fixture.target.grantId);
      // The challenge the fixture actually verified — no challenge id was ever
      // accepted from a body, and this is the only one that stood.
      expect(review?.step_up_challenge_id).toBe(challenge?.id);
    });

    it('projects TR-LC11-09 with a SYSTEM actor, never the customer', async () => {
      const fixture = await seedApprovable(context, placement);

      await context.asRequest(() => context.approval.approve(approvalBody(fixture)));

      const transitions = await context.rows<{
        readonly from_status: string;
        readonly to_status: string;
        readonly actor_kind: string;
      }>(
        sql`select from_status, to_status, actor_kind from custom_request_transitions
             where custom_request_id = ${fixture.target.requestId}`,
      );
      expect(transitions).toHaveLength(1);
      expect(transitions[0]).toMatchObject({
        from_status: 'DESIGN_REVIEW',
        to_status: 'APPROVED',
        // The move is a consequence of the approval committing, not a command
        // anyone issued — and no field in the body could have asked for it.
        actor_kind: 'SYSTEM',
      });
    });

    it('appends one critical audit row carrying refs and no content', async () => {
      const fixture = await seedApprovable(context, placement);

      const view = await context.asRequest(() => context.approval.approve(approvalBody(fixture)));

      const [audit] = await context.rows<{
        readonly actor_kind: string;
        readonly target_kind: string;
        readonly target_id: string;
        readonly summary: Record<string, unknown>;
      }>(
        sql`select actor_kind, target_kind, target_id, summary from audit_events
             where action = 'design_version.approved'`,
      );
      expect(audit).toMatchObject({
        actor_kind: 'CUSTOMER',
        target_kind: 'DESIGN_VERSION',
        target_id: fixture.versionId,
      });
      expect(audit?.summary).toMatchObject({
        approvalSnapshotId: view.approvalSnapshotId,
        documentHash: fixture.documentHash,
        toStatus: 'APPROVED',
      });

      // "Document content never in audit (hash ref only)", and no agreement
      // prose, no token and no contact.
      const summary = JSON.stringify(audit?.summary ?? {});
      for (const forbidden of [
        'elements',
        '#1d4ed8',
        fixture.target.token,
        fixture.target.contactValue,
      ]) {
        expect(summary).not.toContain(forbidden);
      }
    });

    it('emits design.approved exactly once, on the Approval Snapshot, with no secret', async () => {
      const fixture = await seedApprovable(context, placement);

      const view = await context.asRequest(() => context.approval.approve(approvalBody(fixture)));

      const events = await context.rows<{
        readonly aggregate_kind: string;
        readonly aggregate_id: string;
        readonly status: string;
        readonly payload: Record<string, unknown>;
      }>(sql`select aggregate_kind, aggregate_id, status, payload from outbox_events`);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        // §SE-005 names the Approval Snapshot, not the version: the snapshot is
        // what authorises the order APP7 will create.
        aggregate_kind: 'APPROVAL_SNAPSHOT',
        aggregate_id: view.approvalSnapshotId,
        status: 'PENDING',
      });

      const payload = JSON.stringify(events[0]?.payload ?? {});
      for (const secret of [fixture.target.token, fixture.target.grantId]) {
        expect(payload).not.toContain(secret);
      }
      // The hand-off names the approval; it does not carry the artwork.
      expect(payload).not.toContain('elements');
      expect(payload).not.toContain('#1d4ed8');
    });

    it('writes no order, payment, reservation or production row: APP6 stops here', async () => {
      const fixture = await seedApprovable(context, placement);

      await context.asRequest(() => context.approval.approve(approvalBody(fixture)));

      for (const table of [
        'orders',
        'order_items',
        'payment_obligations',
        'payment_attempts',
        'inventory_reservations',
        'inventory_soft_holds',
        'production_jobs',
        'production_specifications',
      ]) {
        expect(
          await context.count(sql`select count(*)::text as count from ${sql.identifier(table)}`),
        ).toBe(0);
      }
      // And no second grant: B11 reuses the REQUEST_ACCESS grant APP5 issued,
      // and mints nothing.
      expect(
        await context.count(sql`select count(*)::text as count from secure_access_grants`),
      ).toBe(1);
    });
  });

  describe('the frozen Approval Snapshot', () => {
    it('freezes truthful Catalog evidence, and a later rename cannot rewrite it', async () => {
      const fixture = await seedApprovable(context, placement);

      const view = await context.asRequest(() => context.approval.approve(approvalBody(fixture)));

      const [snapshot] = await context.rows<Record<string, unknown>>(
        sql`select * from approval_snapshots where id = ${view.approvalSnapshotId}`,
      );
      expect(snapshot).toMatchObject({
        design_version_id: fixture.versionId,
        design_case_id: fixture.target.designCaseId,
        custom_request_id: fixture.target.requestId,
        customer_id: fixture.target.customerId,
        document_hash: fixture.documentHash,
        product_id: placement.productId,
        product_variant_id: placement.productVariantId,
        product_side_id: placement.productSideId,
        embroidery_area_id: placement.embroideryAreaId,
        // Read from Catalog at approval time — not invented, not defaulted.
        product_name: placement.productName,
        side_name: placement.sideName,
        area_name: placement.areaName,
        variant_label: `${placement.colorName} / ${placement.sizeLabel}`,
        // Summed from the request's own three breakdown lines (12 + 8 + 4).
        quantity_total: fixture.target.quantityTotal,
        grant_id: fixture.target.grantId,
        customer_owned_product_id: null,
        // APP6 renders nothing, so the nullable preview evidence stays null
        // rather than being manufactured (`APP6-G01` §8).
        preview_hash: null,
      });
      // The contact copy is the display value of the verified primary contact.
      expect(snapshot?.['contact_email']).toBe(fixture.target.contactValue);
      expect(snapshot?.['contact_name']).toBe('APP6 B11 Customer');

      await context.rows(
        sql`update products set name = 'Renamed Product' where id = ${placement.productId}`,
      );
      const [after] = await context.rows<{ readonly product_name: string }>(
        sql`select product_name from approval_snapshots where id = ${view.approvalSnapshotId}`,
      );
      expect(after?.product_name).toBe(placement.productName);
    });

    it('freezes truthful COP evidence and fabricates no Catalog row', async () => {
      const fixture = await seedApprovable(context, placement, { customerOwned: true });

      const view = await context.asRequest(() => context.approval.approve(approvalBody(fixture)));

      const [snapshot] = await context.rows<Record<string, unknown>>(
        sql`select * from approval_snapshots where id = ${view.approvalSnapshotId}`,
      );
      expect(snapshot).toMatchObject({
        customer_owned_product_id: fixture.target.customerOwnedProductId,
        // CST-131: the whole Catalog quartet is NULL on this branch. A COP is
        // never a SKU (INV-13), so nothing is borrowed to fill them.
        product_id: null,
        product_variant_id: null,
        product_side_id: null,
        embroidery_area_id: null,
        // The customer's own words for their own garment.
        product_name: fixture.target.customerOwnedProductName,
        // The version's frozen labels — never the COP row's `description`.
        side_name: COP_SIDE_LABEL,
        area_name: COP_AREA_LABEL,
        // A COP has no variant, so the nullable column stays null rather than
        // carrying a placeholder.
        variant_label: null,
      });
      // The COP row itself was never turned into, or joined to, a product.
      expect(await context.count(sql`select count(*)::text as count from skus`)).toBe(0);
    });

    it('freezes the distinct declared thread colours, in z-order, deduplicated', async () => {
      const fixture = await seedApprovable(context, placement);

      const view = await context.asRequest(() => context.approval.approve(approvalBody(fixture)));

      const colors = await context.rows<{
        readonly position: number;
        readonly color_code: string;
        readonly color_name: string | null;
      }>(
        sql`select position, color_code, color_name from approval_snapshot_thread_colors
             where approval_snapshot_id = ${view.approvalSnapshotId} order by position`,
      );
      // `#1d4ed8` is declared twice in the fixture document — one thread, not two.
      expect(colors.map((color) => color.color_code)).toEqual([...EXPECTED_THREAD_COLORS]);
      expect(colors.map((color) => color.position)).toEqual([1, 2, 3]);
      // No palette table exists, so no thread name is invented for a hex value.
      expect(colors.every((color) => color.color_name === null)).toBe(true);
    });

    it('freezes the exact agreement evidence, unaffected by a later publication', async () => {
      const fixture = await seedApprovable(context, placement);

      const view = await context.asRequest(() => context.approval.approve(approvalBody(fixture)));

      const frozen = await context.rows<{
        readonly agreement_version_id: string;
        readonly agreement_type: string;
        readonly content_hash: string;
      }>(
        sql`select agreement_version_id, agreement_type, content_hash
              from approval_snapshot_agreement_acceptances
             where approval_snapshot_id = ${view.approvalSnapshotId}
             order by agreement_type`,
      );
      // The type came from the Agreement Version, not from the body, which
      // carried ids and hashes only.
      expect(frozen.map((row) => row.agreement_type)).toEqual(['PAYMENT_POLICY', 'RETURN_POLICY']);
      expect(frozen.map((row) => row.agreement_version_id).sort()).toEqual(
        fixture.agreements.map((agreement) => agreement.agreementVersionId).sort(),
      );

      // Publishing again leaves the historical evidence exactly as it was.
      await context.publishAgreementContent();
      const after = await context.rows<{ readonly content_hash: string }>(
        sql`select content_hash from approval_snapshot_agreement_acceptances
             where approval_snapshot_id = ${view.approvalSnapshotId} order by agreement_type`,
      );
      expect(after.map((row) => row.content_hash)).toEqual(frozen.map((row) => row.content_hash));
    });

    it('rejects an update or a delete of the frozen snapshot', async () => {
      const fixture = await seedApprovable(context, placement);
      const view = await context.asRequest(() => context.approval.approve(approvalBody(fixture)));

      // CST-091 landed as a row-wide `always`/`reject` trigger in `0030`, so the
      // immutability is the database's rather than the repository's discipline —
      // and it holds against direct SQL, not just against the repository, which
      // simply offers no update or delete method.
      await expect(
        context.rows(
          sql`update approval_snapshots set quantity_total = 1
               where id = ${view.approvalSnapshotId}`,
        ),
      ).rejects.toThrow();
      await expect(
        context.rows(sql`delete from approval_snapshots where id = ${view.approvalSnapshotId}`),
      ).rejects.toThrow();
    });
  });
});
