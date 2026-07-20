/**
 * AGG-13 Custom Request persistence against a real
 * PostgreSQL instance (DB7-CP4).
 *
 * TBL-037..TBL-042 and TBL-050..TBL-053. They share a suite because the
 * conversion guards span both: G-DB7-04 (the request's current quotation),
 * G-DB7-20 (GRD-006, acceptance binds the exact current sent version),
 * G-DB7-22 and G-DB7-25 (lifecycle legality).
 */
import { isPersistenceError, newId, withMappedErrors } from '@embroidery/database';
import type { CustomRequestState, PersistenceError } from '@embroidery/database';
import { sql } from 'drizzle-orm';

import { createPersistenceTestContext } from '../../../../tests/integration/persistence-test-context';
import type { PersistenceTestContext } from '../../../../tests/integration/persistence-test-context';
import { OrderModule } from '../../order.module';
import { CUSTOM_REQUEST_REPOSITORY } from '../../domain/repositories/custom-request.repository';
import type {
  CustomRequestId,
  CustomRequestRepository,
  RequestActor,
} from '../../domain/repositories/custom-request.repository';

describe('custom request persistence (integration)', () => {
  let context: PersistenceTestContext;
  let requests: CustomRequestRepository;
  let customerId: string;
  let adminId: string;
  let grantId: string;
  let challengeId: string;

  beforeAll(async () => {
    context = await createPersistenceTestContext('cp4-request', [OrderModule]);
    requests = context.get(CUSTOM_REQUEST_REPOSITORY);
  }, 120_000);

  afterAll(async () => {
    await context?.close();
  });

  beforeEach(async () => {
    await context.reset();
    const db = context.disposable.client.db;

    customerId = newId();
    adminId = newId();
    const contactId = newId();

    await db.execute(sql`
      insert into customers (id, display_name, verified_at)
      values (${customerId}, 'Quote Customer', now())
    `);
    await db.execute(sql`
      insert into customer_contact_points
        (id, customer_id, contact_kind, normalized_value, display_value, is_primary, verified_at, verified_source)
      values (${contactId}, ${customerId}, 'EMAIL', ${`q-${customerId}@example.com`},
              ${`q-${customerId}@example.com`}, true, now(), 'OTP')
    `);
    await db.execute(sql`
      insert into admin_accounts (id, email, display_name, status)
      values (${adminId}, ${`admin-${adminId}@example.com`}, 'Admin', 'ACTIVE')
    `);
    challengeId = newId();
    await db.execute(sql`
      insert into contact_verification_challenges
        (id, contact_point_id, contact_kind, normalized_value, purpose, code_hash, status, expires_at, verified_at)
      values (${challengeId}, ${contactId}, 'EMAIL', ${`q-${customerId}@example.com`},
              'STEP_UP', 'hash', 'VERIFIED', now() + interval '1 hour', now())
    `);
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

  const adminActor = (): RequestActor => ({ kind: 'ADMIN', adminId });

  async function submitRequest(): Promise<CustomRequestId> {
    const id = newId() as CustomRequestId;
    await context.inTransaction(() =>
      requests.submit({
        id,
        code: `REQ-${id}`,
        customerId,
        breakdown: [
          { productVariantId: undefined, sizeLabel: 'M', quantity: 10 },
          { productVariantId: undefined, sizeLabel: 'L', quantity: 15 },
        ],
      }),
    );
    return id;
  }

  /** Walks a request to a state through legal moves only. */
  async function moveTo(id: CustomRequestId, path: readonly CustomRequestState[]): Promise<void> {
    for (const to of path) {
      await context.inTransaction(() =>
        requests.transition({ id, to, actor: adminActor(), correlationId: newId() }),
      );
    }
  }

  async function seedGrant(requestId: CustomRequestId): Promise<string> {
    grantId = newId();
    await context.disposable.client.db.execute(sql`
      insert into secure_access_grants
        (id, customer_id, custom_request_id, token_hash, scope_kind, status, expires_at)
      values (${grantId}, ${customerId}, ${requestId}, ${`hash-${grantId}`},
              'REQUEST_ACCESS', 'ACTIVE', now() + interval '1 hour')
    `);
    return grantId;
  }

  describe('request submission', () => {
    it('creates the request with its breakdown', async () => {
      const id = await submitRequest();

      await expect(requests.loadBreakdown(id)).resolves.toHaveLength(2);
      await expect(requests.totalQuantity(id)).resolves.toBe(25);
    });

    it('starts in NEW', async () => {
      const id = await submitRequest();

      await expect(requests.findById(id)).resolves.toMatchObject({ status: 'NEW' });
    });

    it('refuses to submit outside a transaction', async () => {
      const id = newId() as CustomRequestId;

      await expect(
        requests.submit({ id, code: `REQ-${id}`, customerId, breakdown: [] }),
      ).rejects.toThrow(/must run inside a transaction/);
    });

    it('rejects a duplicate code', async () => {
      const id = await submitRequest();
      const existing = await requests.findById(id);

      const error = await failureOf(() =>
        context.inTransaction(() =>
          requests.submit({
            id: newId() as CustomRequestId,
            code: existing?.code as string,
            customerId,
            breakdown: [],
          }),
        ),
      );

      expect(error.code).toBe('DUPLICATE_REQUEST_CODE');
    });

    it('rolls the request back when a breakdown line is invalid', async () => {
      const id = newId() as CustomRequestId;

      await expect(
        context.inTransaction(() =>
          requests.submit({
            id,
            code: `REQ-${id}`,
            customerId,
            breakdown: [{ productVariantId: newId() as never, sizeLabel: 'M', quantity: 5 }],
          }),
        ),
      ).rejects.toBeDefined();

      // A request whose breakdown did not land would be quotable at the wrong
      // quantity, so neither may survive alone.
      await expect(requests.findById(id)).resolves.toBeUndefined();
    });

    it('stores a customer-owned product separately from any SKU (INV-13)', async () => {
      const id = newId() as CustomRequestId;
      await context.inTransaction(() =>
        requests.submit({
          id,
          code: `REQ-${id}`,
          customerId,
          breakdown: [],
          customerOwnedProduct: {
            name: "Customer's own jacket",
            description: undefined,
            physicalWidthMm: undefined,
            physicalHeightMm: undefined,
          },
        }),
      );

      await expect(requests.loadCustomerOwnedProduct(id)).resolves.toMatchObject({
        name: "Customer's own jacket",
      });
    });

    it('allows only one customer-owned product per request', async () => {
      const id = await submitRequest();

      const error = await failureOf(() =>
        withMappedErrors('probe.secondCop', () =>
          context.disposable.client.db.execute(sql`
            insert into customer_owned_products (id, custom_request_id, name)
            values (${newId()}, ${id}, 'A'), (${newId()}, ${id}, 'B')
          `),
        ),
      );

      expect(error.code).toBe('CUSTOMER_PRODUCT_ALREADY_SET');
    });
  });

  describe('lifecycle transitions (G-DB7-25 / GRD-019)', () => {
    it('records the move and its evidence together', async () => {
      const id = await submitRequest();

      await moveTo(id, ['UNDER_REVIEW']);

      const transitions = await requests.listTransitions(id);
      expect(transitions).toHaveLength(1);
      expect(transitions[0]).toMatchObject({ fromStatus: 'NEW', toStatus: 'UNDER_REVIEW' });
    });

    it('rejects a move the lifecycle does not permit', async () => {
      const id = await submitRequest();

      // NEW → APPROVED skips the entire quoting and design chain.
      const error = await failureOf(() =>
        context.inTransaction(() =>
          requests.transition({
            id,
            to: 'APPROVED',
            actor: adminActor(),
            correlationId: newId(),
          }),
        ),
      );

      expect(error.code).toBe('INVALID_TRANSITION');
      await expect(requests.findById(id)).resolves.toMatchObject({ status: 'NEW' });
    });

    it('rejects any move out of a terminal state', async () => {
      const id = await submitRequest();
      await moveTo(id, ['CANCELLED']);

      const error = await failureOf(() =>
        context.inTransaction(() =>
          requests.transition({
            id,
            to: 'UNDER_REVIEW',
            actor: adminActor(),
            correlationId: newId(),
          }),
        ),
      );

      expect(error.code).toBe('INVALID_TRANSITION');
    });

    it('leaves no transition evidence behind a rejected move', async () => {
      const id = await submitRequest();

      await expect(
        context.inTransaction(() =>
          requests.transition({
            id,
            to: 'APPROVED',
            actor: adminActor(),
            correlationId: newId(),
          }),
        ),
      ).rejects.toBeDefined();

      await expect(requests.listTransitions(id)).resolves.toEqual([]);
    });

    it('records a customer actor with its grant', async () => {
      const id = await submitRequest();
      const grant = await seedGrant(id);

      await context.inTransaction(() =>
        requests.transition({
          id,
          to: 'CANCELLED',
          actor: { kind: 'CUSTOMER', customerId, grantId: grant },
          correlationId: newId(),
        }),
      );

      const transitions = await requests.listTransitions(id);
      expect(transitions[0]?.actorKind).toBe('CUSTOMER');
    });

    it('writes actor evidence matching the actor kind', async () => {
      const id = await submitRequest();

      await moveTo(id, ['UNDER_REVIEW']);

      const [row] = (
        await context.disposable.client.db.execute<{ actor_kind: string; admin_id: string | null }>(
          sql`select actor_kind, admin_id from custom_request_transitions where custom_request_id = ${id}`,
        )
      ).rows;
      expect(row?.actor_kind).toBe('ADMIN');
      expect(row?.admin_id).toBe(adminId);
    });

    it('leaves actor/kind agreement to the application — unlike audit_events, no CHECK enforces it', async () => {
      const id = await submitRequest();

      // `audit_events` has `ck_audit_events__actor_kind_ref_match`;
      // `custom_request_transitions` has no equivalent, so the database
      // accepts an ADMIN transition carrying no admin id. The repository's
      // discriminated `RequestActor` union makes that unrepresentable for its
      // callers, which is the only thing preventing it. Asserted so the
      // asymmetry is recorded rather than assumed away.
      await expect(
        withMappedErrors('probe.actorWithoutEvidence', () =>
          context.disposable.client.db.execute(sql`
            insert into custom_request_transitions
              (custom_request_id, from_status, to_status, actor_kind, correlation_id)
            values (${id}, 'NEW', 'UNDER_REVIEW', 'ADMIN', ${newId()})
          `),
        ),
      ).resolves.toBeDefined();
    });
  });

  describe('quantity breakdown mutability (CON-074)', () => {
    it('replaces the breakdown while the request is unquoted', async () => {
      const id = await submitRequest();

      await context.inTransaction(() =>
        requests.replaceBreakdown(id, [
          { productVariantId: undefined, sizeLabel: 'S', quantity: 4 },
        ]),
      );

      await expect(requests.totalQuantity(id)).resolves.toBe(4);
    });

    it('freezes the breakdown once quoted, so a priced quantity cannot change', async () => {
      const id = await submitRequest();
      await moveTo(id, ['UNDER_REVIEW', 'QUOTED']);

      const error = await failureOf(() =>
        context.inTransaction(() => requests.replaceBreakdown(id, [])),
      );

      expect(error.code).toBe('BREAKDOWN_FROZEN');
      await expect(requests.totalQuantity(id)).resolves.toBe(25);
    });
  });
});
