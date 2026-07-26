/**
 * The handler registry (APP2-I02 §9).
 *
 * One handler per event type, resolved at startup. A duplicate registration
 * fails the process rather than picking a winner: two handlers for one event
 * type means half the events run the wrong code, and which half depends on
 * module load order — a defect that would only surface in production.
 *
 * The production registry is **empty in I02**. That is the correct state, not a
 * gap: I02 ships the runtime, and W01 ships the Asset handlers. An empty
 * registry makes the worker idle, and idle is safe — it claims nothing at all
 * rather than claiming work it cannot perform.
 */
import { Injectable } from '@nestjs/common';
import type { RegisteredJobType } from '@embroidery/persistence';

import type { JobHandler } from './job-handler';

@Injectable()
export class JobHandlerRegistry {
  private readonly handlers = new Map<string, JobHandler>();

  /** Registers one handler. Throws on a duplicate event type. */
  register(handler: JobHandler): void {
    if (this.handlers.has(handler.eventType)) {
      throw new Error(
        `Two handlers are registered for event type "${handler.eventType}". ` +
          'Each event type must have exactly one handler.',
      );
    }
    this.handlers.set(handler.eventType, handler);
  }

  registerAll(handlers: readonly JobHandler[]): void {
    for (const handler of handlers) {
      this.register(handler);
    }
  }

  resolve(eventType: string): JobHandler | undefined {
    return this.handlers.get(eventType);
  }

  /**
   * The claim filter: exactly the event types this deployment can handle.
   *
   * Returns `[]` for an empty registry, which the persistence seam treats as
   * "claim nothing" — never as "claim everything".
   */
  registeredTypes(): RegisteredJobType[] {
    return [...this.handlers.values()].map((handler) => ({
      eventType: handler.eventType,
      jobKind: handler.jobKind,
    }));
  }

  get size(): number {
    return this.handlers.size;
  }

  /** Test-only reset. Production registration happens once, at startup. */
  clear(): void {
    this.handlers.clear();
  }
}
