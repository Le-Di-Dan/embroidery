/**
 * AGG-23 Business Policy Configuration (TBL-076, TBL-077; CON-144).
 *
 * Named configuration keys with immutable versioned values. This is what makes
 * "no hard-coded business values" (`CLAUDE.md` §5) achievable: expiry windows,
 * limits and percentages are read from here rather than baked into code.
 *
 * Carries **G-DB7-08**: `current_version_id` has a foreign key proving the
 * version *exists*, but nothing proving it belongs to *this* configuration.
 * The application must check that, inside the transaction, before pointing at
 * it — otherwise one key's current value could be another key's version.
 */
import { Injectable } from '@nestjs/common';
import { guardViolationError, newId, notFoundError, schema } from '@embroidery/database';
import { and, desc, eq, lte } from 'drizzle-orm';

import { DatabaseExecutor } from '../runtime/database-executor';
import { DrizzleRepository } from '../repository/drizzle-repository';

const { policyConfigurations, policyConfigurationVersions } = schema;

export interface PolicyConfiguration {
  readonly id: string;
  readonly configKey: string;
  readonly description: string;
  readonly currentVersionId: string | undefined;
}

export interface PolicyConfigurationVersion {
  readonly id: string;
  readonly policyConfigurationId: string;
  readonly version: number;
  readonly value: unknown;
  readonly valueSchemaVersion: number;
  readonly effectiveFrom: Date;
  readonly reason: string;
}

export interface PublishPolicyVersionInput {
  readonly configKey: string;
  readonly value: Record<string, unknown>;
  readonly valueSchemaVersion: number;
  readonly effectiveFrom: Date;
  readonly createdByAdminId: string;
  readonly reason: string;
}

@Injectable()
export class PolicyConfigurationRepository extends DrizzleRepository {
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  /** Creates the key if absent, returning it either way. @requiresTransaction */
  async ensureKey(configKey: string, description: string): Promise<PolicyConfiguration> {
    return this.run('ensureKey', async () => {
      const tx = this.requireTransaction('ensureKey');

      const [inserted] = await tx
        .insert(policyConfigurations)
        .values({ id: newId(), configKey, description })
        .onConflictDoNothing({ target: policyConfigurations.configKey })
        .returning();

      if (inserted !== undefined) {
        return toConfiguration(inserted);
      }

      const existing = await this.loadByKey(configKey);
      if (existing === undefined) {
        throw notFoundError(
          'PolicyConfigurationRepository.ensureKey',
          'That configuration key could not be read.',
        );
      }
      return existing;
    });
  }

  /**
   * Appends a version and makes it current, in one transaction.
   *
   * The version number is derived from the current maximum under a row lock on
   * the configuration, so two concurrent publishes cannot pick the same number
   * — and if they somehow raced past the lock, the
   * `uq_policy_configuration_versions__config_version` arbiter still rejects
   * the second. Concurrent correctness is DB8's to prove.
   *
   * @requiresTransaction
   */
  async publishVersion(input: PublishPolicyVersionInput): Promise<PolicyConfigurationVersion> {
    return this.run('publishVersion', async () => {
      const tx = this.requireTransaction('publishVersion');

      const [configuration] = await tx
        .select()
        .from(policyConfigurations)
        .where(eq(policyConfigurations.configKey, input.configKey))
        .limit(1)
        .for('update');

      if (configuration === undefined) {
        throw notFoundError(
          'PolicyConfigurationRepository.publishVersion',
          'That configuration key does not exist.',
        );
      }

      const [latest] = await tx
        .select({ version: policyConfigurationVersions.version })
        .from(policyConfigurationVersions)
        .where(eq(policyConfigurationVersions.policyConfigurationId, configuration.id))
        .orderBy(desc(policyConfigurationVersions.version))
        .limit(1);

      const [version] = await tx
        .insert(policyConfigurationVersions)
        .values({
          id: newId(),
          policyConfigurationId: configuration.id,
          version: (latest?.version ?? 0) + 1,
          value: input.value,
          valueSchemaVersion: input.valueSchemaVersion,
          effectiveFrom: input.effectiveFrom,
          createdByAdminId: input.createdByAdminId,
          reason: input.reason,
        })
        .returning();

      if (version === undefined) {
        throw guardViolationError(
          'PolicyConfigurationRepository.publishVersion',
          'POLICY_VERSION_NOT_CREATED',
          'Could not publish the configuration version.',
        );
      }

      await tx
        .update(policyConfigurations)
        .set({ currentVersionId: version.id, updatedAt: new Date() })
        .where(eq(policyConfigurations.id, configuration.id));

      return toVersion(version);
    });
  }

  /**
   * Points a configuration at one of its **own** versions (G-DB7-08).
   *
   * The foreign key proves the version exists; only this read proves it belongs
   * here. Used to roll back to an earlier version.
   *
   * @requiresTransaction
   */
  async setCurrentVersion(configurationId: string, versionId: string): Promise<void> {
    return this.run('setCurrentVersion', async () => {
      const tx = this.requireTransaction('setCurrentVersion');

      const [version] = await tx
        .select({ owner: policyConfigurationVersions.policyConfigurationId })
        .from(policyConfigurationVersions)
        .where(eq(policyConfigurationVersions.id, versionId))
        .limit(1);

      if (version === undefined) {
        throw notFoundError(
          'PolicyConfigurationRepository.setCurrentVersion',
          'That configuration version does not exist.',
        );
      }
      if (version.owner !== configurationId) {
        // G-DB7-08. The database cannot express this: it is a cross-row
        // relationship, not a column constraint.
        throw guardViolationError(
          'PolicyConfigurationRepository.setCurrentVersion',
          'VERSION_BELONGS_TO_ANOTHER_CONFIGURATION',
          'That version does not belong to this configuration.',
        );
      }

      await tx
        .update(policyConfigurations)
        .set({ currentVersionId: versionId, updatedAt: new Date() })
        .where(eq(policyConfigurations.id, configurationId));
    });
  }

  async findByKey(configKey: string): Promise<PolicyConfiguration | undefined> {
    return this.run('findByKey', () => this.loadByKey(configKey));
  }

  /**
   * The current value of a key, or undefined when it has none.
   *
   * Callers parse the JSONB value at their own boundary rather than receiving
   * `unknown` deep in business code (DB7 §10.6).
   */
  async currentValue(configKey: string): Promise<PolicyConfigurationVersion | undefined> {
    return this.run('currentValue', async () => {
      const [row] = await this.db
        .select({ version: policyConfigurationVersions })
        .from(policyConfigurations)
        .innerJoin(
          policyConfigurationVersions,
          eq(policyConfigurations.currentVersionId, policyConfigurationVersions.id),
        )
        .where(eq(policyConfigurations.configKey, configKey))
        .limit(1);

      return row === undefined ? undefined : toVersion(row.version);
    });
  }

  async listVersions(configurationId: string): Promise<PolicyConfigurationVersion[]> {
    return this.run('listVersions', async () => {
      const rows = await this.db
        .select()
        .from(policyConfigurationVersions)
        .where(eq(policyConfigurationVersions.policyConfigurationId, configurationId))
        .orderBy(desc(policyConfigurationVersions.version));

      return rows.map(toVersion);
    });
  }

  /** The version effective at a given instant, for reproducing a past decision. */
  async versionEffectiveAt(
    configKey: string,
    at: Date,
  ): Promise<PolicyConfigurationVersion | undefined> {
    return this.run('versionEffectiveAt', async () => {
      const [row] = await this.db
        .select({ version: policyConfigurationVersions })
        .from(policyConfigurationVersions)
        .innerJoin(
          policyConfigurations,
          eq(policyConfigurationVersions.policyConfigurationId, policyConfigurations.id),
        )
        .where(
          and(
            eq(policyConfigurations.configKey, configKey),
            // `<=` so a version effective exactly at `at` counts as in force.
            lte(policyConfigurationVersions.effectiveFrom, at),
          ),
        )
        // Newest first, then take one: that is the version in force at `at`.
        .orderBy(
          desc(policyConfigurationVersions.effectiveFrom),
          desc(policyConfigurationVersions.version),
        )
        .limit(1);

      return row === undefined ? undefined : toVersion(row.version);
    });
  }

  private async loadByKey(configKey: string): Promise<PolicyConfiguration | undefined> {
    const [row] = await this.db
      .select()
      .from(policyConfigurations)
      .where(eq(policyConfigurations.configKey, configKey))
      .limit(1);
    return row === undefined ? undefined : toConfiguration(row);
  }
}

type ConfigurationRow = typeof policyConfigurations.$inferSelect;
type VersionRow = typeof policyConfigurationVersions.$inferSelect;

function toConfiguration(row: ConfigurationRow): PolicyConfiguration {
  return {
    id: row.id,
    configKey: row.configKey,
    description: row.description,
    currentVersionId: row.currentVersionId ?? undefined,
  };
}

function toVersion(row: VersionRow): PolicyConfigurationVersion {
  return {
    id: row.id,
    policyConfigurationId: row.policyConfigurationId,
    version: row.version,
    value: row.value,
    valueSchemaVersion: row.valueSchemaVersion,
    effectiveFrom: row.effectiveFrom,
    reason: row.reason,
  };
}
