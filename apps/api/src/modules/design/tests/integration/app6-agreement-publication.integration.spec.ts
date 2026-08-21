/**
 * `APP6-B10` — agreement content publication, on the bootstrap seam.
 *
 * Runs the delivered `PublishApp6AgreementsUseCase` against the **committed**
 * dataset and the real AGG-21 repository. Nothing is stubbed and no row is
 * inserted by hand, so what these tests observe is what a stack start actually
 * writes.
 *
 * The four claims are: the authority content reaches the database verbatim; a
 * second identical bootstrap appends nothing; a genuine content change appends a
 * successor rather than editing the row a past approval may already be bound to;
 * and no route anywhere can do any of it.
 */
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { sql } from 'drizzle-orm';

import { sha256Hex } from '../../../asset/domain/canonical-json';
import {
  createCustomerDesignReviewContext,
  type CustomerDesignReviewTestContext,
} from './customer-design-review-context';

/** The committed dataset, as the delivered resolver locates it. */
const COMMITTED_PACKAGE_JSON = require.resolve('@embroidery/database/package.json');

/** Stands in for a future accepted content change. Deliberately not policy prose. */
const DRIFTED_PAYMENT_CONTENT = 'P1. Nội dung thay thế cho bài kiểm thử trôi nội dung.';

/**
 * A throwaway package whose seed folder carries drifted `PAYMENT_POLICY` text
 * and the committed `RETURN_POLICY` text.
 *
 * Built from the committed file rather than hand-written, so the untouched type
 * is byte-identical to what the real bootstrap publishes and "unchanged" means
 * unchanged rather than "happened to match a second fixture".
 */
function driftedDatasetPackageJson(): string {
  const root = mkdtempSync(join(tmpdir(), 'app6-b10-drift-'));
  mkdirSync(join(root, 'seed'));
  const committed = JSON.parse(
    readFileSync(
      join(COMMITTED_PACKAGE_JSON, '..', 'seed', 'app6-agreement-content.seed.json'),
      'utf8',
    ),
  ) as { agreements: { agreementType: string; content: string }[] };

  for (const agreement of committed.agreements) {
    if (agreement.agreementType === 'PAYMENT_POLICY') {
      agreement.content = DRIFTED_PAYMENT_CONTENT;
    }
  }
  writeFileSync(
    join(root, 'seed', 'app6-agreement-content.seed.json'),
    JSON.stringify(committed, null, 2),
    'utf8',
  );
  return join(root, 'package.json');
}

interface VersionRow {
  readonly id: string;
  readonly agreement_type: string;
  readonly version: number;
  readonly status: string;
  readonly content: string;
  readonly content_hash: string;
  readonly language: string;
  readonly published_at: string | null;
  readonly superseded_at: string | null;
}

describe('APP6-B10 — agreement content publication', () => {
  let context: CustomerDesignReviewTestContext;

  beforeAll(async () => {
    context = await createCustomerDesignReviewContext('app6-b10-agreement-publication');
  }, 180_000);

  afterAll(async () => {
    await context?.close();
  });

  beforeEach(async () => {
    await context.reset();
  });

  function allVersions(): Promise<VersionRow[]> {
    return context.rows<VersionRow>(sql`
      select v.id, a.agreement_type, v.version, v.status, v.content, v.content_hash,
             v.language, v.published_at, v.superseded_at
        from agreement_versions v
        join agreements a on a.id = v.agreement_id
       order by a.agreement_type, v.version
    `);
  }

  it('publishes exactly the two required types, each as version 1 and current', async () => {
    await context.publishAgreementContent();

    const versions = await allVersions();
    expect(versions.map((row) => `${row.agreement_type}#${String(row.version)}`)).toEqual([
      'PAYMENT_POLICY#1',
      'RETURN_POLICY#1',
    ]);
    for (const row of versions) {
      expect(row.status).toBe('PUBLISHED');
      expect(row.language).toBe('vi');
      expect(row.published_at).not.toBeNull();
      expect(row.superseded_at).toBeNull();
    }

    const containers = await context.rows<{
      readonly agreement_type: string;
      readonly current_version_id: string;
      readonly name: string;
    }>(sql`select agreement_type, current_version_id, name from agreements
             order by agreement_type`);
    // The pointer names one of the agreement's **own** versions (G-DB7-01).
    for (const container of containers) {
      const owned = versions.find((row) => row.id === container.current_version_id);
      expect(owned?.agreement_type).toBe(container.agreement_type);
    }
    expect(containers.map((row) => row.name)).toEqual([
      'Chính sách thanh toán',
      'Chính sách đổi trả và huỷ đơn',
    ]);
  });

  it('publishes the authority content verbatim, hashed by the delivered convention', async () => {
    await context.publishAgreementContent();

    for (const row of await allVersions()) {
      // The hash the customer is shown and `APP6-B11` will submit back is
      // SHA-256 over the exact stored text, prefixed the way every other hash in
      // this repository is (`CST-070`). Recomputed independently here rather
      // than compared to the publisher's own output, which would prove nothing.
      expect(row.content_hash).toBe(sha256Hex(row.content));
      expect(row.content_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(row.content.trim()).not.toBe('');
    }

    const payment = (await allVersions()).find((row) => row.agreement_type === 'PAYMENT_POLICY');
    const returns = (await allVersions()).find((row) => row.agreement_type === 'RETURN_POLICY');
    // Sentence counts, as `APP6-G01-C1` §5.6 states them. The word-for-word
    // comparison against the authority markdown lives in the dataset's own suite,
    // where the source document is in scope; this is the shape check that the
    // whole block reached the database rather than a truncated one.
    expect(payment?.content.split('\n\n')).toHaveLength(11);
    expect(returns?.content.split('\n\n')).toHaveLength(12);
    // `APP6-G01-C1` §5.2 — the exact-design confirmation is never an agreement.
    expect(
      await context.count(sql`
      select count(*) from agreements where agreement_type = 'DESIGN_APPROVAL_TERMS'
    `),
    ).toBe(0);
  });

  it('appends nothing on an identical second bootstrap', async () => {
    await context.publishAgreementContent();
    const first = await allVersions();

    await context.publishAgreementContent();
    await context.publishAgreementContent();

    // Three bootstraps, two rows. `ensureAgreement` makes the *container*
    // idempotent while `addVersion` always appends, so without the content-hash
    // comparison this would be six.
    expect(await allVersions()).toEqual(first);
  });

  it('reports the outcome as unchanged rather than silently re-publishing', async () => {
    const [adminId] = await seedAdmin();
    const first = await context.agreements.publish(adminId);
    expect(first.map((result) => result.outcome)).toEqual(['published', 'published']);

    const second = await context.agreements.publish(adminId);
    expect(second.map((result) => result.outcome)).toEqual(['unchanged', 'unchanged']);
    expect(second.map((result) => result.version)).toEqual([1, 1]);
    expect(second.map((result) => result.contentHash)).toEqual(
      first.map((result) => result.contentHash),
    );
  });

  it('cannot edit a published version even from outside the application', async () => {
    await context.publishAgreementContent();
    const [original] = await allVersions();

    // The S24 immutability trigger, not application restraint. This is why the
    // drift test below has to change the *dataset* rather than the row: there is
    // no path — not the repository, not raw SQL — that edits published terms an
    // approval may already be bound to.
    const refusal = await context
      .rows(
        sql`update agreement_versions set content = 'Nội dung khác.'
                 where id = ${original?.id ?? ''}`,
      )
      .then(
        () => undefined,
        (error: unknown) => error,
      );
    expect(String((refusal as { readonly cause?: unknown })?.cause)).toContain(
      'immutability violation',
    );
  });

  it('appends a successor on authoritative content drift, leaving history untouched', async () => {
    await context.publishAgreementContent();
    const [originalPayment] = (await allVersions()).filter(
      (row) => row.agreement_type === 'PAYMENT_POLICY',
    );

    // The drift is introduced where a real one would be: in the dataset. A
    // fixture package carries changed `PAYMENT_POLICY` text and the committed
    // `RETURN_POLICY` text, so one type drifts and the other does not — which is
    // what proves the publisher compares per type rather than republishing the
    // whole set whenever anything moved.
    const [adminId] = await seedAdmin();
    const results = await context.agreements.publish(adminId, driftedDatasetPackageJson);

    expect(results).toEqual([
      expect.objectContaining({ agreementType: 'PAYMENT_POLICY', outcome: 'published' }),
      expect.objectContaining({ agreementType: 'RETURN_POLICY', outcome: 'unchanged' }),
    ]);

    const payment = (await allVersions()).filter((row) => row.agreement_type === 'PAYMENT_POLICY');
    expect(payment).toHaveLength(2);
    const [previous, successor] = payment;
    // The historical row keeps its content and hash. An approval already bound
    // to it must keep meaning forever (ADR-DB1-011), so drift is corrected by
    // appending and never by editing.
    expect(previous?.id).toBe(originalPayment?.id);
    expect(previous?.content).toBe(originalPayment?.content);
    expect(previous?.content_hash).toBe(originalPayment?.content_hash);
    expect(previous?.status).toBe('SUPERSEDED');
    expect(previous?.superseded_at).not.toBeNull();
    expect(successor?.content).toBe(DRIFTED_PAYMENT_CONTENT);

    expect(successor?.version).toBe(2);
    expect(successor?.status).toBe('PUBLISHED');
    expect(successor?.content_hash).toBe(sha256Hex(successor?.content ?? ''));

    const [container] = await context.rows<{ readonly current_version_id: string }>(sql`
      select current_version_id from agreements where agreement_type = 'PAYMENT_POLICY'
    `);
    expect(container?.current_version_id).toBe(successor?.id);
    // The other type did not drift, so it was left completely alone.
    expect(
      (await allVersions()).filter((row) => row.agreement_type === 'RETURN_POLICY'),
    ).toHaveLength(1);
  });

  it('refuses to publish without a resolved Admin identity', async () => {
    // The signature is what keeps publication on the one admin-bearing bootstrap
    // seam. TBL-069 stores no actor column, so the id is not persisted — which is
    // exactly why the requirement has to be enforced here rather than by a NOT
    // NULL somewhere.
    await expect(context.agreements.publish('   ')).rejects.toThrow(/Admin identity/);
    expect(await context.count(sql`select count(*) from agreements`)).toBe(0);
  });

  async function seedAdmin(): Promise<[string]> {
    const { requestId } = await context.seedRequest();
    expect(requestId).toBeDefined();
    const [admin] = await context.rows<{ readonly id: string }>(sql`
      select id from admin_accounts where status = 'ACTIVE' limit 1
    `);
    if (admin !== undefined) return [admin.id];
    // `seedRequest` seeds no Admin, so the first call creates one through the
    // same fixture the policy publisher uses.
    await context.publishSecureLinkPolicy();
    const [created] = await context.rows<{ readonly id: string }>(sql`
      select id from admin_accounts where status = 'ACTIVE' limit 1
    `);
    return [created?.id ?? ''];
  }
});
