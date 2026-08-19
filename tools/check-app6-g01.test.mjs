/**
 * Regressions for the `APP6-G01` authority gate (`IMP-D051`).
 *
 * A gate that only ever says yes is indistinguishable from no gate, so every
 * case below breaks exactly one ruling in a throwaway copy of the repository and
 * proves the checker refuses it. Nothing here writes into tracked authority.
 *
 * Two cases carry most of the value. `catches a dataset that drifts from the
 * ADR` is the entire reason each policy value is asserted twice — with one
 * source, a validity of 7 could quietly become 30 and every document would keep
 * agreeing with itself. `catches a system projection turned into a command` is
 * the failure the checkpoint exists to prevent, and it is the one that would
 * look most reasonable in a pull request.
 */
import { strict as assert } from 'node:assert';
import { cpSync, mkdirSync, mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';

import { CANONICAL_FILES, REPO_ROOT, runChecks } from './check-app6-g01.mjs';

const temporaries = [];
after(() => {
  for (const dir of temporaries) rmSync(dir, { recursive: true, force: true });
});

/** A throwaway root carrying the real canonical files plus optional edits. */
function rootWith(edits = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'app6-g01-'));
  temporaries.push(dir);
  for (const relative of Object.values(CANONICAL_FILES)) {
    mkdirSync(dirname(join(dir, relative)), { recursive: true });
    cpSync(join(REPO_ROOT, relative), join(dir, relative));
  }
  // The negation half counts real migration files.
  cpSync(join(REPO_ROOT, 'packages/database/migrations'), join(dir, 'packages/database/migrations'), {
    recursive: true,
  });
  // The `APP6-G01-C1` rules resolve each agreement's canonical source on disk, so
  // the sources the authority package cites have to be here to be resolvable.
  for (const relative of [
    'docs/04-BUSINESS-RULES.md',
    'docs/06-ORDER-AND-DESIGN-LIFECYCLE.md',
    'docs/12-DECISION-LOG.md',
    'docs/adr/database',
  ]) {
    mkdirSync(dirname(join(dir, relative)), { recursive: true });
    cpSync(join(REPO_ROOT, relative), join(dir, relative), { recursive: true });
  }
  for (const [key, mutate] of Object.entries(edits)) {
    const path = join(dir, CANONICAL_FILES[key]);
    writeFileSync(path, mutate(readFileSync(path, 'utf8')));
  }
  return dir;
}

/** Asserts the gate refuses `edits`, and that the complaint mentions `needle`. */
function refuses(edits, needle) {
  const failures = runChecks(rootWith(edits));
  assert.ok(failures.length > 0, 'the gate accepted a mutation it should refuse');
  assert.ok(
    failures.some((failure) => failure.includes(needle)),
    `no failure mentioned "${needle}"; got:\n${failures.join('\n')}`,
  );
}

describe('check-app6-g01', () => {
  it('accepts the repository as it stands', () => {
    assert.deepEqual(runChecks(rootWith()), []);
  });

  it('catches a dataset that drifts from the ADR', () => {
    refuses({ dataset: (text) => text.replace('"validityDays": 7', '"validityDays": 30') }, 'validityDays');
  });

  it('catches an ADR fact table that drifts from the dataset', () => {
    refuses({ adr: (text) => text.replace('| `depositPercent` | `40` |', '| `depositPercent` | `50` |') }, 'depositPercent');
  });

  it('catches a required agreement type quietly dropped', () => {
    refuses(
      { dataset: (text) => text.replace('["PAYMENT_POLICY", "RETURN_POLICY"]', '["PAYMENT_POLICY"]') },
      'requiredAgreementTypes',
    );
  });

  it('catches a system projection turned into a command', () => {
    refuses(
      {
        authority: (text) =>
          text.replace(
            '| `TR-LC11-05` `UNDER_REVIEW → QUOTED` | **system**',
            '| `TR-LC11-05` `UNDER_REVIEW → QUOTED` | **admin**',
          ),
      },
      'TR-LC11-05',
    );
  });

  it('catches the sync-state prohibition being deleted', () => {
    refuses(
      { authority: (text) => text.replace('No follow-up "sync state" API', 'A follow-up sync endpoint') },
      'sync state',
    );
  });

  it('catches the no-fabrication rule being softened', () => {
    refuses({ adr: (text) => text.replaceAll('never fabricated', 'usually avoided') }, 'fabricate');
  });

  it('catches the COP dimension rule being deleted', () => {
    refuses({ adr: (text) => text.replaceAll('copied from', 'derived by any means from') }, 'bounds');
  });

  it('catches an unlocked decision', () => {
    refuses({ register: (text) => text.replace('`SECURE_LINK_UNAVAILABLE`. | LOCKED |', '`SECURE_LINK_UNAVAILABLE`. | PROPOSED |') }, 'not LOCKED');
  });

  it('catches a ruling dropped from the decision row', () => {
    refuses({ register: (text) => text.replace('**(PO-05) Client-side review rendering**', '**Client-side review rendering**') }, 'PO-05');
  });

  it('catches the DB01 contract being changed in only one place', () => {
    refuses({ adr: (text) => text.replace('DB01_SCHEMA_CONTRACT = CORE_XOR_PLUS_DESIGN_VERSION_PLACEMENT_LABELS', 'DB01_SCHEMA_CONTRACT = CORE_XOR_ONLY') }, 'DB01_SCHEMA_CONTRACT');
  });

  it('catches the schema change being made early', () => {
    refuses(
      {
        designVersions: (text) =>
          text.replace("idReference('embroidery_area_id').notNull()", "idReference('embroidery_area_id')"),
      },
      'embroidery_area_id',
    );
  });

  it('catches an APP6 Figma reference registered by an authority checkpoint', () => {
    refuses({ figma: (text) => `${text}\n| APP_06 | 1:1 | placeholder |\n` }, 'APP_06');
  });

  it('catches an OpenAPI operation published by an authority checkpoint', () => {
    refuses(
      {
        openapi: (text) => {
          const document = JSON.parse(text);
          document.paths['/api/admin/quotations'] = { post: { operationId: 'quotation_create' } };
          return JSON.stringify(document);
        },
      },
      'publishes no operation',
    );
  });

  it('catches secret-bearing material added to the policy dataset', () => {
    refuses(
      {
        dataset: (text) => text.replace('"validityDays": 7', '"validityDays": 7,\n        "signingSecret": "x"'),
      },
      'secret-bearing',
    );
  });

  it('catches the workflow consent reinstated as a required agreement type', () => {
    refuses(
      {
        dataset: (text) =>
          text.replace('["PAYMENT_POLICY", "RETURN_POLICY"]', '["PAYMENT_POLICY", "RETURN_POLICY", "DESIGN_APPROVAL_TERMS"]'),
      },
      'DESIGN_APPROVAL_TERMS',
    );
  });

  it('catches the exact-design separation being deleted', () => {
    refuses(
      { authority: (text) => text.replace('exact design approval confirmation  !=  RETURN_POLICY', '') },
      'RETURN_POLICY',
    );
  });

  it('catches agreement content deferred to the Product Owner', () => {
    refuses(
      {
        authority: (text) =>
          text.replace('| **NORMALIZED** from structured rules — no approved prose exists |', '| Product-Owner-supplied later |'),
      },
      'defers agreement content',
    );
  });

  it('catches a canonical source that does not exist on disk', () => {
    refuses(
      { authority: (text) => text.replace('`docs/04-BUSINESS-RULES.md` BR-004', '`docs/99-NOT-A-FILE.md` BR-004') },
      'does not exist',
    );
  });

  it('catches a required type with no published content block', () => {
    refuses(
      { authority: (text) => text.replace('#### 5.6.2 `RETURN_POLICY`', '#### 5.6.2 Return terms') },
      'no §5.6 content block for RETURN_POLICY',
    );
  });

  it('catches a roadmap that never records the outcome', () => {
    refuses({ phase: (text) => text.replace('NEXT CHECKPOINT = APP6-DB01', 'NEXT CHECKPOINT = APP6-G01') }, 'next checkpoint');
  });
});
