/**
 * The provider-neutral actor a request acts as (APP0-B04).
 *
 * This is a *view* of an identity some upstream layer has already established;
 * it is never evidence that authentication happened. B04 deliberately verifies
 * nothing: no cookie, token, session or credential is read anywhere in this
 * folder, so the model stays valid whichever provider APP1 selects.
 *
 * The authenticated kinds and their identifier semantics are taken from the
 * canonical audit actor model, not invented here: `audit_events.actor_kind`
 * (`packages/database/src/schema/audit/audit-events.ts`, CST-072) and the
 * `AuditActor` write contract admit exactly `ADMIN`, `CUSTOMER` and `SYSTEM`,
 * each with its own matching reference. `ANONYMOUS` exists only in the request
 * view — it is intentionally not persistable, because an unauthenticated caller
 * has no actor reference to record.
 */

/** Actor kinds that can be recorded as an audit actor. */
export const AUTHENTICATED_ACTOR_KINDS = ['ADMIN', 'CUSTOMER', 'SYSTEM'] as const;

export type AuthenticatedActorKind = (typeof AUTHENTICATED_ACTOR_KINDS)[number];

export type RequestActorKind = 'ANONYMOUS' | AuthenticatedActorKind;

/** No identity has been established. Carries no id, role or privilege. */
export interface AnonymousActor {
  readonly kind: 'ANONYMOUS';
}

/** A staff member, referenced by `admin_accounts.id` (canonical term: admin). */
export interface AdminActor {
  readonly kind: 'ADMIN';
  readonly adminId: string;
}

/**
 * A customer, referenced by `customers.id`.
 *
 * `grantId` is the secure-access grant the action was authorised under, kept
 * because the audit contract records it alongside the customer reference. It is
 * optional: the grant is evidence, not part of the identity.
 */
export interface CustomerActor {
  readonly kind: 'CUSTOMER';
  readonly customerId: string;
  readonly grantId?: string | undefined;
}

/** An automated actor, named by its job key (no target table exists for one). */
export interface SystemActor {
  readonly kind: 'SYSTEM';
  readonly systemJobKey: string;
}

export type AuthenticatedRequestActor = AdminActor | CustomerActor | SystemActor;

export type RequestActor = AnonymousActor | AuthenticatedRequestActor;

/** Thrown when an actor value cannot be constructed from the given input. */
export class InvalidRequestActorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidRequestActorError';
  }
}

/**
 * The single anonymous value.
 *
 * One frozen instance rather than a factory that allocates: anonymity carries no
 * per-request state, and a shared constant makes an accidental mutation attempt
 * fail everywhere at once rather than in one request only.
 */
export const ANONYMOUS_ACTOR: AnonymousActor = Object.freeze({ kind: 'ANONYMOUS' });

export function createAnonymousActor(): AnonymousActor {
  return ANONYMOUS_ACTOR;
}

/** Identifiers are opaque here: only their presence is this layer's concern. */
function requireIdentifier(value: unknown, field: string, kind: RequestActorKind): string {
  if (typeof value !== 'string' || value.trim() === '') {
    // The rejected value is not echoed: it may be a mistyped credential.
    throw new InvalidRequestActorError(`A ${kind} actor requires a non-empty ${field}.`);
  }
  return value;
}

export function createAdminActor(adminId: string): AdminActor {
  return Object.freeze({ kind: 'ADMIN', adminId: requireIdentifier(adminId, 'adminId', 'ADMIN') });
}

export function createCustomerActor(customerId: string, grantId?: string): CustomerActor {
  const validCustomerId = requireIdentifier(customerId, 'customerId', 'CUSTOMER');
  if (grantId === undefined) {
    return Object.freeze({ kind: 'CUSTOMER', customerId: validCustomerId });
  }
  return Object.freeze({
    kind: 'CUSTOMER',
    customerId: validCustomerId,
    grantId: requireIdentifier(grantId, 'grantId', 'CUSTOMER'),
  });
}

export function createSystemActor(systemJobKey: string): SystemActor {
  return Object.freeze({
    kind: 'SYSTEM',
    systemJobKey: requireIdentifier(systemJobKey, 'systemJobKey', 'SYSTEM'),
  });
}

/**
 * Rebuilds an actor through its own factory.
 *
 * Rebuilding rather than validating in place is what makes the binding boundary
 * safe: the result is a fresh frozen value, so a caller holding the original
 * object can no longer change what the context reports, and any extra property
 * the caller attached — a token, a claim set, an email — is dropped instead of
 * being carried into audit metadata.
 */
export function sanitizeAuthenticatedActor(
  actor: AuthenticatedRequestActor,
): AuthenticatedRequestActor {
  switch (actor.kind) {
    case 'ADMIN':
      return createAdminActor(actor.adminId);
    case 'CUSTOMER':
      return actor.grantId === undefined
        ? createCustomerActor(actor.customerId)
        : createCustomerActor(actor.customerId, actor.grantId);
    case 'SYSTEM':
      return createSystemActor(actor.systemJobKey);
    default: {
      // Reached only when a caller bypasses the type, e.g. from plain JS or an
      // assertion. Anonymous lands here too: it is the fallback, never a bind.
      const { kind } = actor as { kind?: unknown };
      throw new InvalidRequestActorError(
        `Unsupported actor kind: ${typeof kind === 'string' ? kind : typeof kind}.`,
      );
    }
  }
}

export function isAuthenticatedActor(actor: RequestActor): actor is AuthenticatedRequestActor {
  return actor.kind !== 'ANONYMOUS';
}
