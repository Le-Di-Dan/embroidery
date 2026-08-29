/**
 * `APP10-E01` journey **J1** — customer support and bounded maintenance — and
 * journey **J4-C1**, the unauthorized negative path.
 *
 * ### What this proves that no `B0n` suite does
 *
 * The delivered suites each answer a question about one operation. These cases
 * ask whether the operations *compose* into the support journey the phase
 * promises: an operator who knows one contact reaches exactly one Customer, sees
 * only masked data, changes what APP10-B01 permits, and reads the change back
 * from the authority rather than from their own input — all on one HTTP
 * application against one disposable PostgreSQL, with the real
 * `AuthenticatedAdminGuard` and no override anywhere.
 *
 * `J4-C1` is here rather than in its own file because the denial has to be
 * measured against the *same* seeded customer the authorized cases just used:
 * "the anonymous caller was refused" is only worth asserting when there is
 * something real behind the guard for it to have reached.
 *
 * ### Reused, deliberately not rerun
 *
 * Every `APP10-B01` refusal (`CONTACT_IS_PRIMARY`, `CONTACT_IS_LAST_VERIFIED`,
 * `CONTACT_NOT_VERIFIED`, `CONTACT_NOT_ACTIVE`, `CUSTOMER_MERGED`), the whole
 * `APP4-B07` resolver matrix and the APP1 auth matrix stay where they are. This
 * file runs one representative mutation and one representative denial.
 */
import request from 'supertest';

import {
  FIXTURE_EMAIL,
  FIXTURE_EMAIL_MASK,
  FIXTURE_PHONE,
  FIXTURE_PHONE_MASK,
  ROUTES,
  createAdminSupportContext,
  dataOf,
  type AdminSupportTestContext,
  type SeededCustomer,
} from '../../../src/modules/customer/tests/integration/admin-support-context';
import {
  auditRows,
  customerRow,
} from '../../../src/modules/customer/tests/integration/customer-maintenance-queries';
import {
  auditEventCount,
  mergeCaseRows,
} from '../../../src/modules/customer/tests/integration/customer-merge-queries';

interface Resolution {
  readonly customerId: string;
}

interface DetailContact {
  readonly contactId: string;
  readonly kind: string;
  readonly maskedValue: string;
  readonly verified: boolean;
  readonly primary: boolean;
}

interface Detail {
  readonly customerId: string;
  readonly displayName?: string;
  readonly notes?: string;
  readonly verifiedAt: string;
  readonly contacts: readonly DetailContact[];
}

/**
 * Values that must appear nowhere in a response body. The two contacts by their
 * raw and normalized form — which are the same string here, deliberately: a
 * fixture whose raw and normalized values differed would let a leak of one hide
 * behind an assertion about the other.
 */
const FORBIDDEN_IN_RESPONSES = [FIXTURE_EMAIL, FIXTURE_PHONE] as const;

describe('APP10-E01 · J1 customer support and bounded maintenance', () => {
  let context: AdminSupportTestContext;
  let customer: SeededCustomer;

  beforeAll(async () => {
    context = await createAdminSupportContext('app10-e01-j1-support');
    await context.reset();
    await context.seedAdminSession();
    customer = await context.seedCustomer();
  }, 180_000);

  afterAll(async () => {
    await context?.close();
  });

  const authed = () => ({ Cookie: context.adminCookie() });

  const resolve = (contactKind: 'EMAIL' | 'PHONE', contact: string) =>
    request(context.server()).post(ROUTES.resolve()).set(authed()).send({ contactKind, contact });

  const readDetail = (customerId: string) =>
    request(context.server()).get(ROUTES.detail(customerId)).set(authed());

  /** E01-01 — J1-C1. */
  it('E01-01 · resolves one Customer from one exact contact and publishes only masked data', async () => {
    // The operator knows one address. There is no list to page through and no
    // search to widen: APP4-B07 refused both and APP10 keeps that refusal.
    const emailHit = dataOf<Resolution>(await resolve('EMAIL', FIXTURE_EMAIL).expect(200));
    expect(emailHit.customerId).toBe(customer.customerId);

    // The same Customer from its other contact — one identity, two doors.
    const phoneHit = dataOf<Resolution>(await resolve('PHONE', FIXTURE_PHONE).expect(200));
    expect(phoneHit.customerId).toBe(customer.customerId);

    // The resolver answers "which Customer owns this", never "does anybody own
    // this": an unowned contact is the same 404 a malformed one would be.
    await resolve('EMAIL', 'khong.ton.tai@vidu-e01.test').expect(404);

    const response = await readDetail(customer.customerId).expect(200);
    const detail = dataOf<Detail>(response);
    expect(detail.customerId).toBe(customer.customerId);
    expect(detail.contacts).toHaveLength(2);

    // Masked is the only representation of a contact this API has.
    const byKind = Object.fromEntries(detail.contacts.map((c) => [c.kind, c]));
    expect(byKind['EMAIL']?.maskedValue).toBe(FIXTURE_EMAIL_MASK);
    expect(byKind['PHONE']?.maskedValue).toBe(FIXTURE_PHONE_MASK);
    expect(byKind['EMAIL']?.primary).toBe(true);

    // Searched as whole strings across the raw body, so a raw value sitting in a
    // field nobody thought to name would still fail this.
    const raw = JSON.stringify(response.body);
    for (const forbidden of FORBIDDEN_IN_RESPONSES) {
      expect(raw).not.toContain(forbidden);
    }
    // Nor the peppered digest, the grant token hash or a session value.
    for (const key of ['tokenhash', 'codehash', 'pepper', 'normalizedvalue', 'displayvalue']) {
      expect(raw.toLowerCase()).not.toContain(key);
    }

    // And no enumeration surface was introduced beside it.
    await request(context.server()).get('/api/admin/customers').set(authed()).expect(404);
  });

  /** E01-02 — J1-C2, the API half. The Admin half is `app10-e01-customer-maintenance.test.tsx`. */
  it('E01-02 · applies one bounded profile patch and reads it back from the authority', async () => {
    const before = await customerRow(context, customer.customerId);
    expect(before.notes).toBeNull();

    // The one representative mutation: the profile patch, which is the only
    // APP10-B01 write that carries an operator-authored value.
    await request(context.server())
      .patch(ROUTES.updateProfile(customer.customerId))
      .set(authed())
      .send({ displayName: 'Nguyễn Minh An', notes: 'Ưu tiên liên hệ buổi chiều.' })
      .expect(204);

    // 204 republishes nothing, so what the operator sees next is a re-read of the
    // authoritative record — never the text they typed.
    const detail = dataOf<Detail>(await readDetail(customer.customerId).expect(200));
    expect(detail.displayName).toBe('Nguyễn Minh An');
    expect(detail.notes).toBe('Ưu tiên liên hệ buổi chiều.');

    // The patch is bounded: nothing outside the two permitted fields is writable,
    // and an unknown key is a reported 400 rather than a silently dropped one.
    for (const forbidden of [
      { verifiedAt: '2020-01-01T00:00:00.000Z' },
      { contacts: [] },
      { mergedIntoCustomerId: customer.customerId },
      { customerId: customer.customerId },
    ]) {
      await request(context.server())
        .patch(ROUTES.updateProfile(customer.customerId))
        .set(authed())
        .send(forbidden)
        .expect(400);
    }

    // An empty patch is refused too — a write that names no field is a client bug.
    await request(context.server())
      .patch(ROUTES.updateProfile(customer.customerId))
      .set(authed())
      .send({})
      .expect(400);

    // The refusals changed nothing, and verification evidence is untouched by a
    // profile write in any case.
    const after = await customerRow(context, customer.customerId);
    expect(after.verified_at).toBe(before.verified_at);
    expect(after.merged_into_customer_id).toBeNull();
    expect(after.anonymized_at).toBeNull();

    // Exactly one audit row for the one write that succeeded, against the
    // authenticated Admin, and it names the changed fields without quoting them.
    const audits = await auditRows(context, customer.customerId);
    expect(audits).toHaveLength(1);
    expect(audits[0]?.actor_kind).toBe('ADMIN');
    expect(audits[0]?.admin_id).toBe(context.adminId());
    const summary = JSON.stringify(audits[0]?.summary ?? {});
    expect(summary).toContain('displayName');
    expect(summary).toContain('notes');
    expect(summary).not.toContain('Ưu tiên liên hệ buổi chiều.');
  });
});

describe('APP10-E01 · J4-C1 unauthorized denial', () => {
  let context: AdminSupportTestContext;
  let customer: SeededCustomer;

  beforeAll(async () => {
    context = await createAdminSupportContext('app10-e01-j4-unauthorized');
    await context.reset();
    await context.seedAdminSession();
    customer = await context.seedCustomer();
  }, 180_000);

  afterAll(async () => {
    await context?.close();
  });

  /** E01-09 — J4-C1. */
  it('E01-09 · refuses every customer read and merge mutation without a session, and writes nothing', async () => {
    const before = {
      customer: await customerRow(context, customer.customerId),
      audits: await auditEventCount(context),
      cases: (await mergeCaseRows(context)).length,
    };
    expect(before.cases).toBe(0);

    // A live case id is never needed: the guard runs before the handler, so a
    // syntactically valid id is enough to prove the route is behind it.
    const caseId = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6090';
    const anonymous = () => request(context.server());
    // A cookie that resolves to no session — the second half of the negative
    // path, and the one a stubbed guard would wave through.
    const stale = { Cookie: 'adm_session=khong-phai-mot-phien-hop-le' };

    for (const header of [{}, stale]) {
      // Reads.
      await anonymous()
        .post(ROUTES.resolve())
        .set(header)
        .send({ contactKind: 'EMAIL', contact: FIXTURE_EMAIL })
        .expect(401);
      await anonymous().get(ROUTES.detail(customer.customerId)).set(header).expect(401);
      await anonymous().get(ROUTES.grants(customer.customerId)).set(header).expect(401);

      // Maintenance writes.
      await anonymous()
        .patch(ROUTES.updateProfile(customer.customerId))
        .set(header)
        .send({ notes: 'kẻ gọi chưa xác thực' })
        .expect(401);

      // Merge mutations — open and execute, the two the phase outcome names.
      await anonymous()
        .post(ROUTES.openMerge())
        .set(header)
        .send({
          survivorCustomerId: customer.customerId,
          loserCustomerId: '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6073',
          reason: 'kẻ gọi chưa xác thực',
        })
        .expect(401);
      await anonymous().post(ROUTES.executeMerge(caseId)).set(header).expect(401);
      await anonymous().get(ROUTES.mergeCase(caseId)).set(header).expect(401);
    }

    // Nothing behind the guard moved: not the Customer, not the audit trail, and
    // no merge case was brought into existence by a refused open.
    const after = await customerRow(context, customer.customerId);
    expect(after.notes).toBe(before.customer.notes);
    expect(after.display_name).toBe(before.customer.display_name);
    expect(after.updated_at).toBe(before.customer.updated_at);
    expect(after.merged_into_customer_id).toBeNull();
    expect(await auditEventCount(context)).toBe(before.audits);
    expect(await mergeCaseRows(context)).toHaveLength(0);
  });
});
