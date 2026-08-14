/**
 * APP4 policy publication against a real PostgreSQL instance (`APP4-B01-C1`).
 *
 * A double would prove the use case calls what it calls. Only a database proves
 * the property that matters here: that a bootstrap which runs on **every**
 * container start appends nothing the second time. That is the whole point of
 * comparing before publishing, and it is invisible without real rows.
 *
 * Values come from the `APP4-G01` dataset; none is restated here.
 */
import { newId } from '@embroidery/database';
import { APP4_POLICY_KEYS, loadApp4PolicyDataset } from '@embroidery/database';
import { PolicyConfigurationRepository } from '@embroidery/persistence';
import { sql } from 'drizzle-orm';

import { createPersistenceTestContext } from '../../../tests/integration/persistence-test-context';
import type { PersistenceTestContext } from '../../../tests/integration/persistence-test-context';
import { PolicyModule } from '../policy.module';
import { PublishApp4PolicyUseCase } from '../publish-app4-policy.use-case';

const DATASET_PACKAGE_JSON = require.resolve('@embroidery/database/package.json');
const dataset = loadApp4PolicyDataset(DATASET_PACKAGE_JSON);

type VersionRow = {
  readonly config_key: string;
  readonly version: number;
  readonly value: Record<string, unknown>;
  readonly value_schema_version: number;
  readonly created_by_admin_id: string;
};

describe('APP4 policy publication (integration)', () => {
  let context: PersistenceTestContext;
  let useCase: PublishApp4PolicyUseCase;
  let policies: PolicyConfigurationRepository;
  let adminId: string;

  beforeAll(async () => {
    context = await createPersistenceTestContext('app4-b01-c1-policy', [PolicyModule]);
    useCase = context.get(PublishApp4PolicyUseCase);
    policies = context.get(PolicyConfigurationRepository);
  }, 120_000);

  afterAll(async () => {
    await context?.close();
  });

  beforeEach(async () => {
    await context.reset();
    // The Admin the staff bootstrap would have created or reused. A real row,
    // because `created_by_admin_id` is a NOT NULL foreign key.
    adminId = newId();
    await context.disposable.client.db.execute(sql`
      insert into admin_accounts (id, email, display_name, status)
      values (${adminId}, ${`bootstrap-${adminId}@example.com`}, 'Bootstrap Admin', 'ACTIVE')
    `);
  });

  async function versions(): Promise<VersionRow[]> {
    const result = await context.disposable.client.db.execute<VersionRow>(sql`
      select c.config_key, v.version, v.value, v.value_schema_version, v.created_by_admin_id
        from policy_configuration_versions v
        join policy_configurations c on c.id = v.policy_configuration_id
       order by c.config_key, v.version
    `);
    return result.rows;
  }

  it('publishes all four canonical keys at version 1 from the dataset', async () => {
    const results = await useCase.publish(adminId, () => DATASET_PACKAGE_JSON);

    expect(results).toHaveLength(4);
    expect(results.every((result) => result.outcome === 'published')).toBe(true);
    expect(results.map((result) => result.configKey).sort()).toEqual([...APP4_POLICY_KEYS].sort());

    const rows = await versions();
    expect(rows).toHaveLength(4);
    for (const configuration of dataset.configurations) {
      const row = rows.find((candidate) => candidate.config_key === configuration.configKey);
      expect(row?.version).toBe(1);
      expect(row?.value_schema_version).toBe(configuration.valueSchemaVersion);
      // The stored value is the dataset value, field for field.
      expect(row?.value).toEqual(configuration.value);
    }
  });

  it('makes every key readable through the repository the consumers use', async () => {
    await useCase.publish(adminId, () => DATASET_PACKAGE_JSON);

    for (const configuration of dataset.configurations) {
      const current = await policies.currentValue(configuration.configKey);
      expect(current?.value).toEqual(configuration.value);
      expect(current?.valueSchemaVersion).toBe(configuration.valueSchemaVersion);
    }
  });

  it('appends nothing on an identical rerun', async () => {
    await useCase.publish(adminId, () => DATASET_PACKAGE_JSON);
    const first = await versions();

    const results = await useCase.publish(adminId, () => DATASET_PACKAGE_JSON);
    expect(results.every((result) => result.outcome === 'unchanged')).toBe(true);

    const second = await versions();
    expect(second).toHaveLength(first.length);
    expect(second.map((row) => `${row.config_key}@${String(row.version)}`)).toEqual(
      first.map((row) => `${row.config_key}@${String(row.version)}`),
    );
  });

  it('stays idempotent across several reruns, as a bootstrap on every boot would', async () => {
    for (let boot = 0; boot < 3; boot += 1) {
      await useCase.publish(adminId, () => DATASET_PACKAGE_JSON);
    }
    expect(await versions()).toHaveLength(4);
  });

  it('appends a correcting version when the stored value has drifted', async () => {
    // A fixture version that is not the dataset value; the dataset is untouched.
    const target = dataset.configurations[0]!;
    await context.inTransaction(async () => {
      await policies.ensureKey(target.configKey, 'fixture');
      await policies.publishVersion({
        configKey: target.configKey,
        value: { driftedFixtureValue: true },
        valueSchemaVersion: target.valueSchemaVersion,
        effectiveFrom: new Date(),
        createdByAdminId: adminId,
        reason: 'fixture drift',
      });
    });

    const results = await useCase.publish(adminId, () => DATASET_PACKAGE_JSON);
    expect(results.find((r) => r.configKey === target.configKey)?.outcome).toBe('published');

    const rows = (await versions()).filter((row) => row.config_key === target.configKey);
    expect(rows).toHaveLength(2);
    // History is append-only: the drifted version survives as version 1.
    expect(rows[0]?.version).toBe(1);
    expect(rows[0]?.value).toEqual({ driftedFixtureValue: true });
    expect(rows[1]?.version).toBe(2);
    expect(rows[1]?.value).toEqual(target.value);
    // And the current pointer moved to the correction.
    expect((await policies.currentValue(target.configKey))?.value).toEqual(target.value);
  });

  it('republishes when only the value schema version differs', async () => {
    const target = dataset.configurations[1]!;
    await context.inTransaction(async () => {
      await policies.ensureKey(target.configKey, 'fixture');
      await policies.publishVersion({
        configKey: target.configKey,
        value: target.value,
        valueSchemaVersion: target.valueSchemaVersion + 1,
        effectiveFrom: new Date(),
        createdByAdminId: adminId,
        reason: 'fixture schema drift',
      });
    });

    const results = await useCase.publish(adminId, () => DATASET_PACKAGE_JSON);
    expect(results.find((r) => r.configKey === target.configKey)?.outcome).toBe('published');
    expect((await policies.currentValue(target.configKey))?.valueSchemaVersion).toBe(
      target.valueSchemaVersion,
    );
  });

  it('attributes every published version to the bootstrap Admin', async () => {
    await useCase.publish(adminId, () => DATASET_PACKAGE_JSON);
    for (const row of await versions()) {
      expect(row.created_by_admin_id).toBe(adminId);
    }
  });

  it('touches no unrelated policy key', async () => {
    await context.inTransaction(async () => {
      await policies.ensureKey('worker.runtime', 'unrelated fixture');
      await policies.publishVersion({
        configKey: 'worker.runtime',
        value: { concurrency: 1 },
        valueSchemaVersion: 1,
        effectiveFrom: new Date(),
        createdByAdminId: adminId,
        reason: 'unrelated fixture',
      });
    });

    await useCase.publish(adminId, () => DATASET_PACKAGE_JSON);

    const unrelated = (await versions()).filter((row) => row.config_key === 'worker.runtime');
    expect(unrelated).toHaveLength(1);
    expect(unrelated[0]?.value).toEqual({ concurrency: 1 });
    expect((await versions()).filter((row) => row.config_key !== 'worker.runtime')).toHaveLength(4);
  });
});
