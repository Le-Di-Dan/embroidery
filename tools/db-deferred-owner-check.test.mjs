/**
 * Tamper tests for the DB6-C3 deferred-FK owner reconciliation
 * (`checkDeferredOwnership` in db-deferred-owner-check.mjs, DEV-DB6-011).
 * Run from the repository root: node --test "tools/*.test.mjs"
 */
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { checkDeferredOwnership } from './db-deferred-owner-check.mjs';

/**
 * Builds a minimal schema manifest fixture with §3 group headings (table ->
 * group), a §2.2.1 deferred-edge ledger, and a §3.1 roll-up, matching the
 * exact structure `checkDeferredOwnership` parses out of the real manifest.
 */
function buildManifest({ ledgerRows, g10Count = 4, g15Count = 8 }) {
  return `
### G6 — Inventory core (CTX-INV) · implemented

| TBL | Table | File | PK | Mut | Status |
|---|---|---|---|---|---|
| TBL-019 | \`inventory_ledger_entries\` | \`inventory/inventory-ledger-entries.ts\` | bigint | append | implemented |

### G9 — Request intake (CTX-ORD) · implemented

| TBL | Table | File | PK | Mut | Status |
|---|---|---|---|---|---|
| TBL-042 | \`custom_request_transitions\` | \`ordering/custom-request-transitions.ts\` | bigint | append | implemented |

### G10 — Grants, holds, merge (CTX-CUS / CTX-INV) · implemented

| TBL | Table | File | PK | Mut | Status |
|---|---|---|---|---|---|
| TBL-008 | \`secure_access_grants\` | \`customer/secure-access-grants.ts\` | uuid7 | mutable | implemented |
| TBL-020 | \`inventory_soft_holds\` | \`inventory/inventory-soft-holds.ts\` | uuid7 | mutable | implemented |
| TBL-009 | \`customer_merge_cases\` | \`customer/customer-merge-cases.ts\` | uuid7 | mutable | implemented |
| TBL-010 | \`customer_merge_events\` | \`customer/customer-merge-events.ts\` | bigint | append | implemented |

### G15 — Order & shipping (CTX-ORD) · planned

| TBL | Table | File | PK | Mut | Status |
|---|---|---|---|---|---|
| TBL-043 | \`orders\` | \`ordering/orders.ts\` | uuid7 | mutable | planned |
| TBL-044 | \`order_items\` | \`ordering/order-items.ts\` | uuid7 | immutable | planned |
| TBL-045 | \`order_transitions\` | \`ordering/order-transitions.ts\` | bigint | append | planned |
| TBL-046 | \`order_cancellation_requests\` | \`ordering/order-cancellation-requests.ts\` | uuid7 | mutable | planned |
| TBL-047 | \`shipping_details\` | \`ordering/shipping-details.ts\` | uuid7 | mutable-until-frozen | planned |
| TBL-048 | \`shipping_snapshots\` | \`ordering/shipping-snapshots.ts\` | uuid7 | immutable | planned |
| TBL-049 | \`shipping_fee_acknowledgements\` | \`ordering/shipping-fee-acknowledgements.ts\` | bigint | append | planned |
| TBL-021 | \`inventory_reservations\` | \`inventory/inventory-reservations.ts\` | uuid7 | mutable | planned |

### 2.2.1. Deferred FK edge ledger

| Edge | REL | Source table (group) | Source column | Target table (group) | Resolution owner | Delete behavior | Status |
|---|---|---|---|---|---|---|---|
${ledgerRows.join('\n')}

### 2.3. Constraint metric model

### 3.1. Group roll-up

| Group | Tables | Cumulative | Status |
|---|---|---|---|
| G10 | ${g10Count} | 41 | implemented |
| G15 | ${g15Count} | 65 | planned |

---
`;
}

function run(manifest, extra = {}) {
  const problems = [];
  checkDeferredOwnership({
    schemaManifest: manifest,
    fail: (m) => problems.push(m),
    note: () => {},
    ...extra,
  });
  return problems;
}

const ROW_SOFT_HOLD_TO_G10 =
  '| ledger -> soft_holds | REL-028 | `inventory_ledger_entries` (G6) | `soft_hold_id` | `inventory_soft_holds` (G10) | G10 | restrict | implemented |';
const ROW_GRANT_TO_G10 =
  '| transitions -> grants | REL-105 | `custom_request_transitions` (G9) | `grant_id` | `secure_access_grants` (G10) | G10 | restrict | implemented |';
const ROW_RESERVATION_TO_G15 =
  '| ledger -> reservations | REL-028 | `inventory_ledger_entries` (G6) | `reservation_id` | `inventory_reservations` (G15) | G15 | restrict | deferred |';
const ROW_ORDER_TO_G15 =
  '| ledger -> orders | REL-028 | `inventory_ledger_entries` (G6) | `order_id` | `orders` (G15) | G15 | restrict | deferred |';

test('1. reservation_id -> G10 must fail (target created in G15)', () => {
  const bad =
    '| ledger -> reservations | REL-028 | `inventory_ledger_entries` (G6) | `reservation_id` | `inventory_reservations` (G15) | G10 | restrict | implemented |';
  const problems = run(
    buildManifest({ ledgerRows: [ROW_SOFT_HOLD_TO_G10, ROW_GRANT_TO_G10, bad, ROW_ORDER_TO_G15] }),
  );
  assert.ok(problems.some((p) => p.includes('reservation_id') && p.includes('resolution owner')));
});

test('2. order_id -> G10 must fail (target created in G15)', () => {
  const bad =
    '| ledger -> orders | REL-028 | `inventory_ledger_entries` (G6) | `order_id` | `orders` (G15) | G10 | restrict | implemented |';
  const problems = run(
    buildManifest({
      ledgerRows: [ROW_SOFT_HOLD_TO_G10, ROW_GRANT_TO_G10, ROW_RESERVATION_TO_G15, bad],
    }),
  );
  assert.ok(problems.some((p) => p.includes('order_id') && p.includes('resolution owner')));
});

test('3. converted_reservation_id -> G10 must fail (target created in G15)', () => {
  const bad =
    '| soft_holds -> reservations | REL-030 | `inventory_soft_holds` (G10) | `converted_reservation_id` | `inventory_reservations` (G15) | G10 | restrict | implemented |';
  const problems = run(
    buildManifest({
      ledgerRows: [
        ROW_SOFT_HOLD_TO_G10,
        ROW_GRANT_TO_G10,
        ROW_RESERVATION_TO_G15,
        ROW_ORDER_TO_G15,
        bad,
      ],
    }),
  );
  assert.ok(
    problems.some((p) => p.includes('converted_reservation_id') && p.includes('resolution owner')),
  );
});

test('4. soft_hold_id -> G10 must pass (target created in G10)', () => {
  const problems = run(
    buildManifest({
      ledgerRows: [
        ROW_SOFT_HOLD_TO_G10,
        ROW_GRANT_TO_G10,
        ROW_RESERVATION_TO_G15,
        ROW_ORDER_TO_G15,
      ],
    }),
  );
  assert.deepEqual(
    problems.filter((p) => p.includes('soft_hold_id')),
    [],
  );
});

test('5. grant_id -> G10 must pass (target created in G10)', () => {
  const problems = run(
    buildManifest({
      ledgerRows: [
        ROW_SOFT_HOLD_TO_G10,
        ROW_GRANT_TO_G10,
        ROW_RESERVATION_TO_G15,
        ROW_ORDER_TO_G15,
      ],
    }),
  );
  assert.deepEqual(
    problems.filter((p) => p.includes('grant_id')),
    [],
  );
});

test('6. reservation_id -> G15 must pass (target created in G15)', () => {
  const problems = run(
    buildManifest({
      ledgerRows: [
        ROW_SOFT_HOLD_TO_G10,
        ROW_GRANT_TO_G10,
        ROW_RESERVATION_TO_G15,
        ROW_ORDER_TO_G15,
      ],
    }),
  );
  assert.deepEqual(
    problems.filter((p) => p.includes('reservation_id')),
    [],
  );
});

test('7. target table absent from every §3 group must fail', () => {
  const bad =
    '| ledger -> ghost | REL-999 | `inventory_ledger_entries` (G6) | `ghost_id` | `ghost_table` (G10) | G10 | restrict | implemented |';
  const problems = run(
    buildManifest({
      ledgerRows: [
        ROW_SOFT_HOLD_TO_G10,
        ROW_GRANT_TO_G10,
        ROW_RESERVATION_TO_G15,
        ROW_ORDER_TO_G15,
        bad,
      ],
    }),
  );
  assert.ok(problems.some((p) => p.includes('ghost_table') && p.includes('not found in any')));
});

test('8. duplicate deferred owner (two ledger rows for one edge) must fail', () => {
  const duplicate =
    '| ledger -> soft_holds (dup) | REL-028 | `inventory_ledger_entries` (G6) | `soft_hold_id` | `inventory_soft_holds` (G10) | G10 | restrict | implemented |';
  const problems = run(
    buildManifest({
      ledgerRows: [
        ROW_SOFT_HOLD_TO_G10,
        duplicate,
        ROW_GRANT_TO_G10,
        ROW_RESERVATION_TO_G15,
        ROW_ORDER_TO_G15,
      ],
    }),
  );
  assert.ok(problems.some((p) => p.includes('soft_hold_id') && p.includes('two ledger rows')));
});

test('9. a known deferred column with no FK and no ledger row must fail', () => {
  const root = mkdtempSync(join(tmpdir(), 'deferred-owner-check-'));
  try {
    const schemaDir = join(root, 'schema');
    mkdirSync(join(schemaDir, 'inventory'), { recursive: true });
    writeFileSync(
      join(schemaDir, 'inventory', 'inventory-ledger-entries.ts'),
      "export const inventoryLedgerEntries = pgTable(\n  'inventory_ledger_entries',\n  { orderId: idReference('order_id') },\n);\n",
    );
    // ledger omits the order_id row entirely — the gap this check exists to catch.
    const manifest = buildManifest({
      ledgerRows: [ROW_SOFT_HOLD_TO_G10, ROW_GRANT_TO_G10, ROW_RESERVATION_TO_G15],
    });
    const problems = run(manifest, { schemaDir, migrationsDir: join(root, 'migrations') });
    assert.ok(
      problems.some(
        (p) => p.includes('inventory_ledger_entries.order_id') && p.includes('no row in the'),
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('10. table roll-up G10=4/G15=8 must pass; a drifted count must fail', () => {
  const goodProblems = run(
    buildManifest({
      ledgerRows: [
        ROW_SOFT_HOLD_TO_G10,
        ROW_GRANT_TO_G10,
        ROW_RESERVATION_TO_G15,
        ROW_ORDER_TO_G15,
      ],
      g10Count: 4,
      g15Count: 8,
    }),
  );
  assert.deepEqual(
    goodProblems.filter((p) => p.includes('group roll-up')),
    [],
  );

  const badProblems = run(
    buildManifest({
      ledgerRows: [
        ROW_SOFT_HOLD_TO_G10,
        ROW_GRANT_TO_G10,
        ROW_RESERVATION_TO_G15,
        ROW_ORDER_TO_G15,
      ],
      g10Count: 5,
      g15Count: 7,
    }),
  );
  assert.ok(badProblems.some((p) => p.includes('G10 has 5 tables')));
  assert.ok(badProblems.some((p) => p.includes('G15 has 7 tables')));
});
