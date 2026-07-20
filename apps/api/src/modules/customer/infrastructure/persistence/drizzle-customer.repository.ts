/**
 * Drizzle implementation of the AGG-02 Customer contract
 * (TBL-004 `customers`, TBL-005 `customer_contact_points`, TBL-078
 * `business_profiles`).
 *
 * Contact points and the business profile are children: they have no life
 * outside their customer and are written here, never through repositories of
 * their own (DB7 §10.1).
 */
import { Injectable } from '@nestjs/common';
import { DatabaseExecutor, DrizzleRepository } from '@embroidery/persistence';
import { guardViolationError, newId, notFoundError, schema } from '@embroidery/database';
import type { ContactKind } from '@embroidery/database';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';

import type {
  AddContactPointInput,
  ContactPoint,
  ContactPointId,
  CreateVerifiedCustomerInput,
  Customer,
  CustomerId,
  CustomerRepository,
  UpsertBusinessProfileInput,
} from '../../domain/repositories/customer.repository';
import { ANONYMIZED_MARKER, toContact, toCustomer } from './customer-row.mapper';

const { customers, customerContactPoints, businessProfiles } = schema;

@Injectable()
export class DrizzleCustomerRepository extends DrizzleRepository implements CustomerRepository {
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  async createWithVerifiedContact(input: CreateVerifiedCustomerInput): Promise<Customer> {
    return this.run('createWithVerifiedContact', async () => {
      const tx = this.requireTransaction('createWithVerifiedContact');

      const [customer] = await tx
        .insert(customers)
        .values({
          id: input.id,
          displayName: input.displayName ?? null,
          verifiedAt: input.verifiedAt,
        })
        .returning();

      await tx.insert(customerContactPoints).values({
        id: input.contact.id,
        customerId: input.id,
        contactKind: input.contact.contactKind,
        normalizedValue: input.contact.normalizedValue,
        displayValue: input.contact.displayValue,
        // The first contact is the primary one by definition: a customer
        // created from a verified contact has exactly one.
        isPrimary: true,
        verifiedAt: input.verifiedAt,
        verifiedSource: input.contact.verifiedSource,
      });

      if (customer === undefined) {
        throw guardViolationError(
          'CustomerRepository.createWithVerifiedContact',
          'CUSTOMER_NOT_CREATED',
          'Could not create the customer.',
        );
      }
      return toCustomer(customer);
    });
  }

  async addContactPoint(input: AddContactPointInput): Promise<ContactPoint> {
    return this.run('addContactPoint', async () => {
      const [row] = await this.db
        .insert(customerContactPoints)
        .values({
          id: input.id,
          customerId: input.customerId,
          contactKind: input.contactKind,
          normalizedValue: input.normalizedValue,
          displayValue: input.displayValue,
          // Unverified and non-primary until it is verified: an unverified
          // contact must not claim the `(kind, value)` arbiter.
          isPrimary: false,
        })
        .returning();

      if (row === undefined) {
        throw guardViolationError(
          'CustomerRepository.addContactPoint',
          'CONTACT_NOT_ADDED',
          'Could not add the contact point.',
        );
      }
      return toContact(row);
    });
  }

  async markContactVerified(
    id: ContactPointId,
    verifiedAt: Date,
    verifiedSource: string,
  ): Promise<ContactPoint> {
    return this.run('markContactVerified', async () => {
      const [row] = await this.db
        .update(customerContactPoints)
        .set({ verifiedAt, verifiedSource, updatedAt: new Date() })
        .where(
          and(
            eq(customerContactPoints.id, id),
            // Not already deactivated: verifying a deactivated contact would
            // resurrect it into the uniqueness arbiter.
            isNull(customerContactPoints.deactivatedAt),
          ),
        )
        .returning();

      if (row === undefined) {
        throw notFoundError(
          'CustomerRepository.markContactVerified',
          'That contact point does not exist, or is no longer active.',
        );
      }
      return toContact(row);
    });
  }

  async setPrimaryContact(customerId: CustomerId, contactPointId: ContactPointId): Promise<void> {
    return this.run('setPrimaryContact', async () => {
      const tx = this.requireTransaction('setPrimaryContact');

      const [target] = await tx
        .select({ customerId: customerContactPoints.customerId })
        .from(customerContactPoints)
        .where(eq(customerContactPoints.id, contactPointId))
        .limit(1);

      if (target === undefined) {
        throw notFoundError(
          'CustomerRepository.setPrimaryContact',
          'That contact point does not exist.',
        );
      }
      if (target.customerId !== customerId) {
        // Same-root guard: the FK proves the contact exists, not that it
        // belongs to this customer.
        throw guardViolationError(
          'CustomerRepository.setPrimaryContact',
          'CONTACT_BELONGS_TO_ANOTHER_CUSTOMER',
          'That contact point does not belong to this customer.',
        );
      }

      // Clear first, then set: the partial unique index allows exactly one
      // primary per customer, so both statements must be in one transaction.
      await tx
        .update(customerContactPoints)
        .set({ isPrimary: false, updatedAt: new Date() })
        .where(
          and(
            eq(customerContactPoints.customerId, customerId),
            eq(customerContactPoints.isPrimary, true),
          ),
        );

      await tx
        .update(customerContactPoints)
        .set({ isPrimary: true, updatedAt: new Date() })
        .where(eq(customerContactPoints.id, contactPointId));
    });
  }

  async upsertBusinessProfile(input: UpsertBusinessProfileInput): Promise<void> {
    return this.run('upsertBusinessProfile', async () => {
      await this.db
        .insert(businessProfiles)
        .values({
          id: newId(),
          customerId: input.customerId,
          companyName: input.companyName,
          taxCode: input.taxCode ?? null,
          billingContact: input.billingContact ?? null,
        })
        .onConflictDoUpdate({
          target: businessProfiles.customerId,
          set: {
            companyName: input.companyName,
            taxCode: input.taxCode ?? null,
            billingContact: input.billingContact ?? null,
            updatedAt: new Date(),
          },
        });
    });
  }

  async anonymize(id: CustomerId, at: Date): Promise<void> {
    return this.run('anonymize', async () => {
      const tx = this.requireTransaction('anonymize');

      await tx
        .update(customers)
        .set({ displayName: ANONYMIZED_MARKER, anonymizedAt: at, notes: null, updatedAt: at })
        .where(eq(customers.id, id));

      // Contacts are cleared in the same transaction: a customer marked
      // anonymized while its contacts still hold the address would be a
      // false claim, and the addresses are the actual PII.
      await tx
        .update(customerContactPoints)
        .set({
          normalizedValue: `${ANONYMIZED_MARKER}:${id}`,
          displayValue: ANONYMIZED_MARKER,
          anonymizedAt: at,
          deactivatedAt: at,
          isPrimary: false,
          updatedAt: at,
        })
        .where(eq(customerContactPoints.customerId, id));
    });
  }

  async findById(id: CustomerId): Promise<Customer | undefined> {
    return this.run('findById', async () => {
      const [row] = await this.db.select().from(customers).where(eq(customers.id, id)).limit(1);
      return row === undefined ? undefined : toCustomer(row);
    });
  }

  async findByVerifiedContact(
    contactKind: ContactKind,
    normalizedValue: string,
  ): Promise<Customer | undefined> {
    return this.run('findByVerifiedContact', async () => {
      const [row] = await this.db
        .select({ customer: customers })
        .from(customerContactPoints)
        .innerJoin(customers, eq(customerContactPoints.customerId, customers.id))
        .where(
          and(
            eq(customerContactPoints.contactKind, contactKind),
            eq(customerContactPoints.normalizedValue, normalizedValue),
            // Exactly the predicate of `uq_customer_contact_points__kind_value__verified`,
            // so this lookup uses that index and can match at most one row.
            isNotNull(customerContactPoints.verifiedAt),
            isNull(customerContactPoints.deactivatedAt),
          ),
        )
        .limit(1);

      return row === undefined ? undefined : toCustomer(row.customer);
    });
  }

  async listContactPoints(customerId: CustomerId): Promise<ContactPoint[]> {
    return this.run('listContactPoints', async () => {
      const rows = await this.db
        .select()
        .from(customerContactPoints)
        .where(eq(customerContactPoints.customerId, customerId));
      return rows.map(toContact);
    });
  }

  async findContactPoint(id: ContactPointId): Promise<ContactPoint | undefined> {
    return this.run('findContactPoint', async () => {
      const [row] = await this.db
        .select()
        .from(customerContactPoints)
        .where(eq(customerContactPoints.id, id))
        .limit(1);
      return row === undefined ? undefined : toContact(row);
    });
  }
}
