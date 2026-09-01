/**
 * DB6-S26 — live trigger inventory checker.
 * Verifies the exact 30-trigger / 1-function DB6-S24 inventory
 * (DB6_S24_TRIGGER_REPORT.md §C/§D) — no missing, no extra, no wrong-table
 * trigger, and no drift in a trigger's TG_ARGV (mode/guard/delete-policy/
 * allowed-columns) since S24 shipped it.
 * Usage: node db-live-triggers-check.mjs <url>
 */
import { connect, report } from './live-db.mjs';

// table -> exact fn_reject_mutation_conditional(...) argument list, as
// implemented by migration 0030 and unchanged since (S24 is frozen scope).
const CANONICAL = {
  approval_snapshots: ['always', '', '', 'reject'],
  approval_snapshot_thread_colors: ['always', '', '', 'reject'],
  approval_snapshot_agreement_acceptances: ['always', '', '', 'reject'],
  order_items: ['always', '', '', 'reject'],
  production_specifications: ['always', '', '', 'reject'],
  shipping_snapshots: ['always', '', '', 'reject'],
  inventory_ledger_entries: ['always', '', '', 'retention_exempt'],
  audit_events: ['always', '', '', 'retention_exempt'],
  payment_provider_events: ['always', '', '', 'retention_exempt'],
  payment_reconciliations: ['always', '', '', 'retention_exempt'],
  order_transitions: ['always', '', '', 'retention_exempt'],
  custom_request_transitions: ['always', '', '', 'retention_exempt'],
  production_job_transitions: ['always', '', '', 'retention_exempt'],
  design_reviews: ['always', '', '', 'retention_exempt'],
  request_moderation_notes: ['always', '', '', 'retention_exempt'],
  production_notes: ['always', '', '', 'retention_exempt'],
  notification_delivery_attempts: ['always', '', '', 'retention_exempt'],
  contact_verification_attempts: ['always', '', '', 'retention_exempt'],
  customer_merge_events: ['always', '', '', 'retention_exempt'],
  quotation_acceptances: ['always', '', '', 'retention_exempt'],
  shipping_fee_acknowledgements: ['always', '', '', 'retention_exempt'],
  asset_inspections: ['always', '', '', 'retention_exempt'],
  background_job_attempts: ['always', '', '', 'retention_exempt'],
  outbox_events: [
    'always',
    '',
    '',
    'retention_exempt',
    'status',
    'attempt_count',
    'next_attempt_at',
    'claimed_by',
    'claimed_at',
    'dispatched_at',
    'last_error',
  ],
  refunds: [
    'always',
    '',
    '',
    'reject',
    'status',
    'method',
    'transfer_reference',
    'reason',
    'customer_visible_reason',
    'approved_by_admin_id',
    'executed_by_admin_id',
    'approved_at',
    'executed_at',
    'updated_at',
  ],
  design_versions: [
    'frozen_when_not',
    'status',
    'DRAFT',
    'reject',
    'status',
    'sent_at',
    'approved_at',
    'superseded_at',
    'voided_at',
    'void_reason',
  ],
  quotation_versions: [
    'frozen_when_not',
    'status',
    'DRAFT',
    'reject',
    'status',
    'sent_at',
    'accepted_at',
    'superseded_at',
    'expired_at',
    'void_reason',
  ],
  agreement_versions: [
    'frozen_when_not',
    'status',
    'DRAFT',
    'reject',
    'status',
    'published_at',
    'superseded_at',
    'withdrawn_at',
    'withdraw_reason',
  ],
  shipping_details: ['frozen_when', 'status', 'FROZEN', 'reject'],
  design_template_versions: ['frozen_when_not_null', 'published_at', '', 'reject'],
};

/**
 * APP3-DB01 placement guards (migration 0034), inventoried separately.
 *
 * They are not S24: they use their own two functions rather than
 * `fn_reject_mutation_conditional`, because "frozen once *another table*
 * references this row" is a cross-table predicate the S24 mode set cannot
 * express. Keeping the inventories apart means the S24 freeze still means
 * exactly what it meant — 30 triggers, one function, unchanged args — while the
 * APP3 guards are asserted just as strictly instead of being waved through as
 * "extra".
 */
const APP3_DB01_TRIGGERS = {
  product_sides: [
    ['tg_product_sides__replacement_guard', 'fn_app3_placement_replacement_guard'],
    ['tg_product_sides__protected_guard', 'fn_app3_reject_protected_placement_change'],
  ],
  embroidery_areas: [
    ['tg_embroidery_areas__replacement_guard', 'fn_app3_placement_replacement_guard'],
    ['tg_embroidery_areas__protected_guard', 'fn_app3_reject_protected_placement_change'],
  ],
};

const APP3_DB01_FUNCTIONS = [
  'fn_app3_placement_replacement_guard',
  'fn_app3_reject_protected_placement_change',
];

const APP3_TRIGGER_COUNT = Object.values(APP3_DB01_TRIGGERS).flat().length;

/**
 * APP12-DB01 order-origin guards (migration 0038), inventoried separately for
 * the same reason the APP3 pair is.
 *
 * One function, three rules selected by TG_ARGV[0]. `orders.origin` is
 * immutable after insert; an `order_items` row must carry an approval snapshot
 * on a CUSTOM order, must not carry one on a READY_MADE order and must name a
 * SKU there; a `payment_obligations` row must be DEPOSIT/REMAINING on a CUSTOM
 * order and FULL on a READY_MADE one. All three read the *parent's* origin,
 * which no row CHECK can see — the same cross-table predicate class that put
 * the APP3 guards outside S24.
 */
const APP12_DB01_FUNCTION = 'fn_app12_order_origin_guard';

const APP12_DB01_TRIGGERS = {
  orders: [['tg_orders__origin_immutable', 'origin_immutable']],
  order_items: [['tg_order_items__origin_subject', 'item_subject']],
  payment_obligations: [['tg_payment_obligations__origin_kind', 'obligation_kind']],
};

const APP12_TRIGGER_COUNT = Object.values(APP12_DB01_TRIGGERS).flat().length;

const client = await connect(process.argv[2]);
const { note, fail, finish } = report('triggers');

const { rows: fns } = await client.query(`
  SELECT p.proname, p.prosecdef FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'fn_reject_mutation_conditional'
`);
note(`trigger functions: ${fns.length} / 1`);
if (fns.length !== 1)
  fail(`expected exactly 1 fn_reject_mutation_conditional, found ${fns.length}`);
if (fns[0] && fns[0].prosecdef)
  fail('fn_reject_mutation_conditional is SECURITY DEFINER, expected INVOKER');

const { rows: trig } = await client.query(`
  SELECT c.relname AS table_name, t.tgname, pg_get_triggerdef(t.oid) AS def
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE NOT t.tgisinternal AND n.nspname = 'public'
  ORDER BY c.relname
`);
const isApp3 = (row) => APP3_DB01_FUNCTIONS.some((fn) => row.def.includes(fn));
const isApp12 = (row) => row.def.includes(APP12_DB01_FUNCTION);
const s24 = trig.filter((row) => !isApp3(row) && !isApp12(row));
const app3 = trig.filter(isApp3);
const app12 = trig.filter(isApp12);

const expectedTotal = 30 + APP3_TRIGGER_COUNT + APP12_TRIGGER_COUNT;
note(
  `triggers: ${trig.length} / ${expectedTotal} (S24 ${s24.length} / 30, ` +
    `APP3-DB01 ${app3.length} / ${APP3_TRIGGER_COUNT}, ` +
    `APP12-DB01 ${app12.length} / ${APP12_TRIGGER_COUNT})`,
);
if (trig.length !== expectedTotal) {
  fail(`expected exactly ${expectedTotal} triggers, found ${trig.length}`);
}
if (s24.length !== 30) fail(`expected exactly 30 S24 triggers, found ${s24.length}`);

const seen = new Set();
for (const row of s24) {
  seen.add(row.table_name);
  const expected = CANONICAL[row.table_name];
  if (!expected) {
    fail(`trigger on unexpected table ${row.table_name} (not in the S24 canonical list)`);
    continue;
  }
  const argsMatch = expected.every((v) => row.def.includes(`'${v}'`));
  if (!argsMatch) {
    fail(`${row.table_name}: trigger args drifted from S24 canonical — live def: ${row.def}`);
  }
}
for (const table of Object.keys(CANONICAL)) {
  if (!seen.has(table)) fail(`missing S24 trigger on canonical target table ${table}`);
}

// APP3-DB01 half: exact names, exact functions, exact tables.
const app3Seen = new Set(app3.map((row) => `${row.table_name}:${row.tgname}`));
for (const [table, triggers] of Object.entries(APP3_DB01_TRIGGERS)) {
  for (const [name, fn] of triggers) {
    const row = app3.find((candidate) => candidate.tgname === name);
    if (!row) {
      fail(`missing APP3-DB01 trigger ${name} on ${table}`);
      continue;
    }
    if (row.table_name !== table) {
      fail(`APP3-DB01 trigger ${name} is on ${row.table_name}, expected ${table}`);
    }
    if (!row.def.includes(fn)) {
      fail(`APP3-DB01 trigger ${name} no longer calls ${fn} — live def: ${row.def}`);
    }
    app3Seen.delete(`${table}:${name}`);
  }
}
for (const extra of app3Seen) {
  fail(`unexpected APP3 placement trigger ${extra}`);
}

const { rows: app3Fns } = await client.query(
  `
  SELECT p.proname, p.prosecdef FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = ANY($1)
`,
  [APP3_DB01_FUNCTIONS],
);
note(`APP3-DB01 trigger functions: ${app3Fns.length} / ${APP3_DB01_FUNCTIONS.length}`);
if (app3Fns.length !== APP3_DB01_FUNCTIONS.length) {
  fail(
    `expected ${APP3_DB01_FUNCTIONS.length} APP3-DB01 trigger functions, found ${app3Fns.length}`,
  );
}
for (const fn of app3Fns) {
  if (fn.prosecdef) fail(`${fn.proname} is SECURITY DEFINER, expected INVOKER`);
}

// APP12-DB01 half: exact names, exact table, exact guard rule argument.
const app12Seen = new Set(app12.map((row) => `${row.table_name}:${row.tgname}`));
for (const [table, triggers] of Object.entries(APP12_DB01_TRIGGERS)) {
  for (const [name, rule] of triggers) {
    const row = app12.find((candidate) => candidate.tgname === name);
    if (!row) {
      fail(`missing APP12-DB01 trigger ${name} on ${table}`);
      continue;
    }
    if (row.table_name !== table) {
      fail(`APP12-DB01 trigger ${name} is on ${row.table_name}, expected ${table}`);
    }
    if (!row.def.includes(`'${rule}'`)) {
      fail(`APP12-DB01 trigger ${name} no longer passes rule '${rule}' — live def: ${row.def}`);
    }
    app12Seen.delete(`${table}:${name}`);
  }
}
for (const extra of app12Seen) {
  fail(`unexpected APP12 order-origin trigger ${extra}`);
}

const { rows: app12Fns } = await client.query(
  `
  SELECT p.proname, p.prosecdef FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = $1
`,
  [APP12_DB01_FUNCTION],
);
note(`APP12-DB01 trigger functions: ${app12Fns.length} / 1`);
if (app12Fns.length !== 1) {
  fail(`expected exactly 1 ${APP12_DB01_FUNCTION}, found ${app12Fns.length}`);
}
for (const fn of app12Fns) {
  if (fn.prosecdef) fail(`${fn.proname} is SECURITY DEFINER, expected INVOKER`);
}

await client.end();
process.exitCode = finish();
