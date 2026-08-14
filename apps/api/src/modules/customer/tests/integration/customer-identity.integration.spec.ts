/**
 * CTX-CUS customer identity persistence against a real PostgreSQL instance
 * (DB7-CP3).
 *
 * TBL-004 `customers`, TBL-005 `customer_contact_points` and TBL-078
 * `business_profiles`: verified-customer creation, the contact uniqueness
 * arbiter, the primary-contact marker and anonymization. Verification
 * challenges and secure grants have their own suite.
 */
import { isPersistenceError, newId } from '@embroidery/database';
import type { PersistenceError } from '@embroidery/database';
import { sql } from 'drizzle-orm';

import { createPersistenceTestContext } from '../../../../tests/integration/persistence-test-context';
import type { PersistenceTestContext } from '../../../../tests/integration/persistence-test-context';
import { AuditContextModule } from '../../../../platform/audit-context/audit-context.module';
import { RequestContextModule } from '../../../../platform/request-context/request-context.module';
import { CustomerModule } from '../../customer.module';
import { CUSTOMER_REPOSITORY } from '../../domain/repositories/customer.repository';
import type {
  ContactPointId,
  CustomerId,
  CustomerRepository,
} from '../../domain/repositories/customer.repository';

describe('customer identity persistence (integration)', () => {
  let context: PersistenceTestContext;
  let customers: CustomerRepository;

  beforeAll(async () => {
    context = await createPersistenceTestContext('cp3-customer-identity', [
      // The global platform context modules. In production `CustomerModule`
      // reaches them through `AppModule`; a suite that composes it alone has to
      // say so, because its application layer correlates by request id.
      RequestContextModule,
      AuditContextModule,
      CustomerModule,
    ]);
    customers = context.get(CUSTOMER_REPOSITORY);
  }, 120_000);

  afterAll(async () => {
    await context?.close();
  });

  afterEach(async () => {
    await context.reset();
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

  function createCustomer(value = 'a@example.com'): Promise<{ id: CustomerId }> {
    const id = newId() as CustomerId;
    return context.inTransaction(() =>
      customers.createWithVerifiedContact({
        id,
        displayName: 'Test Customer',
        contact: {
          id: newId() as ContactPointId,
          contactKind: 'EMAIL',
          normalizedValue: value,
          displayValue: value,
          verifiedSource: 'OTP',
        },
        verifiedAt: new Date(),
      }),
    );
  }

  describe('customer creation', () => {
    it('creates a customer with its first verified contact', async () => {
      const created = await createCustomer();

      const loaded = await customers.findById(created.id);
      const contacts = await customers.listContactPoints(created.id);

      expect(loaded?.verifiedAt).toBeInstanceOf(Date);
      expect(contacts).toHaveLength(1);
      expect(contacts[0]?.isPrimary).toBe(true);
      expect(contacts[0]?.verifiedAt).toBeInstanceOf(Date);
    });

    it('resolves a returning customer by their verified contact', async () => {
      const created = await createCustomer('returning@example.com');

      const found = await customers.findByVerifiedContact('EMAIL', 'returning@example.com');

      expect(found?.id).toBe(created.id);
    });

    it('refuses to create outside a transaction — a customer with no contact is not a valid state', async () => {
      await expect(
        customers.createWithVerifiedContact({
          id: newId() as CustomerId,
          contact: {
            id: newId() as ContactPointId,
            contactKind: 'EMAIL',
            normalizedValue: 'no-tx@example.com',
            displayValue: 'no-tx@example.com',
            verifiedSource: 'OTP',
          },
          verifiedAt: new Date(),
        }),
      ).rejects.toThrow(/must run inside a transaction/);
    });

    it('rejects a second customer claiming the same verified contact', async () => {
      await createCustomer('shared@example.com');

      const error = await failureOf(() => createCustomer('shared@example.com'));

      expect(error.code).toBe('CONTACT_ALREADY_VERIFIED');
      expect(error.diagnostics.constraint).toBe('uq_customer_contact_points__kind_value__verified');
    });

    it('rolls the customer back when its contact insert fails', async () => {
      await createCustomer('taken@example.com');
      const id = newId() as CustomerId;

      await expect(
        context.inTransaction(() =>
          customers.createWithVerifiedContact({
            id,
            contact: {
              id: newId() as ContactPointId,
              contactKind: 'EMAIL',
              normalizedValue: 'taken@example.com',
              displayValue: 'taken@example.com',
              verifiedSource: 'OTP',
            },
            verifiedAt: new Date(),
          }),
        ),
      ).rejects.toBeDefined();

      // No orphan customer: the contact is what makes the customer reachable.
      await expect(customers.findById(id)).resolves.toBeUndefined();
    });

    it('never leaks the colliding contact value', async () => {
      await createCustomer('private@example.com');

      const error = await failureOf(() => createCustomer('private@example.com'));

      expect(error.message).not.toContain('private@example.com');
      expect(JSON.stringify({ ...error })).not.toContain('private@example.com');
    });
  });

  describe('contact points', () => {
    it('adds an unverified contact that does not claim the uniqueness arbiter', async () => {
      const first = await createCustomer('one@example.com');
      const second = await createCustomer('two@example.com');

      // Both customers may hold the *same* unverified value; only verification
      // makes it exclusive.
      for (const customer of [first, second]) {
        await context.inTransaction(() =>
          customers.addContactPoint({
            id: newId() as ContactPointId,
            customerId: customer.id,
            contactKind: 'PHONE',
            normalizedValue: '+84900000000',
            displayValue: '0900 000 000',
          }),
        );
      }

      await expect(customers.listContactPoints(first.id)).resolves.toHaveLength(2);
    });

    it('rejects verifying a value another customer already verified', async () => {
      await createCustomer('owner@example.com');
      const other = await createCustomer('other@example.com');
      const added = await context.inTransaction(() =>
        customers.addContactPoint({
          id: newId() as ContactPointId,
          customerId: other.id,
          contactKind: 'EMAIL',
          normalizedValue: 'owner@example.com',
          displayValue: 'owner@example.com',
        }),
      );

      const error = await failureOf(() =>
        context.inTransaction(() => customers.markContactVerified(added.id, new Date(), 'OTP')),
      );

      expect(error.code).toBe('CONTACT_ALREADY_VERIFIED');
    });

    it('moves the primary marker without ever having two primaries', async () => {
      const customer = await createCustomer();
      const second = await context.inTransaction(() =>
        customers.addContactPoint({
          id: newId() as ContactPointId,
          customerId: customer.id,
          contactKind: 'PHONE',
          normalizedValue: '+84911111111',
          displayValue: '0911 111 111',
        }),
      );

      await context.inTransaction(() => customers.setPrimaryContact(customer.id, second.id));

      const contacts = await customers.listContactPoints(customer.id);
      expect(contacts.filter((c) => c.isPrimary)).toHaveLength(1);
      expect(contacts.find((c) => c.isPrimary)?.id).toBe(second.id);
    });

    it('refuses to make another customer’s contact primary', async () => {
      const mine = await createCustomer('mine@example.com');
      const theirs = await createCustomer('theirs@example.com');
      const theirContact = (await customers.listContactPoints(theirs.id))[0];

      const error = await failureOf(() =>
        context.inTransaction(() =>
          customers.setPrimaryContact(mine.id, theirContact?.id as ContactPointId),
        ),
      );

      expect(error.code).toBe('CONTACT_BELONGS_TO_ANOTHER_CUSTOMER');
    });
  });

  describe('business profile', () => {
    it('creates then updates in place', async () => {
      const customer = await createCustomer();

      await context.inTransaction(() =>
        customers.upsertBusinessProfile({ customerId: customer.id, companyName: 'First Co' }),
      );
      await context.inTransaction(() =>
        customers.upsertBusinessProfile({
          customerId: customer.id,
          companyName: 'Renamed Co',
          taxCode: '123',
        }),
      );

      const [row] = (
        await context.disposable.client.db.execute<{ company_name: string; tax_code: string }>(
          sql`select company_name, tax_code from business_profiles where customer_id = ${customer.id}`,
        )
      ).rows;
      expect(row?.company_name).toBe('Renamed Co');
      expect(row?.tax_code).toBe('123');
    });
  });

  describe('anonymization', () => {
    it('clears the customer and its contacts together', async () => {
      const customer = await createCustomer('pii@example.com');

      await context.inTransaction(() => customers.anonymize(customer.id, new Date()));

      const loaded = await customers.findById(customer.id);
      const contacts = await customers.listContactPoints(customer.id);
      expect(loaded?.anonymizedAt).toBeInstanceOf(Date);
      expect(loaded?.displayName).not.toContain('Test Customer');
      expect(contacts[0]?.displayValue).not.toContain('pii@example.com');
      // A customer marked anonymized whose contact still held the address
      // would be a false claim — the address is the actual PII.
      expect(contacts[0]?.normalizedValue).not.toContain('pii@example.com');
    });

    it('frees the contact value for reuse once anonymized', async () => {
      const customer = await createCustomer('reusable@example.com');
      await context.inTransaction(() => customers.anonymize(customer.id, new Date()));

      await expect(createCustomer('reusable@example.com')).resolves.toBeDefined();
    });
  });
});
