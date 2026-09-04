/**
 * `worker.runtime` publication against a real PostgreSQL instance
 * (`APP12-H03-C1` §4, §6).
 *
 * A double would prove the use case calls what it calls. Only a database proves
 * the two properties that matter: that the key the **worker** reads is present
 * after a bootstrap, and that a bootstrap which runs on every release appends
 * nothing the second time.
 *
 * The read is deliberately performed through `PolicyConfigurationRepository`,
 * because `WorkerPolicyService.load()` calls exactly that method with exactly
 * that key. If publication and consumption ever disagreed about the key, this is
 * where it would show — and until this checkpoint they disagreed about something
 * simpler: nothing published it at all.
 *
 * Values come from the dataset; none is restated here.
 */
import { newId } from '@embroidery/database';
import {
  WORKER_RUNTIME_POLICY_DATASET_KEY,
  loadWorkerRuntimePolicyDataset,
} from '@embroidery/database';
import { PolicyConfigurationRepository } from '@embroidery/persistence';
import { sql } from 'drizzle-orm';

import { createPersistenceTestContext } from '../../../tests/integration/persistence-test-context';
import type { PersistenceTestContext } from '../../../tests/integration/persistence-test-context';
import { PolicyModule } from '../policy.module';
import { PublishWorkerRuntimePolicyUseCase } from '../publish-worker-runtime-policy.use-case';

const DATASET_PACKAGE_JSON = require.resolve('@embroidery/database/package.json');
const dataset = loadWorkerRuntimePolicyDataset(DATASET_PACKAGE_JSON);

type VersionRow = {
  readonly config_key: string;
  readonly version: number;
  readonly value: Record<string, unknown>;
  readonly value_schema_version: number;
};

describe('worker runtime policy publication (integration)', () => {
  let context: PersistenceTestContext;
  let useCase: PublishWorkerRuntimePolicyUseCase;
  let policies: PolicyConfigurationRepository;
  let adminId: string;

  beforeAll(async () => {
    context = await createPersistenceTestContext('app12-h03-c1-worker-policy', [PolicyModule]);
    useCase = context.get(PublishWorkerRuntimePolicyUseCase);
    policies = context.get(PolicyConfigurationRepository);
  }, 120_000);

  afterAll(async () => {
    await context?.close();
  });

  beforeEach(async () => {
    await context.reset();
    // The Admin the staff bootstrap would have created or reused. A real row,
    // because `created_by_admin_id` is a NOT NULL foreign key — which is the
    // whole reason this publication lives on the API side.
    adminId = newId();
    await context.disposable.client.db.execute(sql`
      insert into admin_accounts (id, email, display_name, status)
      values (${adminId}, ${`bootstrap-${adminId}@example.com`}, 'Bootstrap Admin', 'ACTIVE')
    `);
  });

  async function versions(): Promise<VersionRow[]> {
    const result = await context.disposable.client.db.execute<VersionRow>(sql`
      select c.config_key, v.version, v.value, v.value_schema_version
        from policy_configuration_versions v
        join policy_configurations c on c.id = v.policy_configuration_id
       order by c.config_key, v.version
    `);
    return result.rows;
  }

  it('publishes worker.runtime at version 1 from the dataset', async () => {
    const results = await useCase.publish(adminId, () => DATASET_PACKAGE_JSON);

    expect(results).toEqual([
      { configKey: WORKER_RUNTIME_POLICY_DATASET_KEY, outcome: 'published', version: 1 },
    ]);

    const [row] = await versions();
    expect(row?.config_key).toBe(WORKER_RUNTIME_POLICY_DATASET_KEY);
    expect(row?.value).toEqual(dataset.configurations[0]?.value);
    expect(row?.value_schema_version).toBe(dataset.configurations[0]?.valueSchemaVersion);
  });

  it('makes the key readable through the exact call the worker makes', async () => {
    // A fresh database has nothing — the state a cold cluster was left in, and
    // the reason a deployed worker claimed no job.
    expect(await policies.currentValue(WORKER_RUNTIME_POLICY_DATASET_KEY)).toBeUndefined();

    await useCase.publish(adminId, () => DATASET_PACKAGE_JSON);

    const current = await policies.currentValue(WORKER_RUNTIME_POLICY_DATASET_KEY);
    expect(current?.value).toEqual(dataset.configurations[0]?.value);
  });

  it('appends nothing on an identical rerun, as a release-time Job would', async () => {
    await useCase.publish(adminId, () => DATASET_PACKAGE_JSON);

    const results = await useCase.publish(adminId, () => DATASET_PACKAGE_JSON);

    expect(results).toEqual([
      { configKey: WORKER_RUNTIME_POLICY_DATASET_KEY, outcome: 'unchanged', version: 1 },
    ]);
    expect(await versions()).toHaveLength(1);
  });

  it('appends a correcting version when an operator value has drifted', async () => {
    // Drift is corrected by appending: `policy_configuration_versions` is
    // immutable, and a worker that recorded version 1 must keep meaning it.
    await context.inTransaction(async () => {
      await policies.ensureKey(WORKER_RUNTIME_POLICY_DATASET_KEY, 'Operator fixture.');
      await policies.publishVersion({
        configKey: WORKER_RUNTIME_POLICY_DATASET_KEY,
        value: { concurrency: 99 },
        valueSchemaVersion: 1,
        effectiveFrom: new Date(),
        createdByAdminId: adminId,
        reason: 'drift fixture',
      });
    });

    const results = await useCase.publish(adminId, () => DATASET_PACKAGE_JSON);

    expect(results).toEqual([
      { configKey: WORKER_RUNTIME_POLICY_DATASET_KEY, outcome: 'published', version: 2 },
    ]);
    const rows = await versions();
    expect(rows).toHaveLength(2);
    expect(rows[0]?.value).toEqual({ concurrency: 99 });
    expect(rows[1]?.value).toEqual(dataset.configurations[0]?.value);
  });

  it('touches no other policy key', async () => {
    await context.inTransaction(async () => {
      await policies.ensureKey('quotation.validity', 'unrelated fixture');
      await policies.publishVersion({
        configKey: 'quotation.validity',
        value: { validityDays: 7 },
        valueSchemaVersion: 1,
        effectiveFrom: new Date(),
        createdByAdminId: adminId,
        reason: 'unrelated fixture',
      });
    });

    await useCase.publish(adminId, () => DATASET_PACKAGE_JSON);

    const unrelated = (await versions()).filter((row) => row.config_key === 'quotation.validity');
    expect(unrelated).toHaveLength(1);
    expect(unrelated[0]?.value).toEqual({ validityDays: 7 });
  });
});
