/**
 * Worker instance identity (APP2-I02 §13, FU-A07).
 *
 *     worker:{safe-hostname}:{pid}:{uuid}
 *
 * This string is written to `outbox_events.claimed_by` and is the value every
 * completion guard compares against, so it has three hard requirements: stable
 * for the life of the process (or a worker could not complete its own work),
 * unique across processes (or two workers could steal each other's leases), and
 * free of anything secret (it is stored in a table operators read).
 *
 * The hostname is sanitised rather than trusted: container hostnames are
 * usually harmless, but they are external input, and an unbounded one would
 * push the column value past anything sensible.
 */
import { hostname } from 'node:os';
import { randomUUID } from 'node:crypto';

const MAX_HOSTNAME_LENGTH = 40;
const UNKNOWN_HOST = 'unknown-host';

/** Keeps only characters that are safe in a log line and an SQL text value. */
export function safeHostname(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_HOSTNAME_LENGTH);
  return cleaned === '' ? UNKNOWN_HOST : cleaned;
}

export function buildWorkerInstanceId(host: string, pid: number, uuid: string): string {
  return `worker:${safeHostname(host)}:${String(pid)}:${uuid}`;
}

/**
 * Creates the id for this process. Called exactly once, at module construction.
 */
export function createWorkerInstanceId(): string {
  let host = UNKNOWN_HOST;
  try {
    host = hostname();
  } catch {
    // A container without a resolvable hostname is not a reason to refuse to
    // start; the pid and UUID already guarantee uniqueness.
  }
  return buildWorkerInstanceId(host, process.pid, randomUUID());
}

/**
 * The per-attempt correlation id: `{jobKind}:{outboxEventId}:{attemptNo}`.
 *
 * Deterministic from the attempt itself, so two log lines about the same
 * attempt correlate without any shared mutable state — and so a replayed
 * attempt is visibly the *same* attempt rather than a new one.
 */
export function buildCorrelationId(
  jobKind: string,
  outboxEventId: bigint,
  attemptNo: number,
): string {
  return `${jobKind}:${outboxEventId.toString()}:${String(attemptNo)}`;
}
