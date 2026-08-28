/**
 * Bounded Admin maintenance of a Customer's profile metadata (`APP10-B01` §4).
 *
 * Two fields — `customers.display_name` and `customers.notes` — and nothing
 * else is reachable from here. The command type below declares exactly those
 * two, the repository input declares the same two, and the Drizzle `set` object
 * is built member by member from them: there is no spread of a caller-supplied
 * object anywhere on the path, so a body that invented `verifiedAt`,
 * `mergedIntoCustomerId` or `anonymizedAt` would be rejected by the strict
 * request schema and, even if it were not, would have nothing here to flow
 * into.
 *
 * ### A patch that changes nothing writes nothing
 *
 * The command is compared against the loaded row before the write is issued.
 * When every supplied field already holds the supplied value, the operation
 * succeeds and returns without touching `customers` and without appending an
 * audit event. This is not an optimization. `audit_events` is append-only and
 * outlives its subject (G-DB7-46); a row saying an operator changed a customer
 * when they changed nothing is a false record, and a screen that saves on blur
 * would fill the trail with them.
 *
 * ### One transaction, for the evidence
 *
 * The write is a single-row, single-table UPDATE and needs no atomicity of its
 * own. The transaction is here because the audit row must land with it: an
 * audited action that rolled back, or evidence that survived a failed write,
 * would each be a lie in a different direction.
 */
import { Inject, Injectable } from '@nestjs/common';
import { TransactionManager } from '@embroidery/persistence';

import {
  CustomerMaintenanceAuditRecorder,
  type MaintainedProfileField,
} from './customer-maintenance-audit.recorder';
import { requireMaintainableCustomer } from '../domain/maintenance/customer-maintenance.policy';
import {
  CUSTOMER_REPOSITORY,
  type Customer,
  type CustomerId,
  type CustomerRepository,
  type UpdateCustomerProfileInput,
} from '../domain/repositories/customer.repository';

/**
 * The patch, already normalized by the wire layer.
 *
 * `undefined` means the caller did not mention the field and it must not move.
 * `null` means the caller asked for it to be cleared. The two are deliberately
 * different values rather than one nullable one, because collapsing them is how
 * an omitted field silently wipes a column.
 */
export interface MaintainCustomerProfileCommand {
  readonly customerId: CustomerId;
  readonly displayName?: string | null;
  readonly notes?: string | null;
}

@Injectable()
export class MaintainCustomerProfile {
  constructor(
    @Inject(CUSTOMER_REPOSITORY) private readonly customers: CustomerRepository,
    private readonly transactions: TransactionManager,
    private readonly audit: CustomerMaintenanceAuditRecorder,
  ) {}

  async update(command: MaintainCustomerProfileCommand): Promise<void> {
    await this.transactions.runInTransaction(async () => {
      const customer = requireMaintainableCustomer(
        await this.customers.findById(command.customerId),
      );

      const changedFields = changesOf(customer, command);
      if (changedFields.length === 0) {
        return;
      }

      await this.customers.updateProfile(command.customerId, patchOf(command, changedFields));
      await this.audit.recordProfileUpdated({ customerId: command.customerId, changedFields });
    });
  }
}

/**
 * Which of the two fields the command would actually move.
 *
 * The comparison is against the stored value as the domain represents it: the
 * repository maps a NULL column to `undefined`, and clearing a field that is
 * already NULL therefore has to compare equal. `null` and `undefined` mean the
 * same thing about the *column* even though they mean different things in the
 * command, and this is the one place that equivalence is stated.
 */
function changesOf(
  customer: Customer,
  command: MaintainCustomerProfileCommand,
): MaintainedProfileField[] {
  const changed: MaintainedProfileField[] = [];
  if (command.displayName !== undefined && !sameStored(customer.displayName, command.displayName)) {
    changed.push('displayName');
  }
  if (command.notes !== undefined && !sameStored(customer.notes, command.notes)) {
    changed.push('notes');
  }
  return changed;
}

function sameStored(stored: string | undefined, requested: string | null): boolean {
  return requested === null ? stored === undefined : stored === requested;
}

/**
 * The repository input, carrying only the fields that actually change.
 *
 * Built from the *computed* change list rather than from the command, so a
 * field the caller supplied unchanged is not restated in the UPDATE. It keeps
 * `updated_at` meaning "when this customer last really changed".
 */
function patchOf(
  command: MaintainCustomerProfileCommand,
  changed: readonly MaintainedProfileField[],
): UpdateCustomerProfileInput {
  return {
    ...(changed.includes('displayName') ? { displayName: command.displayName ?? null } : {}),
    ...(changed.includes('notes') ? { notes: command.notes ?? null } : {}),
  };
}
