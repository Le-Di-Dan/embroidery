/**
 * Publishes the `APP6-G01` policy dataset (`APP6-B01`).
 *
 * `APP6-G01` §6.5 shipped three keys as **data only** and routed the reader and
 * the publishing caller here, naming the precedent it wanted followed: the APP4
 * dataset shipped with `APP4-G01` and its reader and publisher with
 * `APP4-B01-C1`. So this is that publisher's APP6 sibling, not a second policy
 * platform — it publishes through the same delivered
 * `PolicyConfigurationRepository`, from the same admin-bearing bootstrap path,
 * with the same drift comparison (`policy-version-comparison.ts`, extracted for
 * exactly this reason).
 *
 * It is a **sibling rather than a generalisation** on purpose. Merging both into
 * one "publish every dataset" service would need a dataset registry and an
 * ordering rule, which is the seed framework both checkpoints were told not to
 * build. Two small publishers that share their one genuinely common mechanic
 * cost less than the framework that would replace them.
 *
 * ### What this publishes, and what it does not
 *
 * Three keys: `quotation.validity`, `quotation.deposit` and
 * `design_approval.agreements` — policy **configuration**. It publishes no
 * legal or agreement *content*: the required agreement types are a configured
 * enumeration, while the text a customer accepts is versioned agreement content
 * owned by `APP6-B10`. Publishing a type name here creates no agreement and
 * commits no wording.
 *
 * There is no HTTP endpoint. Publication is a bootstrap action, not a request —
 * `PolicyModule`'s own rule, unchanged.
 *
 * ### Idempotency
 *
 * By comparison, not by `ensureKey` alone: `ensureKey` makes the *key*
 * idempotent while `publishVersion` always appends, so a bootstrap that ran on
 * every container start would accumulate an identical version per boot. Each key
 * is published only when it has no version yet, or when the stored value or
 * schema version differs from the dataset.
 *
 * Drift is corrected by **appending** a new version, never by mutating history:
 * `policy_configuration_versions` is immutable by design (DB4), and anything
 * that referenced an old version must keep meaning forever.
 */
import { Injectable } from '@nestjs/common';
import { loadApp6PolicyDataset, type App6PolicyConfiguration } from '@embroidery/database';
import { PolicyConfigurationRepository, TransactionManager } from '@embroidery/persistence';

import { isPolicyValueCurrent, type PolicyPublicationResult } from './policy-version-comparison';

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

@Injectable()
export class PublishApp6PolicyUseCase {
  constructor(
    private readonly transactions: TransactionManager,
    private readonly policies: PolicyConfigurationRepository,
  ) {}

  /**
   * Publishes every APP6 key that is missing or has drifted.
   *
   * `adminId` is the Admin the staff bootstrap just created or reused — the
   * repository's own identity, never an arbitrary "first admin" row and never a
   * synthetic account invented for configuration. It is the same id the APP4
   * publication is attributed to on the same boot, because it is the same
   * operator performing the same bootstrap.
   */
  async publish(
    adminId: string,
    resolvePackageJson: PackageJsonResolver = resolveDatabasePackageJson,
  ): Promise<PolicyPublicationResult[]> {
    const dataset = loadApp6PolicyDataset(resolvePackageJson());
    const results: PolicyPublicationResult[] = [];

    for (const configuration of dataset.configurations) {
      results.push(await this.publishOne(configuration, adminId));
    }
    return results;
  }

  private async publishOne(
    configuration: App6PolicyConfiguration,
    adminId: string,
  ): Promise<PolicyPublicationResult> {
    // The read runs outside the write transaction on purpose: it is a plain
    // lookup, and holding a transaction open across all three keys would
    // serialize a bootstrap step that has no cross-key invariant. Two keys
    // drifting is two independent appends, not one atomic policy swap.
    const current = await this.policies.currentValue(configuration.configKey);
    if (current !== undefined && isPolicyValueCurrent(current, configuration)) {
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
        reason: `APP6-G01 policy dataset (${datasetReason(configuration)})`,
      });
      return { configKey: configuration.configKey, outcome: 'published', version: version.version };
    });
  }
}

/** A stable, secret-free reason line. Never the value itself. */
function datasetReason(configuration: App6PolicyConfiguration): string {
  return `${configuration.configKey} v${String(configuration.valueSchemaVersion)}`;
}
