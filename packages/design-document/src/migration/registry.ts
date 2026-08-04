/**
 * Document-format migrations (ADR-DB1-012 §3: code in this package, never SQL).
 *
 * There is one version today, so the registry is empty — and that is the whole
 * point of building it now. The API a caller writes against is the one that
 * will still work at v4: hand it a payload of any stored version and get back a
 * validated current-version document. When v2 arrives, a step is appended here
 * and no caller changes.
 *
 * Deliberately **no v0 step**. The APP0-R01 spike used a different shape, but a
 * spike fixture is research evidence, not deployed production data; inventing a
 * migration from it would create a path that reads documents nobody ever wrote,
 * and would have to be maintained forever.
 *
 * Historical snapshots are never migrated in place (ADR-DB1-012 §6). This
 * upgrades on *read*, into memory; the stored bytes — and therefore the hash an
 * approval is bound to — are untouched.
 */
import { CURRENT_DESIGN_DOCUMENT_SCHEMA_VERSION } from '../schema/constants';
import type { DesignDocument } from '../schema/document';
import { readSchemaVersion, validateDesignDocumentStructure } from '../validation/structure';
import { failed, finding, type DesignDocumentResult } from '../findings/finding';

/**
 * One step up a single version. Pure: it returns a new value and never mutates
 * its input, so a failed chain leaves the caller's payload intact.
 */
export interface DesignDocumentMigrationStep {
  readonly from: number;
  readonly to: number;
  readonly migrate: (payload: Record<string, unknown>) => Record<string, unknown>;
}

/**
 * Ordered, contiguous steps. Empty at v1.
 *
 * `assertContiguous` runs at module load rather than at call time: a registry
 * with a hole is a programming error that must fail the build's first import,
 * not the first customer document that happens to be old enough to need it.
 */
export const DESIGN_DOCUMENT_MIGRATIONS: readonly DesignDocumentMigrationStep[] = Object.freeze([]);

export class DesignDocumentMigrationRegistryError extends Error {}

export function assertContiguous(steps: readonly DesignDocumentMigrationStep[]): void {
  let expected = 1;
  for (const step of steps) {
    if (step.from !== expected || step.to !== step.from + 1) {
      throw new DesignDocumentMigrationRegistryError(
        `Migration steps must be contiguous and single-version: expected a step from ${String(expected)}, found ${String(step.from)} → ${String(step.to)}.`,
      );
    }
    expected = step.to;
  }
  if (expected !== CURRENT_DESIGN_DOCUMENT_SCHEMA_VERSION) {
    throw new DesignDocumentMigrationRegistryError(
      `Migration steps end at version ${String(expected)} but the current version is ${String(CURRENT_DESIGN_DOCUMENT_SCHEMA_VERSION)}.`,
    );
  }
}

assertContiguous(DESIGN_DOCUMENT_MIGRATIONS);

/**
 * Reads a stored payload of any supported version into a validated current
 * document.
 *
 * The output is validated, not merely produced: a migration step that emits
 * something malformed fails here rather than downstream, where the malformed
 * value would already have been hashed.
 */
export function migrateDesignDocument(
  payload: unknown,
  steps: readonly DesignDocumentMigrationStep[] = DESIGN_DOCUMENT_MIGRATIONS,
): DesignDocumentResult<DesignDocument> {
  const version = readSchemaVersion(payload);
  if (!version.ok) return version;

  assertContiguous(steps);

  let current = { ...(payload as Record<string, unknown>) };
  let at = version.value;

  while (at < CURRENT_DESIGN_DOCUMENT_SCHEMA_VERSION) {
    const step = steps.find((candidate) => candidate.from === at);
    if (step === undefined) {
      return failed([
        finding(
          'UNSUPPORTED_SCHEMA_VERSION',
          '$.schemaVersion',
          'No migration path leads from that version to the current one.',
          { declared: at, current: CURRENT_DESIGN_DOCUMENT_SCHEMA_VERSION },
        ),
      ]);
    }
    current = step.migrate(current);
    at = step.to;
  }

  return validateDesignDocumentStructure(current);
}
