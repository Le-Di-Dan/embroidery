/**
 * The two Admin contact-maintenance actions (`APP10-B01` §5, §6).
 *
 * Promotion moves the primary designation between contacts that already exist;
 * deactivation retires one. Neither creates a contact, neither overwrites a
 * contact value, and neither writes or clears `verified_at`.
 *
 * That last sentence is the checkpoint's security boundary, so it is worth
 * being exact about why. A verified contact is the whole of what a Customer
 * identity *is* (ADR-DB2-001 r3): the row exists because somebody proved
 * possession of that channel through a verification challenge. An Admin
 * endpoint that could mark a contact verified, or edit the value under an
 * existing `verified_at`, would mint that proof from a staff session — which
 * is the same as not requiring it. So B01 owns the two operations that need no
 * new evidence, and adding a channel stays with the challenge flow (LC-02).
 *
 * ### Both are one transaction, and the reads are inside it
 *
 * `listContactPoints` runs in the same transaction as the write it authorizes,
 * so the rows the policy decided on are the rows the statement then guards
 * against. Promotion needs the boundary anyway — `setPrimaryContact` clears the
 * old designation and sets the new one, and CST-006 permits exactly one primary
 * per customer, so the pair is only legal as an atomic step. Deactivation needs
 * it for the audit row, and for the last-verified-contact rule, which is
 * decided from a list that must not move underneath it.
 *
 * ### A replay writes nothing
 *
 * Promoting the contact that is already primary, and deactivating one that is
 * already retired, are successes that append no audit event. The state is
 * already the requested state; a row claiming a change would be false, and
 * `audit_events` is append-only with no correction path.
 */
import { Inject, Injectable } from '@nestjs/common';
import { TransactionManager } from '@embroidery/persistence';

import { CustomerMaintenanceAuditRecorder } from './customer-maintenance-audit.recorder';
import {
  currentPrimary,
  deactivationOutcome,
  promotionOutcome,
  requireMaintainableCustomer,
  requireOwnedContact,
} from '../domain/maintenance/customer-maintenance.policy';
import {
  CUSTOMER_REPOSITORY,
  type ContactPoint,
  type ContactPointId,
  type CustomerId,
  type CustomerRepository,
} from '../domain/repositories/customer.repository';

export interface MaintainCustomerContactCommand {
  readonly customerId: CustomerId;
  readonly contactPointId: ContactPointId;
}

@Injectable()
export class MaintainCustomerContact {
  constructor(
    @Inject(CUSTOMER_REPOSITORY) private readonly customers: CustomerRepository,
    private readonly transactions: TransactionManager,
    private readonly audit: CustomerMaintenanceAuditRecorder,
  ) {}

  /**
   * Makes an already-verified, active, owned contact the primary one.
   *
   * The previous primary is read *before* the rotation, because the audit row
   * records which contact lost the designation and the statement that moves it
   * has already overwritten that fact by the time it returns.
   */
  async promote(command: MaintainCustomerContactCommand): Promise<void> {
    await this.transactions.runInTransaction(async () => {
      const contacts = await this.loadOwnedContacts(command);
      const target = requireOwnedContact(contacts, command.contactPointId);

      if (promotionOutcome(target) === 'ALREADY_PRIMARY') {
        return;
      }

      const previous = currentPrimary(contacts);
      await this.customers.setPrimaryContact(command.customerId, command.contactPointId);
      await this.audit.recordPrimaryContactChanged({
        customerId: command.customerId,
        contactPointId: target.id,
        contactKind: target.contactKind,
        previousPrimaryContactPointId: previous?.id,
      });
    });
  }

  /** Retires an owned contact that is neither primary nor the last verified one. */
  async deactivate(command: MaintainCustomerContactCommand): Promise<void> {
    await this.transactions.runInTransaction(async () => {
      const contacts = await this.loadOwnedContacts(command);
      const target = requireOwnedContact(contacts, command.contactPointId);

      if (deactivationOutcome(contacts, target) === 'ALREADY_DEACTIVATED') {
        return;
      }

      await this.customers.deactivateContactPoint(target.id);
      await this.audit.recordContactDeactivated({
        customerId: command.customerId,
        contactPointId: target.id,
        contactKind: target.contactKind,
      });
    });
  }

  /**
   * The customer's own contacts, or a refusal.
   *
   * Loaded by **customer**, never by contact id. `findContactPoint` exists and
   * would be one query instead of two, and using it is the defect this method
   * is shaped to prevent: it returns any customer's row, so the ownership test
   * would then be a comparison performed on a foreign record this code had
   * already read. Listing the customer's contacts means a contact belonging to
   * somebody else is simply not in the list, and the "not found" answer is
   * produced by the same line that produces it for an id naming nothing at all.
   */
  private async loadOwnedContacts(
    command: MaintainCustomerContactCommand,
  ): Promise<readonly ContactPoint[]> {
    requireMaintainableCustomer(await this.customers.findById(command.customerId));
    return this.customers.listContactPoints(command.customerId);
  }
}
