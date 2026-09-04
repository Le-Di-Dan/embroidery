/**
 * Publishes the `worker.runtime` policy dataset (`APP12-H03-C1` §4, §6).
 *
 * ### The defect this closes
 *
 * `APP2-I02` made the worker's ten runtime values a versioned policy and shipped
 * the consumer. It shipped no publisher. Every environment that has ever had the
 * policy got it from a Jest fixture context or from the `APP2-E01` disposable
 * smoke tool, so a worker deployed from the committed manifests found nothing,
 * logged `WORKER_POLICY_MISSING` and claimed no job for the life of the pod.
 * `APP12-H03` observed exactly that in a production-like cluster: a worker pod
 * `Ready`, alive, and structurally incapable of doing work.
 *
 * ### Why here, and not a second mechanism
 *
 * `policy_configuration_versions.created_by_admin_id` is `NOT NULL`. Only the
 * API holds an Admin identity, and the `staff-bootstrap` one-shot CLI is the
 * repository's single admin-bearing bootstrap path — which is why `APP4-B01-C1`
 * put policy publication there and `APP6-B01` joined it rather than building a
 * second one. This is the third publisher on that seam and it introduces no new
 * mechanism, no seed runner, no ordering and no registry: the same dataset →
 * reader → `ensureKey` + `publishVersion` path, with the same drift comparison.
 *
 * The worker still *consumes* only. Nothing here changes the fail-closed rule a
 * missing or invalid policy triggers — it changes only whether a correct
 * deployment supplies one.
 */
import { Injectable } from '@nestjs/common';
import {
  loadWorkerRuntimePolicyDataset,
  type WorkerRuntimePolicyConfiguration,
} from '@embroidery/database';
import { PolicyConfigurationRepository, TransactionManager } from '@embroidery/persistence';

import { isPolicyValueCurrent, type PolicyPublicationResult } from './policy-version-comparison';

/**
 * How `@embroidery/database` is located at runtime.
 *
 * `require.resolve` rather than `import.meta.url`, for the reason the two
 * sibling publishers record: the API is CommonJS. Kept as a function so a test
 * can point at a fixture package without touching module resolution.
 */
export type PackageJsonResolver = () => string;

const resolveDatabasePackageJson: PackageJsonResolver = () =>
  require.resolve('@embroidery/database/package.json');

@Injectable()
export class PublishWorkerRuntimePolicyUseCase {
  constructor(
    private readonly transactions: TransactionManager,
    private readonly policies: PolicyConfigurationRepository,
  ) {}

  /**
   * Publishes `worker.runtime` when it is missing or has drifted.
   *
   * `adminId` is the Admin the staff bootstrap just created or reused — the same
   * id the APP4 and APP6 publications on this boot are attributed to, because it
   * is the same operator performing the same bootstrap.
   *
   * Idempotent by comparison: a rerun against an unchanged dataset publishes
   * nothing, so a Job that runs on every release does not accumulate an
   * identical version per deploy.
   */
  async publish(
    adminId: string,
    resolvePackageJson: PackageJsonResolver = resolveDatabasePackageJson,
  ): Promise<PolicyPublicationResult[]> {
    const dataset = loadWorkerRuntimePolicyDataset(resolvePackageJson());
    const results: PolicyPublicationResult[] = [];

    for (const configuration of dataset.configurations) {
      results.push(await this.publishOne(configuration, adminId));
    }
    return results;
  }

  private async publishOne(
    configuration: WorkerRuntimePolicyConfiguration,
    adminId: string,
  ): Promise<PolicyPublicationResult> {
    // The read runs outside the write transaction, as in both sibling
    // publishers: it is a plain lookup with no cross-key invariant to hold.
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
        reason: `APP2-I02 worker runtime policy (${datasetReason(configuration)})`,
      });
      return { configKey: configuration.configKey, outcome: 'published', version: version.version };
    });
  }
}

/** A stable, secret-free reason line. Never the value itself. */
function datasetReason(configuration: WorkerRuntimePolicyConfiguration): string {
  return `${configuration.configKey} v${String(configuration.valueSchemaVersion)}`;
}
