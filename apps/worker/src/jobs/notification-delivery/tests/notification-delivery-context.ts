/**
 * Live-worker harness for the `APP4-W01` delivery suites.
 *
 * Boots the real `WorkerModule` — real registry, real
 * `WorkerJobQueueRepository`, real `JobExecutionService`, real transactions —
 * against a disposable database with every migration applied.
 *
 * The one deliberate difference from the APP2 runtime harness: the startup gate
 * is **closed**, so the poll loop never claims. Attempts are driven one at a
 * time through {@link NotificationWorkerContext.runOnce}, which claims through
 * the same repository the loop would and executes through the same service.
 * That is not a shortcut around the runtime — it is the only way to observe a
 * `[60, 300]`-second schedule without waiting six minutes: the suite asserts the
 * delay the completion actually wrote, then moves the row's own due instant
 * forward and claims again.
 *
 * The global `worker.runtime` policy here deliberately allows **two** attempts.
 * Any suite that observes three is observing the handler's published
 * `notification.delivery` plan, not the runtime default.
 *
 * Test-only. Build-excluded via `src/**` + `tests/**`.
 */
import { createCipheriv, randomBytes } from 'node:crypto';

import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { executeRaw, newId, sql } from '@embroidery/database';
import type { DisposableDatabase } from '@embroidery/database/testing';
import { createDisposableDatabase } from '@embroidery/database/testing';
import { PolicyConfigurationRepository, TransactionManager } from '@embroidery/persistence';
import { WorkerJobQueueRepository } from '@embroidery/persistence';
import {
  DELIVERY_ENVELOPE_ALGORITHM,
  DELIVERY_ENVELOPE_VERSION,
  NOTIFICATION_DELIVERY_ENVELOPE_KEY_ENV,
  parseEnvelopeKey,
  sealDeliveryEnvelope,
  type DeliveryEnvelope,
  type DeliveryPayload,
  type EnvelopeKey,
} from '@embroidery/notification-delivery';

import { WorkerModule } from '../../../bootstrap/worker.module';
import { JobExecutionService } from '../../../runtime/execution/job-execution.service';
import type { AttemptSummary } from '../../../runtime/execution/job-execution.service';
import { WorkerFatalService } from '../../../runtime/lifecycle/worker-fatal.service';
import { WORKER_PROCESS } from '../../../runtime/lifecycle/worker-process';
import { JobHandlerRegistry } from '../../../runtime/registry/job-handler.registry';
import { WORKER_STARTUP_GATE } from '../../../runtime/startup/startup-gate';
import type { WorkerRuntimePolicy } from '../../../runtime/policy/worker-runtime-policy';
import {
  WORKER_RUNTIME_POLICY_KEY,
  WORKER_RUNTIME_POLICY_SCHEMA_VERSION,
} from '../../../runtime/policy/worker-runtime-policy';
import { applyOfflineObjectStorageEnv } from '../../../runtime/tests/offline-object-storage-env';
import { STOREFRONT_PUBLIC_ORIGIN_ENV } from '../config/storefront-origin.config';
import { NOTIFICATION_DELIVERY_EVENT_TYPE } from '../domain/notification-delivery.payload';
import {
  NOTIFICATION_DELIVERY_POLICY_KEY,
  NOTIFICATION_DELIVERY_POLICY_SCHEMA_VERSION,
} from '../domain/notification-delivery-policy';
import { RecordingNotificationChannelAdapter } from '../infrastructure/channel/recording-notification-channel.adapter';
import { NotificationDeliveryPolicyService } from '../infrastructure/policy/notification-delivery-policy.service';

/** A budget of two, so a third attempt can only come from the delivery plan. */
export const RUNTIME_POLICY: WorkerRuntimePolicy = {
  concurrency: 2,
  batchSize: 5,
  pollIntervalMs: 25,
  leaseDurationMs: 5_000,
  handlerTimeoutMs: 300,
  leaseSafetyMarginMs: 1_000,
  shutdownGraceMs: 300,
  maxAttempts: 2,
  backoffBaseMs: 10,
  backoffMaxMs: 200,
};

/** The `APP4-G01` values, as published. Restated by no production file. */
export const DELIVERY_POLICY_VALUE = { maxAttempts: 3, retryDelaysSeconds: [60, 300] };

/**
 * The Storefront origin these suites render links against (`APP4-B05`).
 *
 * A `.invalid` host, reserved by RFC 2606 and resolvable by nothing: the value
 * has to look like a real origin for the composition to be meaningful, and must
 * not be a domain anybody could register. It is a test value, which is the only
 * place IMP-D050 permits an example origin to exist.
 */
export const TEST_STOREFRONT_ORIGIN = 'https://storefront.test.invalid';

/**
 * A synthetic key, generated per run.
 *
 * Never a literal: a checked-in 32-byte base64 string is a credential in the
 * repository whether or not anything real is sealed under it.
 */
export function syntheticEnvelopeKey(): { raw: string; key: EnvelopeKey } {
  const raw = randomBytes(32).toString('base64');
  return { raw, key: parseEnvelopeKey(raw, NOTIFICATION_DELIVERY_ENVELOPE_KEY_ENV) };
}

export interface NotificationWorkerContext {
  readonly moduleRef: TestingModule;
  readonly disposable: DisposableDatabase;
  readonly adapter: RecordingNotificationChannelAdapter;
  readonly envelopeKey: EnvelopeKey;
  readonly workerInstanceId: string;
  get<T>(token: unknown): T;
  /** Claims the next due job and runs one attempt, exactly as the loop would. */
  runOnce(): Promise<AttemptSummary | undefined>;
  close(): Promise<void>;
}

export interface StartOptions {
  readonly label: string;
  /** Omit to exercise the unpublished-policy path. */
  readonly deliveryPolicy?: Record<string, unknown> | undefined;
}

export async function startNotificationWorker(
  options: StartOptions,
): Promise<NotificationWorkerContext> {
  const disposable = await createDisposableDatabase(options.label);
  const previous = {
    url: process.env['DATABASE_URL'],
    env: process.env['NODE_ENV'],
    key: process.env[NOTIFICATION_DELIVERY_ENVELOPE_KEY_ENV],
    origin: process.env[STOREFRONT_PUBLIC_ORIGIN_ENV],
  };
  const { raw, key } = syntheticEnvelopeKey();
  process.env['DATABASE_URL'] = disposable.url;
  process.env['NODE_ENV'] = 'test';
  process.env[NOTIFICATION_DELIVERY_ENVELOPE_KEY_ENV] = raw;
  // `APP4-B05`: a `SECURE_LINK_TOKEN` delivery composes an absolute link and
  // fails closed without this. Set for every suite so the one secure-link case
  // renders, and restored on close like the key beside it.
  process.env[STOREFRONT_PUBLIC_ORIGIN_ENV] = TEST_STOREFRONT_ORIGIN;
  const restoreStorageEnv = applyOfflineObjectStorageEnv();

  let moduleRef: TestingModule;
  try {
    moduleRef = await Test.createTestingModule({ imports: [WorkerModule] })
      .overrideProvider(WORKER_PROCESS)
      .useValue({ exit: () => undefined })
      // Closed on purpose: the poll loop must not claim, because these suites
      // drive attempts themselves to control the clock.
      .overrideProvider(WORKER_STARTUP_GATE)
      .useValue({ ensureReady: () => Promise.resolve({ ok: false, errorClass: 'TEST_HELD' }) })
      .compile();

    await publishPolicies(moduleRef, disposable, options.deliveryPolicy);
    await moduleRef.init();
  } catch (error: unknown) {
    restoreStorageEnv();
    await disposable.drop();
    throw error;
  }

  moduleRef.get(WorkerFatalService).registerCloser(() => moduleRef.close());
  const registry = moduleRef.get(JobHandlerRegistry);
  const queue = moduleRef.get(WorkerJobQueueRepository);
  const transactions = moduleRef.get(TransactionManager);
  const execution = moduleRef.get(JobExecutionService);
  const workerInstanceId = `app4-w01-${newId()}`;

  let closed = false;
  return {
    moduleRef,
    disposable,
    adapter: moduleRef.get(RecordingNotificationChannelAdapter),
    envelopeKey: key,
    workerInstanceId,
    get: <T>(token: unknown): T => moduleRef.get<T>(token as never),

    runOnce: async (): Promise<AttemptSummary | undefined> => {
      // One poll cycle, modelled faithfully: the real loop re-checks closed
      // claim gates before deciding what it may claim (`APP12-H04-C1` §3).
      // Without this the harness would report "not claimed" forever after a
      // policy was published, which is the opposite of the runtime's behaviour.
      await registry.refreshClaimGates();
      const claimed = await transactions.runInTransaction(() =>
        queue.claimRegisteredBatch({
          workerInstanceId,
          registeredTypes: registry.registeredTypes(),
          // One row per call. A larger batch would lease rows this harness then
          // never executes, and a later assertion about "no second send" would
          // be measuring an abandoned lease instead of the guard it targets.
          batchSize: 1,
          leaseDurationMs: RUNTIME_POLICY.leaseDurationMs,
        }),
      );
      const job = claimed[0];
      return job === undefined ? undefined : execution.run(job, RUNTIME_POLICY, workerInstanceId);
    },

    close: async (): Promise<void> => {
      if (closed) return;
      closed = true;
      await moduleRef.close();
      restoreStorageEnv();
      restore('DATABASE_URL', previous.url);
      restore('NODE_ENV', previous.env);
      restore(NOTIFICATION_DELIVERY_ENVELOPE_KEY_ENV, previous.key);
      restore(STOREFRONT_PUBLIC_ORIGIN_ENV, previous.origin);
      await disposable.drop();
    },
  };
}

/** Reloads the delivery policy after a suite has changed it mid-run. */
export async function reloadDeliveryPolicy(context: NotificationWorkerContext): Promise<void> {
  await context.get<NotificationDeliveryPolicyService>(NotificationDeliveryPolicyService).load();
}

function restore(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

/** Publishes both policies through their canonical versioned path — no shortcut. */
async function publishPolicies(
  moduleRef: TestingModule,
  disposable: DisposableDatabase,
  deliveryPolicy: Record<string, unknown> | undefined,
): Promise<void> {
  const adminId = newId();
  await executeRaw(
    disposable.client.db,
    sql`
      INSERT INTO admin_accounts (id, email, display_name, status)
      VALUES (${adminId}, ${`w01-${adminId}@example.com`}, 'W01 Fixture', 'ACTIVE')
    `,
  );

  const policies = moduleRef.get(PolicyConfigurationRepository);
  await moduleRef.get(TransactionManager).runInTransaction(async () => {
    await policies.ensureKey(WORKER_RUNTIME_POLICY_KEY, 'Worker runtime policy (APP2-I02).');
    await policies.publishVersion({
      configKey: WORKER_RUNTIME_POLICY_KEY,
      value: { ...RUNTIME_POLICY },
      valueSchemaVersion: WORKER_RUNTIME_POLICY_SCHEMA_VERSION,
      effectiveFrom: new Date(),
      createdByAdminId: adminId,
      reason: 'APP4-W01 integration fixture.',
    });

    if (deliveryPolicy === undefined) {
      return;
    }
    await policies.ensureKey(
      NOTIFICATION_DELIVERY_POLICY_KEY,
      'Notification delivery policy (APP4-G01).',
    );
    await policies.publishVersion({
      configKey: NOTIFICATION_DELIVERY_POLICY_KEY,
      value: deliveryPolicy,
      valueSchemaVersion: NOTIFICATION_DELIVERY_POLICY_SCHEMA_VERSION,
      effectiveFrom: new Date(),
      createdByAdminId: adminId,
      reason: 'APP4-W01 integration fixture.',
    });
  });
}

/** Publishes a delivery policy into a database that had none. */
export async function publishDeliveryPolicy(
  context: NotificationWorkerContext,
  value: Record<string, unknown>,
): Promise<void> {
  const rows = await executeRaw<{ id: string }>(
    context.disposable.client.db,
    sql`SELECT id FROM admin_accounts LIMIT 1`,
  );
  const adminId = rows[0]?.id ?? newId();
  const policies = context.get<PolicyConfigurationRepository>(PolicyConfigurationRepository);
  await context.get<TransactionManager>(TransactionManager).runInTransaction(async () => {
    await policies.ensureKey(
      NOTIFICATION_DELIVERY_POLICY_KEY,
      'Notification delivery policy (APP4-G01).',
    );
    await policies.publishVersion({
      configKey: NOTIFICATION_DELIVERY_POLICY_KEY,
      value,
      valueSchemaVersion: NOTIFICATION_DELIVERY_POLICY_SCHEMA_VERSION,
      effectiveFrom: new Date(),
      createdByAdminId: adminId,
      reason: 'APP4-W01 integration fixture.',
    });
  });
  await reloadDeliveryPolicy(context);
}

export interface SeededDelivery {
  readonly intentId: string;
  readonly outboxEventId: bigint;
  readonly envelope: DeliveryEnvelope;
}

export interface SeedOptions {
  readonly channel?: string;
  readonly secret: string;
  readonly secretKind?: DeliveryPayload['secretKind'];
  /**
   * The landing a `SECURE_LINK_TOKEN` names (`APP12-S03-C1`).
   *
   * Defaults to `REQUEST_ACCESS` for a secure link, so every case written
   * before landings existed keeps sealing the envelope it always sealed. Pass
   * `null` to seal a link with **no** landing — the shape an `APP4-B08` replay
   * of pre-correction ciphertext produces.
   */
  readonly secureLinkLanding?: DeliveryPayload['secureLinkLanding'] | null;
  readonly issuedAt?: Date;
  readonly expiresAt?: Date;
  /** Overrides the ciphertext's lineage id, as an `APP4-B08` replay would. */
  readonly originIntentId?: string;
  /** Replaces the sealed envelope, for the tamper suite. */
  readonly envelope?: DeliveryEnvelope;
  readonly status?: string;
  /** Seeds the intent alone, with no delivery event. */
  readonly skipEvent?: boolean;
}

/**
 * Seals a payload the way the delivered codec does — except that it will also
 * seal one the codec now refuses.
 *
 * Test-only, and it exists for exactly one case: an envelope sealed **before**
 * `APP12-S03-C1` added the landing. `sealDeliveryEnvelope` cannot produce one
 * any more, and it must not be able to; but an `APP4-B08` manual replay copies
 * historical ciphertext byte-identically, so the worker still has to meet one.
 * Reproducing the old seal is the only way to prove what it does when it does.
 *
 * Everything else routes through the delivered codec, so this reimplements no
 * behaviour under test — only the absence of one check.
 */
function sealForTest(key: EnvelopeKey, payload: DeliveryPayload): DeliveryEnvelope {
  if (payload.secretKind !== 'SECURE_LINK_TOKEN' || payload.secureLinkLanding !== undefined) {
    return sealDeliveryEnvelope(key, payload);
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key.bytes, iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), 'utf8'),
    cipher.final(),
  ]);
  return {
    version: DELIVERY_ENVELOPE_VERSION,
    algorithm: DELIVERY_ENVELOPE_ALGORITHM,
    iv: iv.toString('base64url'),
    ciphertext: ciphertext.toString('base64url'),
    authTag: cipher.getAuthTag().toString('base64url'),
  };
}

/** Seeds one B01-shaped intent and its delivery event. */
export async function seedDelivery(
  context: NotificationWorkerContext,
  options: SeedOptions,
): Promise<SeededDelivery> {
  const intentId = newId();
  const channel = options.channel ?? 'EMAIL';
  const issuedAt = options.issuedAt ?? new Date();
  const expiresAt = options.expiresAt ?? new Date(Date.now() + 600_000);

  await executeRaw(
    context.disposable.client.db,
    sql`
      INSERT INTO notification_intents
        (id, intent_key, template_key, template_version, channel, recipient_masked,
         params, status, correlation_id)
      VALUES (
        ${intentId}, ${`w01:${intentId}`}, 'verification.code', 1, ${channel},
        'r***@example.com', ${JSON.stringify({ challengeId: intentId })}::jsonb,
        ${options.status ?? 'PENDING'}, ${`corr-${intentId}`}
      )
    `,
  );

  const secretKind = options.secretKind ?? 'VERIFICATION_CODE';
  // `??` would be wrong here: `null` is the deliberate 'seal it without a
  // landing' request, and `??` treats it as absent.
  const landing =
    secretKind === 'SECURE_LINK_TOKEN' && options.secureLinkLanding === undefined
      ? 'REQUEST_ACCESS'
      : secretKind === 'SECURE_LINK_TOKEN'
        ? options.secureLinkLanding
        : undefined;

  const envelope =
    options.envelope ??
    sealForTest(context.envelopeKey, {
      secretKind,
      originNotificationIntentId: options.originIntentId ?? intentId,
      channel,
      normalizedRecipient: channel === 'EMAIL' ? 'recipient@example.com' : '+84900000001',
      secret: options.secret,
      ...(landing === null || landing === undefined ? {} : { secureLinkLanding: landing }),
      issuedAt: issuedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    });

  if (options.skipEvent === true) {
    return { intentId, outboxEventId: 0n, envelope };
  }

  const rows = await executeRaw<{ id: string }>(
    context.disposable.client.db,
    sql`
      INSERT INTO outbox_events
        (event_type, aggregate_kind, aggregate_id, payload, payload_schema_version,
         status, attempt_count, next_attempt_at)
      VALUES (
        ${NOTIFICATION_DELIVERY_EVENT_TYPE}, 'NOTIFICATION_INTENT', ${intentId},
        ${JSON.stringify(envelope)}::jsonb, 1, 'PENDING', 0, NULL
      )
      RETURNING id
    `,
  );
  const id = rows[0]?.id;
  if (id === undefined) {
    throw new Error('Seeding a delivery event returned no row.');
  }
  return { intentId, outboxEventId: BigInt(id), envelope };
}
