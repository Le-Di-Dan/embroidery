/**
 * Docker-free assertions for the Q-01 EXPLAIN harness (`APP2-B04-C1`).
 *
 * The measurement needs a database; the decisions behind it do not. Everything
 * that could silently make the evidence meaningless — a fixture with no
 * duplicate sort keys, a statement that quietly paginates by offset, a
 * credential on a command line, a verdict that would wave through an N+1 —
 * is checked here on every `pnpm test`.
 */
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import {
  CANONICAL_CATEGORIES,
  FIXTURE,
  PAGE_SIZE,
  accessPathVerdict,
  argsAreCredentialFree,
  categoryConstantStatement,
  categoryOfPublished,
  containerName,
  databaseUrl,
  displayOrderOfPublished,
  explain,
  extractPlanJson,
  listStatement,
  parsePublishedPort,
  psqlArgs,
  removeArgs,
  runArgs,
  scenarios,
  seedStatements,
  summarizePlan,
} from './explain-q01-access-path.mjs';

describe('fixture', () => {
  it('stays at the locked MVP catalog scale', () => {
    assert.equal(FIXTURE.publishedProducts, 60);
    assert.ok(FIXTURE.publishedProducts + FIXTURE.draftProducts + FIXTURE.archivedProducts <= 100);
  });

  it('seeds no category — the taxonomy is migration 0033, not an invention', () => {
    const statements = seedStatements();
    assert.equal(
      statements.filter((statement) => statement.includes('insert into categories')).length,
      0,
    );
    assert.equal(FIXTURE.categories, CANONICAL_CATEGORIES.length);
    assert.ok(CANONICAL_CATEGORIES.some((c) => c.slug === FIXTURE.skewedCategorySlug));
  });

  it('skews one category and spreads the rest (dataset D-B)', () => {
    const counts = new Map();
    for (let index = 0; index < FIXTURE.publishedProducts; index += 1) {
      const category = categoryOfPublished(index);
      counts.set(category, (counts.get(category) ?? 0) + 1);
    }
    assert.equal(counts.get(0), FIXTURE.skewedCategoryShare);
    assert.equal(counts.size, FIXTURE.categories);
    for (const [category, count] of counts) {
      if (category !== 0) assert.ok(count > 0 && count < FIXTURE.skewedCategoryShare);
    }
  });

  it('duplicates every display_order so the tie-breaker is actually exercised', () => {
    const positions = new Map();
    for (let index = 0; index < FIXTURE.publishedProducts; index += 1) {
      const order = displayOrderOfPublished(index);
      positions.set(order, (positions.get(order) ?? 0) + 1);
    }
    assert.ok([...positions.values()].every((count) => count === 2));
  });

  it('inserts draft and archived rows, then analyzes', () => {
    const statements = seedStatements();
    const products = statements.find((statement) => statement.includes('insert into products'));
    assert.ok(products.includes("'DRAFT'"));
    assert.ok(products.includes("'ARCHIVED'"));
    assert.equal(statements.at(-1), 'analyze');
  });
});

describe('statements', () => {
  it('orders by the canonical tuple and never offsets', () => {
    for (const scenario of scenarios({
      filteredAfter: { displayOrder: 5, id: 'a' },
      unfilteredAfter: { displayOrder: 5, id: 'a' },
    })) {
      assert.match(scenario.statement, /order by p\.display_order asc, p\.id asc/);
      assert.match(scenario.statement, new RegExp(`limit ${PAGE_SIZE}`));
      assert.doesNotMatch(scenario.statement, /\boffset\b/i);
    }
  });

  it('adds the keyset predicate only for a continuation page', () => {
    const first = listStatement({});
    const next = listStatement({ after: { displayOrder: 7, id: 'x' } });
    assert.doesNotMatch(first, /p\.display_order >/);
    assert.match(next, /p\.display_order > 7 or \(p\.display_order = 7 and p\.id > 'x'\)/);
  });

  it('filters by category slug across the join, which is what the API issues', () => {
    assert.match(listStatement({ categorySlug: 'thu-bong' }), /c\.slug = 'thu-bong'/);
    assert.doesNotMatch(listStatement({ categorySlug: 'thu-bong' }), /p\.category_id =/);
  });

  it('keeps the reference form distinct — a constant category_id', () => {
    const reference = categoryConstantStatement(CANONICAL_CATEGORIES[0].id);
    assert.match(reference, /p\.category_id = '019a0000-0000-7000-8000-000000000001'/);
    assert.doesNotMatch(reference, /join categories/);
  });

  it('always restricts to published products', () => {
    for (const statement of [listStatement({}), categoryConstantStatement('x')]) {
      assert.match(statement, /p\.status = 'PUBLISHED'/);
    }
  });

  it('escapes a quote rather than closing the literal', () => {
    assert.match(listStatement({ categorySlug: "o'brien" }), /c\.slug = 'o''brien'/);
  });

  it('captures analyze and buffers', () => {
    assert.match(explain('select 1'), /^explain \(analyze, buffers, format json\) /);
  });
});

describe('container', () => {
  it('carries no credential on any command line', () => {
    const name = containerName(1);
    for (const args of [runArgs(name), removeArgs(name), psqlArgs(name, ['select 1'])]) {
      assert.equal(argsAreCredentialFree(args), true);
    }
  });

  it('has no password at all and listens on loopback', () => {
    const args = runArgs(containerName(1));
    assert.ok(args.includes('POSTGRES_HOST_AUTH_METHOD=trust'));
    assert.ok(args.includes('127.0.0.1::5432'));
    assert.equal(databaseUrl(5432), 'postgres://embroidery@127.0.0.1:5432/embroidery');
  });

  it('removes its volume, so nothing survives the run', () => {
    assert.ok(removeArgs('x').includes('--volumes'));
  });

  it('reads the published port', () => {
    assert.equal(parsePublishedPort('127.0.0.1:49876\n'), 49876);
    assert.throws(() => parsePublishedPort(''), /could not read a published port/);
  });

  it('finds the plan after a SET tag', () => {
    assert.deepEqual(extractPlanJson('SET\n[{"Plan":{}}]'), [{ Plan: {} }]);
    assert.throws(() => extractPlanJson('ERROR: nope'), /no EXPLAIN JSON/);
  });
});

const plan = (overrides) => [
  {
    'Execution Time': 0.8,
    'Planning Time': 2.2,
    Plan: {
      'Node Type': 'Limit',
      'Actual Rows': 20,
      Plans: [
        {
          'Node Type': 'Sort',
          Plans: [
            { 'Node Type': 'Seq Scan', 'Actual Rows': 60, 'Actual Loops': 1 },
            {
              'Node Type': 'Index Scan',
              'Parent Relationship': 'SubPlan',
              'Actual Rows': 1,
              'Actual Loops': 20,
              ...overrides,
            },
          ],
        },
      ],
    },
  },
];

describe('plan summary and verdict', () => {
  it('counts the ordering path and the thumbnail subquery apart', () => {
    const summary = summarizePlan(plan({}));
    assert.equal(summary.outerRowsScanned, 60);
    assert.equal(summary.subplanRowsScanned, 20);
    assert.equal(summary.subplanLoops, 20);
    assert.equal(summary.hasSort, true);
    assert.equal(summary.hasSeqScan, true);
    assert.equal(summary.rowsReturned, 20);
    assert.ok(!summary.outerNodes.includes('Index Scan'));
  });

  it('accepts a sequential scan over an MVP-scale relation', () => {
    assert.equal(accessPathVerdict(summarizePlan(plan({}))).accepted, true);
  });

  it('refuses a subquery that runs more often than the page has rows', () => {
    const verdict = accessPathVerdict(summarizePlan(plan({ 'Actual Loops': 80 })));
    assert.equal(verdict.accepted, false);
    assert.match(verdict.reason, /thumbnail subquery ran 80 times/);
  });

  it('refuses an ordering path that passes over the catalog repeatedly', () => {
    const summary = summarizePlan(plan({}));
    summary.outerRowsScanned = 100_000;
    assert.equal(accessPathVerdict(summary).accepted, false);
  });
});
