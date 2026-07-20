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
note(`triggers: ${trig.length} / 30`);
if (trig.length !== 30) fail(`expected exactly 30 triggers, found ${trig.length}`);

const seen = new Set();
for (const row of trig) {
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

await client.end();
process.exitCode = finish();
