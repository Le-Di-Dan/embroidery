/**
 * Audit Event persistence against a real PostgreSQL instance (DB7-CP4).
 *
 * TBL-072 and guard G-DB7-46: the polymorphic target has no foreign key
 * (REL-103), because an audit row must outlive the thing it describes.
 */
import { isPersistenceError, newId, withMappedErrors } from '@embroidery/database';
import type { PersistenceError } from '@embroidery/database';
import { sql } from 'drizzle-orm';

import { createPersistenceTestContext } from '../../../../tests/integration/persistence-test-context';
import type { PersistenceTestContext } from '../../../../tests/integration/persistence-test-context';
import { AuditModule } from '../../audit.module';
import { AUDIT_EVENT_REPOSITORY } from '../../domain/repositories/audit-event.repository';
import type { AuditEventRepository } from '../../domain/repositories/audit-event.repository';

describe('audit persistence (integration)', () => {
  let context: PersistenceTestContext;
  let events: AuditEventRepository;
  let adminId: string;

  beforeAll(async () => {
    context = await createPersistenceTestContext('cp4-audit', [AuditModule]);
    events = context.get(AUDIT_EVENT_REPOSITORY);
  }, 120_000);

  afterAll(async () => {
    await context?.close();
  });

  beforeEach(async () => {
    await context.reset();
    adminId = newId();
    await context.disposable.client.db.execute(sql`
      insert into admin_accounts (id, email, display_name, status)
      values (${adminId}, ${`audit-admin-${adminId}@example.com`}, 'Admin', 'ACTIVE')
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

  describe('append', () => {
    it('appends an event with admin actor evidence', async () => {
      const targetId = newId();
      const correlationId = newId();

      await events.append({
        occurredAt: new Date(),
        actor: { kind: 'ADMIN', adminId },
        action: 'ORDER_CANCELLED',
        targetKind: 'ORDER',
        targetId,
        reason: 'Customer requested cancellation',
        correlationId,
      });

      const rows = await events.listByTarget('ORDER', targetId);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ action: 'ORDER_CANCELLED', actorKind: 'ADMIN' });
    });

    it('appends an event with a system actor', async () => {
      const targetId = newId();

      await events.append({
        occurredAt: new Date(),
        actor: { kind: 'SYSTEM', systemJobKey: 'reconciliation.job' },
        action: 'PAYMENT_RECONCILED',
        targetKind: 'PAYMENT_OBLIGATION',
        targetId,
        correlationId: newId(),
      });

      const rows = await events.listByTarget('PAYMENT_OBLIGATION', targetId);
      expect(rows[0]?.actorKind).toBe('SYSTEM');
    });

    it('rejects an unrecognised target kind before it ever reaches the database', async () => {
      const error = await failureOf(() =>
        events.append({
          occurredAt: new Date(),
          actor: { kind: 'ADMIN', adminId },
          action: 'MYSTERY_ACTION',
          targetKind: 'NOT_A_REAL_KIND' as never,
          targetId: newId(),
          correlationId: newId(),
        }),
      );

      expect(error.code).toBe('UNKNOWN_AUDIT_TARGET_KIND');
    });

    it('does not resolve the target id — G-DB7-46 permits a target that no longer exists', async () => {
      // No FK backs target_id, and this asserts exactly that: an id for a
      // customer that was never created (and may later be anonymized or
      // deleted) is still accepted, because the audit row must outlive it.
      const phantomTargetId = newId();

      await expect(
        events.append({
          occurredAt: new Date(),
          actor: { kind: 'SYSTEM', systemJobKey: 'retention.sweep' },
          action: 'CUSTOMER_ANONYMIZED',
          targetKind: 'CUSTOMER',
          targetId: phantomTargetId,
          correlationId: newId(),
        }),
      ).resolves.toBeUndefined();

      await expect(events.listByTarget('CUSTOMER', phantomTargetId)).resolves.toHaveLength(1);
    });

    it('joins the caller transaction, so a rolled-back action leaves no audit trail', async () => {
      const targetId = newId();

      await expect(
        context.inTransaction(async () => {
          await events.append({
            occurredAt: new Date(),
            actor: { kind: 'ADMIN', adminId },
            action: 'ORDER_CANCELLED',
            targetKind: 'ORDER',
            targetId,
            correlationId: newId(),
          });
          throw new Error('domain work failed after the audit append');
        }),
      ).rejects.toThrow('domain work failed after the audit append');

      // An audited action that rolled back would be a false record of
      // something that never happened.
      await expect(events.listByTarget('ORDER', targetId)).resolves.toEqual([]);
    });
  });

  describe('reads', () => {
    it('lists by correlation id across different targets', async () => {
      const correlationId = newId();
      const orderTarget = newId();
      const paymentTarget = newId();

      await events.append({
        occurredAt: new Date(),
        actor: { kind: 'ADMIN', adminId },
        action: 'ORDER_CANCELLED',
        targetKind: 'ORDER',
        targetId: orderTarget,
        correlationId,
      });
      await events.append({
        occurredAt: new Date(),
        actor: { kind: 'ADMIN', adminId },
        action: 'REFUND_APPROVED',
        targetKind: 'REFUND',
        targetId: paymentTarget,
        correlationId,
      });

      const rows = await events.listByCorrelation(correlationId);
      expect(rows).toHaveLength(2);
    });

    it('orders results newest first', async () => {
      const targetId = newId();
      await events.append({
        occurredAt: new Date(Date.now() - 10_000),
        actor: { kind: 'ADMIN', adminId },
        action: 'FIRST',
        targetKind: 'ORDER',
        targetId,
        correlationId: newId(),
      });
      await events.append({
        occurredAt: new Date(),
        actor: { kind: 'ADMIN', adminId },
        action: 'SECOND',
        targetKind: 'ORDER',
        targetId,
        correlationId: newId(),
      });

      const rows = await events.listByTarget('ORDER', targetId);
      expect(rows.map((row) => row.action)).toEqual(['SECOND', 'FIRST']);
    });
  });

  describe('immutability', () => {
    it('rejects a mutation of a recorded event via the S24 trigger', async () => {
      const targetId = newId();
      const correlationId = newId();
      await events.append({
        occurredAt: new Date(),
        actor: { kind: 'ADMIN', adminId },
        action: 'ORDER_CANCELLED',
        targetKind: 'ORDER',
        targetId,
        correlationId,
      });

      const error = await failureOf(() =>
        withMappedErrors('probe.tamperAuditEvent', () =>
          context.disposable.client.db.execute(
            sql`update audit_events set action = 'TAMPERED' where correlation_id = ${correlationId}`,
          ),
        ),
      );

      expect(error.kind).toBe('IMMUTABLE_EVIDENCE');
    });

    it('rejects deletion via the S24 trigger', async () => {
      const targetId = newId();
      const correlationId = newId();
      await events.append({
        occurredAt: new Date(),
        actor: { kind: 'ADMIN', adminId },
        action: 'ORDER_CANCELLED',
        targetKind: 'ORDER',
        targetId,
        correlationId,
      });

      const error = await failureOf(() =>
        withMappedErrors('probe.deleteAuditEvent', () =>
          context.disposable.client.db.execute(
            sql`delete from audit_events where correlation_id = ${correlationId}`,
          ),
        ),
      );

      expect(error.kind).toBe('IMMUTABLE_EVIDENCE');
    });
  });
});
