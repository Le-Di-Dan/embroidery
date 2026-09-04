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
   * The claim filter: exactly the event types this deployment can handle
   * **right now**.
   *
   * Returns `[]` for an empty registry, which the persistence seam treats as
   * "claim nothing" — never as "claim everything".
   *
   * `APP12-H04-C1` §3 — a handler whose {@link JobClaimGate} is closed is
   * omitted. Its rows therefore stay `PENDING` and unclaimed rather than being
   * claimed and failed: an attempt spent because a deployment has not finished
   * bootstrapping is an attempt that teaches nobody anything, and three of them
   * dead-letter a customer's only credential. A handler with no gate is always
   * included, so this changes nothing for the five capabilities that have none.
   */
  registeredTypes(): RegisteredJobType[] {
    return [...this.handlers.values()]
      .filter((handler) => handler.claimGate?.ready() !== false)
      .map((handler) => ({
        eventType: handler.eventType,
        jobKind: handler.jobKind,
      }));
  }

  /**
   * Re-checks every closed claim gate.
   *
   * Called once per poll cycle by the runtime. Gates that are already open are
   * not touched, which is what keeps a live capability's configuration from
   * being reloaded underneath work already measured against it, and means the
   * ordinary steady state costs nothing.
   *
   * A gate that throws is treated as still closed: `refresh` runs on the poll
   * loop, and an unhandled rejection there would take down the loop that exists
   * to survive exactly this kind of transient failure.
   */
  async refreshClaimGates(): Promise<void> {
    for (const handler of this.handlers.values()) {
      const gate = handler.claimGate;
      if (gate === undefined || gate.ready()) {
        continue;
      }
      try {
        await gate.refresh();
      } catch {
        // Still closed. The capability stays unclaimable and nothing is lost.
      }
    }
  }

  /** The requirements currently holding capabilities back. Observability only. */
  closedGates(): { readonly jobKind: string; readonly requirement: string }[] {
    return [...this.handlers.values()]
      .filter((handler) => handler.claimGate?.ready() === false)
      .map((handler) => ({
        jobKind: handler.jobKind,
        requirement: handler.claimGate?.requirement ?? 'UNKNOWN',
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
