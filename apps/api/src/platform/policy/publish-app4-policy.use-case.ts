/**
 * Publishes the `APP4-G01` policy dataset (`APP4-B01-C1`).
 *
 * `ADR-APP4-001` §1.1 handed the publishing call to `APP4-B01`, and B01 first
 * reported the seam open and routed it to `APP4-W01`. That was wrong in one
 * respect that matters: `policy_configuration_versions.created_by_admin_id` is
 * `NOT NULL`, the worker holds no Admin identity, and inventing one there would
 * be a far larger change than publishing here. So publication stays on the API
 * side, attached to the one delivered admin-bearing path — the `staff-bootstrap`
 * one-shot CLI — and the worker is left to *consume* policy only.
 *
 * This is **not** a seed framework. It knows one dataset, publishes four keys and
 * writes nothing else; there is no ordering, no registry and no second tier.
 *
 * Idempotency is by comparison, not by `ensureKey` alone: `ensureKey` makes the
 * *key* idempotent while `publishVersion` always appends, so a bootstrap that
 * ran on every container start would accumulate an identical version per boot.
 * Each key is therefore published only when it has no version yet, or when the
 * stored value or schema version differs from the dataset.
 *
 * Drift is corrected by **appending** a new version, never by mutating history:
 * `policy_configuration_versions` is immutable by design (DB4), and a snapshot
 * that referenced an old version must keep meaning forever.
 */
import { Injectable } from '@nestjs/common';
import { loadApp4PolicyDataset, type App4PolicyConfiguration } from '@embroidery/database';
import { PolicyConfigurationRepository, TransactionManager } from '@embroidery/persistence';

/**
 * How `@embroidery/database` is located at runtime.
 *
 * `require.resolve` rather than `import.meta.url`: the API is CommonJS, and the
 * dataset reader documents this exact split. Kept as a function so a test can
 * point at a fixture package without touching module resolution.
 */
export type PackageJsonResolver = () => string;

const resolveDatabasePackageJson: PackageJsonResolver = () =>
  require.resolve('@embroidery/database/package.json');

/** What one key's publication did. */
export type PolicyPublicationOutcome = 'published' | 'unchanged';

export interface PolicyPublicationResult {
  readonly configKey: string;
  readonly outcome: PolicyPublicationOutcome;
  readonly version: number;
}

@Injectable()
export class PublishApp4PolicyUseCase {
  constructor(
    private readonly transactions: TransactionManager,
    private readonly policies: PolicyConfigurationRepository,
  ) {}

  /**
   * Publishes every APP4 key that is missing or has drifted.
   *
   * `adminId` is the Admin the staff bootstrap just created or reused — the
   * repository's own identity, never an arbitrary "first admin" row and never a
   * synthetic account invented for configuration.
   */
  async publish(
    adminId: string,
    resolvePackageJson: PackageJsonResolver = resolveDatabasePackageJson,
  ): Promise<PolicyPublicationResult[]> {
    const dataset = loadApp4PolicyDataset(resolvePackageJson());
    const results: PolicyPublicationResult[] = [];

    for (const configuration of dataset.configurations) {
      results.push(await this.publishOne(configuration, adminId));
    }
    return results;
  }

  private async publishOne(
    configuration: App4PolicyConfiguration,
    adminId: string,
  ): Promise<PolicyPublicationResult> {
    // The read runs outside the write transaction on purpose: it is a plain
    // lookup, and holding a transaction open across all four keys would serialize
    // a bootstrap step that has no cross-key invariant.
    const current = await this.policies.currentValue(configuration.configKey);
    if (current !== undefined && isUpToDate(current, configuration)) {
      return { configKey: configuration.configKey, outcome: 'unchanged', version: current.version };
    }

    return this.transactions.runInTransaction(async () => {
      await this.policies.ensureKey(configuration.configKey, configuration.description);
      const version = await this.policies.publishVersion({
        configKey: configuration.configKey,
        value: configuration.value,
        valueSchemaVersion: configuration.valueSchemaVersion,
        effectiveFrom: new Date(),
        createdByAdminId: adminId,
        reason: `APP4-G01 policy dataset (${dataset_reason(configuration)})`,
      });
      return { configKey: configuration.configKey, outcome: 'published', version: version.version };
    });
  }
}

/** A stable, secret-free reason line. Never the value itself. */
function dataset_reason(configuration: App4PolicyConfiguration): string {
  return `${configuration.configKey} v${String(configuration.valueSchemaVersion)}`;
}

/**
 * Whether the stored version already matches the dataset.
 *
 * Compares the schema version and the value. `JSON.stringify` over sorted keys
 * is the comparison: the stored value round-tripped through JSONB, so key order
 * is not guaranteed to survive, and an order-sensitive compare would republish
 * an identical value on every boot — the exact accumulation this check exists to
 * prevent.
 */
function isUpToDate(
  current: { readonly value: unknown; readonly valueSchemaVersion: number },
  configuration: App4PolicyConfiguration,
): boolean {
  return (
    current.valueSchemaVersion === configuration.valueSchemaVersion &&
    canonical(current.value) === canonical(configuration.value)
  );
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonical).join(',')}]`;
  }
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
