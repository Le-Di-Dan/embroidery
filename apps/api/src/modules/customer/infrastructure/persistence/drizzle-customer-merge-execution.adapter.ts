/**
 * CTX-CUS's destructive half of merge execution (`APP10-B03` §7, §8, §11, §15).
 *
 * Eight statements against three of Customer's own tables — `customers`,
 * `customer_contact_points`, `business_profiles` — and nothing else. There is no
 * statement here that reads or writes `custom_requests`, `orders`, `assets` or
 * `secure_access_grants`: three of those belong to other modules and reach the
 * merge through their own ports, and the fourth is written through the delivered
 * `SecureAccessGrantRepository` so a revocation keeps one owner.
 *
 * Every method requires the ambient transaction. That is not defensive
 * decoration: a lock taken outside a transaction is released the instant its
 * statement ends, and a transfer committed on its own would be the half-merge
 * the whole checkpoint exists to prevent.
 */
import { Injectable } from '@nestjs/common';
import { schema } from '@embroidery/database';
import { DatabaseExecutor, DrizzleRepository } from '@embroidery/persistence';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';

import type {
  CustomerMergeExecutionPort,
  LockedContactPoint,
  LockedMergeParticipants,
} from '../../domain/repositories/customer-merge-execution.port';
import type { ContactPointId, CustomerId } from '../../domain/repositories/customer.repository';
import { toCustomer } from './customer-row.mapper';

const { businessProfiles, customerContactPoints, customers } = schema;

@Injectable()
export class DrizzleCustomerMergeExecutionAdapter
  extends DrizzleRepository
  implements CustomerMergeExecutionPort
{
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  /**
   * Both customer rows, locked in primary-key order (CC-27 / D8-18).
   *
   * `ORDER BY id` sits above `FOR UPDATE` in the plan, so the rows are locked in
   * the sorted sequence rather than in whatever order the index scan produced.
   * That is what makes the ordering *deterministic across transactions*: two
   * merges naming the same pair in opposite directions take the same two rows in
   * the same sequence and queue, instead of each holding the row the other wants.
   *
   * The ordering is decided here, inside the statement, and not by the caller —
   * a discipline a use case has to remember is one a use case can forget.
   */
  async lockParticipants(
    survivorCustomerId: CustomerId,
    loserCustomerId: CustomerId,
  ): Promise<LockedMergeParticipants> {
    return this.run('lockParticipants', async () => {
      const tx = this.requireTransaction('lockParticipants');
      const rows = await tx
        .select()
        .from(customers)
        .where(inArray(customers.id, [survivorCustomerId, loserCustomerId]))
        .orderBy(asc(customers.id))
        .for('update');

      const found = rows.map(toCustomer);
      return {
        survivor: found.find((customer) => customer.id === survivorCustomerId),
        loser: found.find((customer) => customer.id === loserCustomerId),
      };
    });
  }

  /**
   * Every contact row of both customers, locked and ordered by id.
   *
   * Both sides because the primary rule is about the pair, and ordered so two
   * merges touching an overlapping contact set take those rows in one sequence.
   * The projection is three columns: the values are never selected, so this path
   * cannot hold an address or a number at all.
   */
  async lockContactPoints(
    survivorCustomerId: CustomerId,
    loserCustomerId: CustomerId,
  ): Promise<LockedContactPoint[]> {
    return this.run('lockContactPoints', async () => {
      const tx = this.requireTransaction('lockContactPoints');
      const rows = await tx
        .select({
          id: customerContactPoints.id,
          customerId: customerContactPoints.customerId,
          isPrimary: customerContactPoints.isPrimary,
        })
        .from(customerContactPoints)
        .where(inArray(customerContactPoints.customerId, [survivorCustomerId, loserCustomerId]))
        .orderBy(asc(customerContactPoints.id))
        .for('update');

      return rows.map((row) => ({
        id: row.id as ContactPointId,
        customerId: row.customerId as CustomerId,
        isPrimary: row.isPrimary,
      }));
    });
  }

  /** Clears `is_primary`, and only that column. See the port's note. */
  async demotePrimaryContacts(contactPointIds: readonly ContactPointId[]): Promise<void> {
    return this.run('demotePrimaryContacts', async () => {
      if (contactPointIds.length === 0) {
        return;
      }
      const tx = this.requireTransaction('demotePrimaryContacts');
      await tx
        .update(customerContactPoints)
        .set({ isPrimary: false, updatedAt: new Date() })
        .where(inArray(customerContactPoints.id, [...contactPointIds]));
    });
  }

  /**
   * Repoints the loser's contacts, returning the affected count.
   *
   * One statement, so the count is the database's own answer about the rows it
   * actually changed — the number that goes into the `CONTACT_MOVE` evidence.
   * The `set` object carries `customer_id` and `updated_at`; every other column
   * of every moved row is left exactly as it was, which is what makes this a
   * transfer of ownership rather than a re-verification.
   */
  async moveContactPoints(
    loserCustomerId: CustomerId,
    survivorCustomerId: CustomerId,
  ): Promise<number> {
    return this.run('moveContactPoints', async () => {
      const tx = this.requireTransaction('moveContactPoints');
      const moved = await tx
        .update(customerContactPoints)
        .set({ customerId: survivorCustomerId, updatedAt: new Date() })
        .where(eq(customerContactPoints.customerId, loserCustomerId))
        .returning({ id: customerContactPoints.id });

      return moved.length;
    });
  }

  /**
   * Which of the two customers holds a business profile, under `FOR UPDATE`.
   *
   * Locked rather than merely read: CST-051 allows one profile per customer, and
   * a profile inserted for the survivor between the preview and the merge is
   * exactly the case that has to fail closed. Only `customer_id` is selected —
   * `company_name`, `tax_code` and `billing_contact` are PII and the merge has no
   * use for them.
   */
  async lockBusinessProfileOwnership(
    survivorCustomerId: CustomerId,
    loserCustomerId: CustomerId,
  ): Promise<{ readonly survivorHasProfile: boolean; readonly loserHasProfile: boolean }> {
    return this.run('lockBusinessProfileOwnership', async () => {
      const tx = this.requireTransaction('lockBusinessProfileOwnership');
      const rows = await tx
        .select({ customerId: businessProfiles.customerId })
        .from(businessProfiles)
        .where(inArray(businessProfiles.customerId, [survivorCustomerId, loserCustomerId]))
        .orderBy(asc(businessProfiles.customerId))
        .for('update');

      return {
        survivorHasProfile: rows.some((row) => row.customerId === survivorCustomerId),
        loserHasProfile: rows.some((row) => row.customerId === loserCustomerId),
      };
    });
  }

  async moveBusinessProfile(
    loserCustomerId: CustomerId,
    survivorCustomerId: CustomerId,
  ): Promise<number> {
    return this.run('moveBusinessProfile', async () => {
      const tx = this.requireTransaction('moveBusinessProfile');
      const moved = await tx
        .update(businessProfiles)
        .set({ customerId: survivorCustomerId, updatedAt: new Date() })
        .where(eq(businessProfiles.customerId, loserCustomerId))
        .returning({ id: businessProfiles.id });

      return moved.length;
    });
  }

  /**
   * The tombstone (`APP10-B03` §15).
   *
   * `merged_into_customer_id IS NULL` is in the predicate, so a customer another
   * merge tombstoned in the meantime matches nothing and this answers `false`.
   * Nothing else about the row is written: the display name, the notes, the
   * verification instant and `anonymized_at` are untouched, because the loser
   * remains the historical identity record every frozen snapshot points at.
   */
  async tombstone(loserCustomerId: CustomerId, survivorCustomerId: CustomerId): Promise<boolean> {
    return this.run('tombstone', async () => {
      const tx = this.requireTransaction('tombstone');
      const written = await tx
        .update(customers)
        .set({ mergedIntoCustomerId: survivorCustomerId, updatedAt: new Date() })
        .where(and(eq(customers.id, loserCustomerId), isNull(customers.mergedIntoCustomerId)))
        .returning({ id: customers.id });

      return written.length === 1;
    });
  }
}
