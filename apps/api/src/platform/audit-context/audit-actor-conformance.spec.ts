/**
 * Drift guard between the platform actor view and the canonical audit actor.
 *
 * The audit write contract (`AuditActor`, owned by the audit module and shaped
 * by `audit_events` CST-072) is the source of truth for who may be recorded.
 * The platform actor model must stay assignable to it, or APP1 would have to
 * translate between two competing actor vocabularies at every audit write.
 *
 * The import is type-only and one-directional on purpose: platform code must not
 * depend on a business module at runtime, and nothing here is compiled into the
 * application. If the canonical contract gains or renames a kind, this file
 * stops type-checking — which is the point.
 */
import type { AuditActor } from '../../modules/audit/domain/repositories/audit-event.repository';
import {
  AUTHENTICATED_ACTOR_KINDS,
  createAdminActor,
  createCustomerActor,
  createSystemActor,
  type AuthenticatedRequestActor,
} from '../actor-context/request-actor';

describe('platform actor conformance with the canonical audit actor', () => {
  it('accepts every authenticated request actor as an audit actor', () => {
    const actors: AuthenticatedRequestActor[] = [
      createAdminActor('adm-1'),
      createCustomerActor('cus-1'),
      createCustomerActor('cus-1', 'grant-1'),
      createSystemActor('reservation-sweep'),
    ];

    // The assignment is the assertion: it fails to compile on any divergence.
    const auditActors: AuditActor[] = actors;

    expect(auditActors).toHaveLength(4);
  });

  it('mirrors the canonical actor kinds exactly', () => {
    const canonicalKinds: AuditActor['kind'][] = ['ADMIN', 'CUSTOMER', 'SYSTEM'];

    expect([...AUTHENTICATED_ACTOR_KINDS].sort()).toEqual([...canonicalKinds].sort());
  });

  it('keeps anonymity out of the persistable set', () => {
    const persistable: string[] = [...AUTHENTICATED_ACTOR_KINDS];

    expect(persistable).not.toContain('ANONYMOUS');
  });
});
