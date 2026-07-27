/**
 * Private-bucket startup bootstrap for the worker (APP2-I03).
 *
 * The worker writes derivatives, so it needs the same guarantee the API needs:
 * the private buckets exist before any work is claimed. It is the worker's
 * `WorkerStartupGate`, which is how the generic poll runtime depends on this
 * without depending on object storage.
 *
 * Failure does **not** throw out of Nest initialization. A worker whose store
 * is unreachable must stay up, report itself unready and claim nothing — the
 * same shape as the missing-policy path (APP2-I02 §12) — so an operator sees a
 * running process with a clear reason instead of a crash loop that hides it.
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ObjectStoragePort } from '@embroidery/object-storage';

import type { StartupGateResult, WorkerStartupGate } from '../runtime/startup/startup-gate';
import { OBJECT_STORAGE } from './object-storage.provider';
import {
  ObjectStorageBootstrapError,
  classifyObjectStorageBootstrapFailure,
  type ObjectStorageBootstrapErrorClass,
} from './object-storage-bootstrap.errors';

@Injectable()
export class ObjectStorageBootstrapService implements WorkerStartupGate {
  private readonly logger = new Logger('ObjectStorageBootstrap');

  /**
   * The single in-flight/settled initialization for this process.
   *
   * Memoized so two concurrent callers await the same attempt rather than
   * racing two `CreateBucket` calls. A failed attempt is cleared, so a caller
   * that runs after a supervisor restart gets a real attempt and not a cached
   * failure; nothing in this process retries on its own.
   */
  private attempt: Promise<StartupGateResult> | undefined;
  private ready = false;
  private lastErrorClass: ObjectStorageBootstrapErrorClass | undefined;

  constructor(@Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort) {}

  async ensureReady(): Promise<StartupGateResult> {
    this.attempt ??= this.run();
    return this.attempt;
  }

  /**
   * The throwing form of the same single attempt, for a caller that wants the
   * failure rather than a result (the composition smoke, and any future
   * non-gate consumer). It shares the memoized attempt — it never starts a
   * second one.
   */
  async initialize(): Promise<void> {
    const result = await this.ensureReady();
    if (!result.ok) {
      throw new ObjectStorageBootstrapError(
        this.lastErrorClass ?? 'OBJECT_STORAGE_BOOTSTRAP_INVALID_RESPONSE',
      );
    }
  }

  isReady(): boolean {
    return this.ready;
  }

  private async run(): Promise<StartupGateResult> {
    try {
      await this.storage.ensurePrivateBuckets();
      this.ready = true;
      this.lastErrorClass = undefined;
      this.logger.log('Private object-storage buckets verified (component=worker).');
      return { ok: true };
    } catch (error: unknown) {
      this.attempt = undefined;
      this.ready = false;
      const errorClass = classifyObjectStorageBootstrapFailure(error);
      this.lastErrorClass = errorClass;
      // Class only: the provider message can carry endpoint and bucket detail,
      // and the SDK error is never formatted into a line.
      this.logger.error(
        `component=worker operation=ensurePrivateBuckets ready=false error=${errorClass}`,
      );
      return { ok: false, errorClass };
    }
  }
}
