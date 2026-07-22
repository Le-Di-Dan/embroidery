import type { RequestActor } from '../actor-context/request-actor';

/**
 * The immutable who/when/which-request facts of one audited action (APP0-B04).
 *
 * It is a snapshot taken from the request context, not an audit event and not a
 * log entry: it carries no action, no target and no before/after summary,
 * because those are the use case's knowledge, not the platform's. A caller
 * combines this with them when it appends to `audit_events` — which module and
 * checkpoint own that write is unchanged by B04, and nothing here persists,
 * emits or logs anything.
 *
 * Field semantics come from `audit_events`: `requestId` is the row's
 * `correlation_id` (required on every row) and `occurredAt` is `occurred_at`.
 * `actor` may be anonymous, which the table cannot store — an unauthenticated
 * caller has no actor reference — so a writer must resolve that before
 * appending, via `RequestContextService.requireAuthenticatedActor()`.
 *
 * Nothing derived from the transport belongs here: no request or response
 * object, header, body, query, cookie, token or free-form metadata bag.
 */
export interface AuditMetadata {
  readonly requestId: string;
  readonly actor: RequestActor;
  readonly occurredAt: Date;
}
