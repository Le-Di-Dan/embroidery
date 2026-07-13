import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';

/**
 * Bootstrap-scoped keep-alive for the worker process.
 *
 * The queue/broker is an open decision (O-001), so no job consumers exist yet
 * and nothing else holds the Node.js event loop open. This service owns a
 * silent no-op timer purely to keep the process alive: it performs no work,
 * emits no periodic logs, and is not a job. Remove this service when the
 * queue/broker decision lands and real consumers keep the process alive.
 * Documented as a limitation in docs/development/LOCAL_DEVELOPMENT.md.
 */
const KEEP_ALIVE_INTERVAL_MS = 60_000;

@Injectable()
export class WorkerLifecycleService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(WorkerLifecycleService.name);
  private keepAlive: NodeJS.Timeout | undefined;

  onApplicationBootstrap(): void {
    this.keepAlive = setInterval(() => {
      // Intentional no-op: the timer exists only to hold the event loop open.
    }, KEEP_ALIVE_INTERVAL_MS);
    this.logger.log('Worker started. No job consumers registered yet (queue/broker undecided).');
  }

  onApplicationShutdown(signal?: string): void {
    if (this.keepAlive !== undefined) {
      clearInterval(this.keepAlive);
      this.keepAlive = undefined;
    }
    this.logger.log(`Worker shutting down cleanly${signal === undefined ? '' : ` (${signal})`}.`);
  }

  isRunning(): boolean {
    return this.keepAlive !== undefined;
  }
}
