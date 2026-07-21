/**
 * Append-heavy and queue-table volume for the DB9 dataset (DB9-CP1).
 *
 * These are the tables CP3 (queue claim contention) and CP4 (write
 * amplification) are actually about: `outbox_events`, `notification_intents`
 * and their attempts, `audit_events`, `inventory_ledger_entries`, and the
 * transition histories behind QX-01.
 *
 * The queue-ready subset is deliberately small (`readyFraction`). A queue
 * table where every row is claimable makes a partial index look free; a
 * queue table where 10–15% is claimable is what the index was designed for,
 * and is the only shape where `FOR UPDATE SKIP LOCKED` contention is worth
 * measuring.
 *
 * Test-only.
 */
import { sql } from 'drizzle-orm';

import type { OrderFixture } from '../../modules/order/tests/integration/order-fixture';
import type { PlanRunner } from './bench-plan';
import type { DatasetTier } from './bench-dataset-tiers';

export async function seedQueueVolume(
  runner: PlanRunner,
  spec: DatasetTier,
  seed: string,
  backbone: OrderFixture,
): Promise<void> {
  const readyEvery = Math.max(2, Math.round(1 / spec.readyFraction));

  await runner.execute(sql`
    insert into outbox_events
      (event_type, aggregate_kind, aggregate_id, payload, payload_schema_version,
       status, attempt_count, next_attempt_at, dispatched_at)
    select (array['order.created', 'order.dispatched', 'payment.satisfied',
                  'design.approved', 'quotation.sent'])[1 + (n % 5)],
           'ORDER',
           bench_uuid(${`${seed}:order`}, 1 + (n % greatest(${spec.orders}, 1)))::text,
           '{}'::jsonb,
           1,
           case when n % ${readyEvery} = 0 then 'PENDING' else 'DISPATCHED' end,
           case when n % ${readyEvery} = 0 then n % 3 else 1 end,
           case when n % ${readyEvery} = 0 then now() - interval '1 minute' else null end,
           case when n % ${readyEvery} = 0 then null else now() - interval '1 day' end
    from generate_series(1, ${spec.outboxEvents}) as n
  `);

  await runner.execute(sql`
    insert into notification_intents
      (id, intent_key, template_key, template_version, channel,
       recipient_contact_point_id, recipient_masked, params, status, correlation_id)
    select bench_uuid(${`${seed}:intent`}, n),
           'intent-' || n,
           (array['order.confirmed', 'design.ready', 'payment.reminder'])[1 + (n % 3)],
           1,
           case when n % 4 = 0 then 'SMS' else 'EMAIL' end,
           bench_uuid(${`${seed}:contact`}, 1 + (n % greatest(${spec.customers}, 1))),
           'b***@example.com',
           '{}'::jsonb,
           case when n % ${readyEvery} = 0 then 'PENDING' else 'SATISFIED' end,
           'corr-' || n
    from generate_series(1, ${spec.notificationIntents}) as n
  `);

  await runner.execute(sql`
    insert into notification_delivery_attempts
      (intent_id, channel, outcome, provider_message_ref, attempted_at)
    select bench_uuid(${`${seed}:intent`}, 1 + (n % greatest(${spec.notificationIntents}, 1))),
           case when n % 4 = 0 then 'SMS' else 'EMAIL' end,
           case when n % 6 = 0 then 'FAILED_RETRYABLE' else 'DELIVERED' end,
           'msg-' || n,
           now() - (n || ' seconds')::interval
    from generate_series(1, ${spec.notificationAttempts}) as n
  `);

  // Audit is the largest table in every tier — Q-29 reads it by target and
  // by correlation, and CP4 measures what its index set costs per append.
  await runner.execute(sql`
    insert into audit_events
      (occurred_at, actor_kind, admin_id, action, target_kind, target_id, correlation_id)
    select now() - (n || ' seconds')::interval,
           'ADMIN',
           ${backbone.adminId}::uuid,
           (array['order.transition', 'design.review', 'quotation.send',
                  'stock.adjust', 'grant.revoke'])[1 + (n % 5)],
           'ORDER',
           bench_uuid(${`${seed}:order`}, 1 + (n % greatest(${spec.orders}, 1)))::text,
           'corr-' || (n / 5)
    from generate_series(1, ${spec.auditEvents}) as n
  `);

  // Inventory ledger, concentrated on the hot 5% of SKUs so the per-SKU
  // history read has a realistic worst case rather than a uniform one.
  await runner.execute(sql`
    insert into inventory_ledger_entries
      (sku_stock_id, entry_kind, quantity, on_hand_delta, actor_kind, admin_id, reason)
    select bench_uuid(
             ${`${seed}:stock`},
             case
               when n % 100 < ${Math.round(spec.hotSkuFraction * 100)}
                 then 1 + (n % greatest(${Math.max(1, Math.round(spec.products * spec.variantsPerProduct * 0.05))}, 1))
               else 1 + (n % greatest(${spec.products * spec.variantsPerProduct}, 1))
             end
           ),
           'ADJUSTMENT',
           1 + (n % 5),
           case when n % 3 = 0 then -(1 + (n % 5)) else 1 + (n % 5) end,
           'ADMIN',
           ${backbone.adminId}::uuid,
           'bench adjustment'
    from generate_series(1, ${spec.ledgerEntries}) as n
  `);

  // Transition history for QX-01. One chain of a few transitions per order.
  await runner.execute(sql`
    insert into order_transitions
      (order_id, from_status, to_status, event_kind, actor_kind, admin_id,
       reason, correlation_id)
    select bench_uuid(${`${seed}:order`}, 1 + ((n - 1) / 3)),
           (array['AWAITING_DEPOSIT', 'DEPOSIT_PAID', 'IN_PRODUCTION'])[1 + ((n - 1) % 3)],
           (array['DEPOSIT_PAID', 'IN_PRODUCTION', 'PRODUCTION_COMPLETED'])[1 + ((n - 1) % 3)],
           'STATE_CHANGE',
           'ADMIN',
           ${backbone.adminId}::uuid,
           'bench transition',
           'corr-' || n
    from generate_series(1, ${spec.orders * 3}) as n
  `);
}
