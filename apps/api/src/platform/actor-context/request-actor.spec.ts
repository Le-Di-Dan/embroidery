import {
  ANONYMOUS_ACTOR,
  InvalidRequestActorError,
  createAdminActor,
  createAnonymousActor,
  createCustomerActor,
  createSystemActor,
  isAuthenticatedActor,
  sanitizeAuthenticatedActor,
  type AuthenticatedRequestActor,
} from './request-actor';

describe('request actor factories', () => {
  it('creates an anonymous actor with no identifier or privilege', () => {
    const actor = createAnonymousActor();

    expect(actor).toEqual({ kind: 'ANONYMOUS' });
    expect(Object.keys(actor)).toEqual(['kind']);
    expect(Object.isFrozen(actor)).toBe(true);
    expect(actor).toBe(ANONYMOUS_ACTOR);
    expect(isAuthenticatedActor(actor)).toBe(false);
  });

  it('creates each authenticated kind with its canonical reference', () => {
    expect(createAdminActor('adm-1')).toEqual({ kind: 'ADMIN', adminId: 'adm-1' });
    expect(createCustomerActor('cus-1')).toEqual({ kind: 'CUSTOMER', customerId: 'cus-1' });
    expect(createCustomerActor('cus-1', 'grant-1')).toEqual({
      kind: 'CUSTOMER',
      customerId: 'cus-1',
      grantId: 'grant-1',
    });
    expect(createSystemActor('reservation-sweep')).toEqual({
      kind: 'SYSTEM',
      systemJobKey: 'reservation-sweep',
    });
  });

  it('freezes every constructed actor', () => {
    const actors = [
      createAdminActor('adm-1'),
      createCustomerActor('cus-1', 'grant-1'),
      createSystemActor('sweep'),
    ];

    for (const actor of actors) {
      expect(Object.isFrozen(actor)).toBe(true);
    }
  });

  it('omits an absent grant rather than storing undefined', () => {
    expect(Object.keys(createCustomerActor('cus-1'))).toEqual(['kind', 'customerId']);
  });

  it.each([
    ['admin', (): unknown => createAdminActor('')],
    ['admin blank', (): unknown => createAdminActor('   ')],
    ['customer', (): unknown => createCustomerActor('')],
    ['customer grant', (): unknown => createCustomerActor('cus-1', '  ')],
    ['system', (): unknown => createSystemActor('')],
  ])('rejects an empty identifier for %s', (_label, construct) => {
    expect(construct).toThrow(InvalidRequestActorError);
  });

  it('rejects a non-string identifier reaching it from untyped code', () => {
    const construct = (): unknown => createAdminActor(42 as unknown as string);

    expect(construct).toThrow(InvalidRequestActorError);
  });

  it('never echoes the rejected identifier', () => {
    expect(() => createSystemActor('   ')).toThrow(
      'A SYSTEM actor requires a non-empty systemJobKey.',
    );
  });
});

describe('sanitizeAuthenticatedActor', () => {
  it('returns a detached value the caller can no longer change', () => {
    const source = { kind: 'ADMIN', adminId: 'adm-1' } as { kind: 'ADMIN'; adminId: string };

    const sanitized = sanitizeAuthenticatedActor(source);
    source.adminId = 'adm-hijacked';

    expect(sanitized).toEqual({ kind: 'ADMIN', adminId: 'adm-1' });
    expect(sanitized).not.toBe(source);
  });

  it('drops credential and PII fields a caller attached', () => {
    const source = {
      kind: 'CUSTOMER',
      customerId: 'cus-1',
      grantId: 'grant-1',
      accessToken: 'sk_live_abc123',
      email: 'someone@example.com',
      roles: ['owner'],
    } as unknown as AuthenticatedRequestActor;

    expect(sanitizeAuthenticatedActor(source)).toEqual({
      kind: 'CUSTOMER',
      customerId: 'cus-1',
      grantId: 'grant-1',
    });
  });

  it('rejects an unknown kind', () => {
    const source = { kind: 'ROBOT', id: 'x' } as unknown as AuthenticatedRequestActor;

    expect(() => sanitizeAuthenticatedActor(source)).toThrow(InvalidRequestActorError);
    expect(() => sanitizeAuthenticatedActor(source)).toThrow('Unsupported actor kind: ROBOT.');
  });

  it('rejects anonymous, which is a fallback and never a binding', () => {
    const source = ANONYMOUS_ACTOR as unknown as AuthenticatedRequestActor;

    expect(() => sanitizeAuthenticatedActor(source)).toThrow('Unsupported actor kind: ANONYMOUS.');
  });

  it('rejects an authenticated kind whose reference is missing', () => {
    const source = { kind: 'SYSTEM' } as unknown as AuthenticatedRequestActor;

    expect(() => sanitizeAuthenticatedActor(source)).toThrow(InvalidRequestActorError);
  });
});
