/**
 * APP6 policy publication against a real PostgreSQL instance (`APP6-B01`).
 *
 * A double would prove the use case calls what it calls. Only a database proves
 * the properties that matter here: that a bootstrap which runs on **every**
 * container start appends nothing the second time, and that drift is corrected
 * by appending rather than by rewriting a version something may already
 * reference.
 *
 * Values come from the `APP6-G01` dataset; none is restated here.
 */
import { newId } from '@embroidery/database';
import { APP6_POLICY_KEYS, loadApp6PolicyDataset } from '@embroidery/database';
import { PolicyConfigurationRepository } from '@embroidery/persistence';
import { sql } from 'drizzle-orm';

import { createPersistenceTestContext } from '../../../tests/integration/persistence-test-context';
import type { PersistenceTestContext } from '../../../tests/integration/persistence-test-context';
import { PolicyModule } from '../policy.module';
import { PublishApp6PolicyUseCase } from '../publish-app6-policy.use-case';

const DATASET_PACKAGE_JSON = require.resolve('@embroidery/database/package.json');
const dataset = loadApp6PolicyDataset(DATASET_PACKAGE_JSON);

type VersionRow = {
  readonly config_key: string;
  readonly version: number;
  readonly value: Record<string, unknown>;
  readonly value_schema_version: number;
  readonly created_by_admin_id: string;
};

describe('APP6 policy publication (integration)', () => {
  let context: PersistenceTestContext;
  let useCase: PublishApp6PolicyUseCase;
  let policies: PolicyConfigurationRepository;
  let adminId: string;

  beforeAll(async () => {
    context = await createPersistenceTestContext('app6-b01-policy', [PolicyModule]);
    useCase = context.get(PublishApp6PolicyUseCase);
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

  /**
   * Every published version.
   *
   * The context is reset per test and only this use case publishes into it, so
   * an unfiltered read *is* the APP6 read — and unlike a filtered one it would
   * also catch a key this publisher should never have written.
   */
  async function app6Versions(): Promise<VersionRow[]> {
    const result = await context.disposable.client.db.execute<VersionRow>(sql`
      select c.config_key, v.version, v.value, v.value_schema_version, v.created_by_admin_id
        from policy_configuration_versions v
        join policy_configurations c on c.id = v.policy_configuration_id
       order by c.config_key, v.version
    `);
    return result.rows;
  }

  it('publishes all three APP6 keys, attributed to the resolved Admin', async () => {
    const results = await useCase.publish(adminId, () => DATASET_PACKAGE_JSON);

    expect(results.map((result) => result.configKey).sort()).toEqual([...APP6_POLICY_KEYS].sort());
    expect(results.every((result) => result.outcome === 'published')).toBe(true);

    const rows = await app6Versions();
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.version === 1)).toBe(true);
    expect(rows.every((row) => row.created_by_admin_id === adminId)).toBe(true);
  });

  it('publishes exactly the dataset value, unmodified', async () => {
    await useCase.publish(adminId, () => DATASET_PACKAGE_JSON);

    for (const configuration of dataset.configurations) {
      const stored = await policies.currentValue(configuration.configKey);
      expect(stored?.value).toEqual(configuration.value);
      expect(stored?.valueSchemaVersion).toBe(configuration.valueSchemaVersion);
    }
  });

  it('appends nothing on a second run with identical data', async () => {
    await useCase.publish(adminId, () => DATASET_PACKAGE_JSON);
    const second = await useCase.publish(adminId, () => DATASET_PACKAGE_JSON);

    expect(second.every((result) => result.outcome === 'unchanged')).toBe(true);
    // The property a bootstrap that runs on every container start depends on.
    expect(await app6Versions()).toHaveLength(3);
  });

  it('is unaffected by JSON key order, which JSONB does not preserve', async () => {
    await useCase.publish(adminId, () => DATASET_PACKAGE_JSON);

    // Rewrite each stored value with its keys reversed. The value is identical;
    // only the serialization order differs. An order-sensitive comparison would
    // read this as drift and append a duplicate version on every boot.
    for (const configuration of dataset.configurations) {
      const reversed = Object.fromEntries(Object.entries(configuration.value).reverse());
      await context.disposable.client.db.execute(sql`
        update policy_configuration_versions v
        set value = ${JSON.stringify(reversed)}::jsonb
        from policy_configurations c
        where c.id = v.policy_configuration_id and c.config_key = ${configuration.configKey}
      `);
    }

    const again = await useCase.publish(adminId, () => DATASET_PACKAGE_JSON);
    expect(again.every((result) => result.outcome === 'unchanged')).toBe(true);
    expect(await app6Versions()).toHaveLength(3);
  });

  it('corrects drift by appending a new version, leaving history intact', async () => {
    await useCase.publish(adminId, () => DATASET_PACKAGE_JSON);
    const drifted = dataset.configurations[0]!.configKey;

    await context.disposable.client.db.execute(sql`
      update policy_configuration_versions v
      set value = ${JSON.stringify({ driftedByHand: true })}::jsonb
      from policy_configurations c
      where c.id = v.policy_configuration_id and c.config_key = ${drifted}
    `);

    const results = await useCase.publish(adminId, () => DATASET_PACKAGE_JSON);

    expect(results.find((result) => result.configKey === drifted)?.outcome).toBe('published');
    expect(
      results
        .filter((result) => result.configKey !== drifted)
        .every((r) => r.outcome === 'unchanged'),
    ).toBe(true);

    const rows = await app6Versions();
    // Four rows: the drifted key now has two, and its version 1 still carries
    // the hand-written value. History is immutable — it was appended to, never
    // rewritten.
    expect(rows).toHaveLength(4);
    const history = rows.filter((row) => row.config_key === drifted);
    expect(history.map((row) => row.version)).toEqual([1, 2]);
    expect(history[0]?.value).toEqual({ driftedByHand: true });
    expect(history[1]?.value).toEqual(dataset.configurations[0]!.value);
  });

  it('publishes no agreement content — only configuration', async () => {
    await useCase.publish(adminId, () => DATASET_PACKAGE_JSON);

    // `design_approval.agreements` names the required *types*. The wording a
    // customer accepts is versioned agreement content, owned by `APP6-B10`.
    const agreements = await context.disposable.client.db.execute<{ count: string }>(
      sql`select count(*)::text as count from agreement_versions`,
    );
    expect(agreements.rows[0]?.count).toBe('0');
  });
});
