/**
 * Request → quotation → design → order → payment volume (DB9-CP1).
 *
 * The commerce pipeline every operational read shape walks: Q-09, Q-11,
 * Q-13..Q-19, Q-21..Q-24, QX-01, QX-07.
 *
 * The chain is generated index-aligned — request `n`, quotation `n`, design
 * case `n`, approval snapshot `n`, order `n` — so every FK resolves without
 * a lookup and the whole pipeline loads in a handful of set-based
 * statements. Status skew follows a real pipeline: most rows terminal, a
 * live minority, which is what makes the partial indexes measurable.
 *
 * Test-only.
 */
import { sql } from 'drizzle-orm';

import type { OrderFixture } from '../../modules/order/tests/integration/order-fixture';
import type { PlanRunner } from './bench-plan';
import type { DatasetTier } from './bench-dataset-tiers';

const DOC_HASH = `sha256:${'2'.repeat(64)}`;

export async function seedPipelineVolume(
  runner: PlanRunner,
  spec: DatasetTier,
  seed: string,
  backbone: OrderFixture,
): Promise<void> {
  const requests = spec.requests;
  const orders = spec.orders;

  await runner.execute(sql`
    insert into custom_requests (id, code, customer_id, status, customer_note)
    select bench_uuid(${`${seed}:request`}, n),
           'REQ-' || lpad(n::text, 8, '0'),
           bench_uuid(${`${seed}:customer`}, 1 + (n % ${spec.customers})),
           case
             when n % 20 = 0 then 'NEW'
             when n % 20 = 1 then 'UNDER_REVIEW'
             when n % 20 = 2 then 'QUOTED'
             when n % 20 = 3 then 'DESIGN_REVIEW'
             when n % 20 = 4 then 'REJECTED'
             when n % 20 = 5 then 'CANCELLED'
             else 'APPROVED'
           end,
           'Bench request ' || n
    from generate_series(1, ${requests}) as n
  `);

  await runner.execute(sql`
    insert into quotations (id, code, custom_request_id, status)
    select bench_uuid(${`${seed}:quotation`}, n),
           'QUO-' || lpad(n::text, 8, '0'),
           bench_uuid(${`${seed}:request`}, n),
           case when n % 13 = 0 then 'SENT' else 'ACCEPTED' end
    from generate_series(1, ${requests}) as n
  `);

  // Several versions per quotation so Q-12's history pagination and the
  // current-pointer lookup in Q-13 both have depth to walk.
  await runner.execute(sql`
    insert into quotation_versions
      (id, quotation_id, version, status, quantity_total, subtotal_amount,
       manual_adjustment_amount, shipping_fee_amount, total_amount,
       deposit_percent, deposit_amount, remaining_amount, currency_code,
       valid_from, valid_until, sent_at, accepted_at)
    select bench_uuid(${`${seed}:qversion`}, n),
           bench_uuid(${`${seed}:quotation`}, 1 + (n % ${requests})),
           1 + (n / ${requests}),
           case when n <= ${requests} then 'ACCEPTED' else 'SUPERSEDED' end,
           10 + (n % 40),
           -- CST-064: total = subtotal + adjustment + shipping, and
           -- deposit + remaining = total. Derived rather than hard-coded so
           -- the amounts vary across rows without breaking the arithmetic.
           1000000 + (n % 100) * 1000,
           0.00,
           50000.00,
           1050000 + (n % 100) * 1000,
           30.00,
           315000 + (n % 100) * 300,
           735000 + (n % 100) * 700,
           'VND',
           now() - interval '30 days',
           now() + interval '30 days',
           now() - interval '29 days',
           case when n <= ${requests} then now() - interval '28 days' else null end
    from generate_series(1, ${spec.quotationVersions}) as n
  `);

  await runner.execute(sql`
    update quotations q
    set current_version_id = bench_uuid(${`${seed}:qversion`}, sub.n)
    from (select generate_series(1, ${requests}) as n) sub
    where q.id = bench_uuid(${`${seed}:quotation`}, sub.n)
  `);

  await runner.execute(sql`
    update custom_requests r
    set current_quotation_id = bench_uuid(${`${seed}:quotation`}, sub.n)
    from (select generate_series(1, ${requests}) as n) sub
    where r.id = bench_uuid(${`${seed}:request`}, sub.n)
  `);

  await runner.execute(sql`
    insert into design_cases (id, custom_request_id)
    select bench_uuid(${`${seed}:case`}, n), bench_uuid(${`${seed}:request`}, n)
    from generate_series(1, ${requests}) as n
  `);

  // Version history depth for Q-10 and the single-active-review partial
  // index behind Q-11: exactly one SENT_FOR_REVIEW version per case at most.
  await runner.execute(sql`
    insert into design_versions
      (id, design_case_id, version, status, design_document, document_schema_version,
       document_hash, product_id, product_variant_id, product_side_id,
       embroidery_area_id, physical_width_mm, physical_height_mm, sent_at, approved_at)
    select bench_uuid(${`${seed}:dversion`}, n),
           bench_uuid(${`${seed}:case`}, 1 + (n % ${requests})),
           1 + (n / ${requests}),
           case
             when n <= ${requests} then 'APPROVED'
             when n % 37 = 0 then 'SENT_FOR_REVIEW'
             else 'SUPERSEDED'
           end,
           '{}'::jsonb,
           1,
           ${DOC_HASH},
           b.product_id, b.product_variant_id, b.product_side_id, b.embroidery_area_id,
           120.00, 80.00,
           now() - interval '20 days',
           case when n <= ${requests} then now() - interval '19 days' else null end
    from generate_series(1, ${spec.designVersions}) as n
    -- The backbone's own design version is the only row present at this
    -- point; borrowing its placement chain keeps every generated version
    -- inside a valid product/side/area hierarchy (G-DB7-13) without
    -- re-deriving one.
    cross join (
      select product_id, product_variant_id, product_side_id, embroidery_area_id
      from design_versions limit 1
    ) b
  `);

  await runner.execute(sql`
    update design_cases c
    set current_version_id = bench_uuid(${`${seed}:dversion`}, sub.n)
    from (select generate_series(1, ${requests}) as n) sub
    where c.id = bench_uuid(${`${seed}:case`}, sub.n)
  `);

  await runner.execute(sql`
    insert into approval_snapshots
      (id, design_version_id, design_case_id, custom_request_id, customer_id,
       document_hash, product_id, product_variant_id, product_side_id, embroidery_area_id,
       product_name, variant_label, side_name, area_name,
       physical_width_mm, physical_height_mm, quantity_total,
       grant_id, step_up_challenge_id, approved_at)
    select bench_uuid(${`${seed}:approval`}, n),
           bench_uuid(${`${seed}:dversion`}, n),
           bench_uuid(${`${seed}:case`}, n),
           bench_uuid(${`${seed}:request`}, n),
           bench_uuid(${`${seed}:customer`}, 1 + (n % ${spec.customers})),
           ${DOC_HASH},
           dv.product_id, dv.product_variant_id, dv.product_side_id, dv.embroidery_area_id,
           'Product', 'Black / M', 'Front', 'Chest', 120.00, 80.00, 10 + (n % 40),
           ${backbone.grantId}::uuid, ${backbone.challengeId}::uuid,
           now() - interval '18 days'
    from generate_series(1, ${orders}) as n
    join design_versions dv on dv.id = bench_uuid(${`${seed}:dversion`}, n)
  `);

  await runner.execute(sql`
    insert into orders
      (id, code, custom_request_id, customer_id, accepted_quotation_version_id,
       current_approval_snapshot_id, status, total_amount, currency_code,
       cancelled_reason)
    select bench_uuid(${`${seed}:order`}, n),
           'ORD-' || lpad(n::text, 8, '0'),
           bench_uuid(${`${seed}:request`}, n),
           bench_uuid(${`${seed}:customer`}, 1 + (n % ${spec.customers})),
           bench_uuid(${`${seed}:qversion`}, n),
           bench_uuid(${`${seed}:approval`}, n),
           case
             when n % 10 = 0 then 'AWAITING_DEPOSIT'
             when n % 10 = 1 then 'DEPOSIT_PAID'
             when n % 10 = 2 then 'IN_PRODUCTION'
             when n % 10 = 3 then 'AWAITING_FINAL_PAYMENT'
             when n % 10 = 4 then 'READY_FOR_DELIVERY'
             when n % 10 = 5 then 'CANCELLED'
             else 'COMPLETED'
           end,
           1050000 + (n % 100) * 1000,
           'VND',
           -- A CANCELLED order must carry a reason (CST order guard).
           case when n % 10 = 5 then 'bench cancellation' else null end
    from generate_series(1, ${orders}) as n
  `);

  await runner.execute(sql`
    insert into order_items
      (id, order_id, position, sku_id, product_name, variant_label, size_label,
       quantity, unit_price_amount, line_total_amount, currency_code, approval_snapshot_id)
    select bench_uuid(${`${seed}:item`}, n),
           bench_uuid(${`${seed}:order`}, 1 + ((n - 1) / ${spec.orderItemsPerOrder})),
           1 + ((n - 1) % ${spec.orderItemsPerOrder}),
           bench_uuid(${`${seed}:sku`}, 1 + (n % ${spec.products * spec.variantsPerProduct})),
           'Product', 'Black / M', 'M',
           1 + (n % 20), 100000.00, 100000.00 * (1 + (n % 20)), 'VND',
           bench_uuid(${`${seed}:approval`}, 1 + ((n - 1) / ${spec.orderItemsPerOrder}))
    from generate_series(1, ${orders * spec.orderItemsPerOrder}) as n
  `);

  // Obligations: a live PENDING minority is what Q-17/Q-18's partial indexes
  // are for, so the skew has to leave some genuinely live.
  await runner.execute(sql`
    insert into payment_obligations
      (id, order_id, kind, amount, currency_code, status, satisfied_at,
       source_quotation_version_id)
    select bench_uuid(${`${seed}:obligation`}, n),
           -- At most one live obligation per (order, kind)
           -- (uq_payment_obligations__order_kind__live), so obligations
           -- pair up onto orders rather than wrapping round them.
           bench_uuid(${`${seed}:order`}, 1 + ((n - 1) / 2)),
           case when n % 2 = 1 then 'DEPOSIT' else 'REMAINING' end,
           315000.00,
           'VND',
           'PENDING',
           null,
           bench_uuid(${`${seed}:qversion`}, 1 + (n % ${orders}))
    from generate_series(1, ${spec.obligations}) as n
  `);

  // Attempts reference obligations, and a SATISFIED obligation must name the
  // attempt that satisfied it (`ck_payment_obligations__satisfied_evidence_
  // required`). The dependency is circular, so the generator follows the same
  // order the application does: open the obligation, record the attempt, then
  // satisfy the obligation with that attempt as evidence.
  await runner.execute(sql`
    insert into payment_attempts
      (id, payment_obligation_id, amount, currency_code, method, provider_key,
       provider_ref, status, succeeded_at, failed_at)
    select bench_uuid(${`${seed}:attempt`}, n),
           bench_uuid(${`${seed}:obligation`}, n),
           315000.00, 'VND', 'PROVIDER_REDIRECT', 'bench-provider',
           'ref-' || n,
           case when n % 7 = 0 then 'FAILED' else 'SUCCEEDED' end,
           case when n % 7 = 0 then null else now() - interval '10 days' end,
           case when n % 7 = 0 then now() - interval '10 days' else null end
    from generate_series(1, ${spec.obligations}) as n
  `);

  await runner.execute(sql`
    update payment_obligations o
    set status = 'SATISFIED',
        satisfied_at = now() - interval '10 days',
        satisfied_by_attempt_id = bench_uuid(${`${seed}:attempt`}, sub.n)
    from (select generate_series(1, ${spec.obligations}) as n) sub
    -- Leave a live minority of *both* kinds: obligations pair onto orders as
    -- (odd = DEPOSIT, even = REMAINING), so a modulus that only ever lands on
    -- one parity would leave one kind with no PENDING rows at all and make
    -- Q-17's partial index look unused for the wrong reason.
    where o.id = bench_uuid(${`${seed}:obligation`}, sub.n) and sub.n % 7 <> 0
  `);

  await runner.execute(sql`
    insert into payment_provider_events
      (provider_key, provider_event_ref, payment_attempt_id, event_kind,
       amount, currency_code, redacted_payload, signature_valid,
       application_outcome, received_at)
    select 'bench-provider',
           'evt-' || n,
           case when n % 9 = 0 then null
                else bench_uuid(${`${seed}:attempt`}, 1 + (n % ${spec.obligations})) end,
           case when n % 7 = 0 then 'FAILURE' else 'SUCCESS' end,
           315000.00, 'VND', '{}'::jsonb, n % 100 <> 0,
           case when n % 9 = 0 then 'ESCALATED' else 'APPLIED' end,
           now() - (n || ' seconds')::interval
    from generate_series(1, ${spec.providerEvents}) as n
  `);
}
