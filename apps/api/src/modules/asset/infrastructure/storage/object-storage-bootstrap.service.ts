/**
 * Private-bucket startup bootstrap for the API (APP2-I03).
 *
 * `@embroidery/object-storage` has owned `ensurePrivateBuckets` since APP2-I01,
 * but nothing in production ever called it: only tests did. A test calling a
 * method is not a startup contract, so a real deployment reached its first
 * upload with no bucket and failed there — in front of a customer — instead of
 * failing at startup where an orchestrator can act on it.
 *
 * This service is the API's composition-level caller. It owns no storage logic:
 * configuration parsing, client construction and the create/head algorithm all
 * stay in the package, reached through the existing `ObjectStoragePort`.
 *
 * It is deliberately **not** wired to a Nest lifecycle hook. `AppModule` is
 * constructed by three graphs that must never touch a network — the OpenAPI
 * generator, the integration harness and the module test harness — so bootstrap
 * belongs to the production startup sequence in `main.ts`, never to module
 * construction or an import side effect.
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ObjectStoragePort } from '@embroidery/object-storage';

import { OBJECT_STORAGE } from './object-storage.provider';
import {
  ObjectStorageBootstrapError,
  classifyObjectStorageBootstrapFailure,
} from './object-storage-bootstrap.errors';

@Injectable()
export class ObjectStorageBootstrapService {
  private readonly logger = new Logger('ObjectStorageBootstrap');

  /**
   * The single in-flight/settled initialization for this process.
   *
   * Memoized rather than guarded by a boolean: two concurrent callers must
   * await the *same* attempt, not race two `CreateBucket` calls against each
   * other. A rejected promise is cleared so a supervisor that retries the
   * whole startup gets a real attempt rather than a cached failure — the
   * process never retries on its own.
   */
  private attempt: Promise<void> | undefined;
  private ready = false;

  constructor(@Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort) {}

  async initialize(): Promise<void> {
    this.attempt ??= this.run();
    await this.attempt;
  }

  isReady(): boolean {
    return this.ready;
  }

  private async run(): Promise<void> {
    try {
      await this.storage.ensurePrivateBuckets();
      // Sticky for the process lifetime: the buckets cannot become un-created,
      // and re-checking on every request would put a network call in the hot
      // path for no decision anyone acts on.
      this.ready = true;
      this.logger.log('Private object-storage buckets verified (component=api).');
    } catch (error: unknown) {
      this.attempt = undefined;
      this.ready = false;
      const failure = new ObjectStorageBootstrapError(
        classifyObjectStorageBootstrapFailure(error),
        error,
      );
      // Class only. The provider's own message can carry endpoint and bucket
      // detail, and `cause` holds the SDK error for a debugger — neither is
      // ever formatted into a log line.
      this.logger.error(
        `component=api operation=ensurePrivateBuckets ready=false error=${failure.errorClass}`,
      );
      throw failure;
    }
  }
}
