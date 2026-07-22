/**
 * Actor binding behaviour of the request context (APP0-B04).
 *
 * Kept beside the B02 suite rather than inside it: that file is the request-ID
 * contract's evidence and stays readable as such.
 */
import {
  ActorAlreadyBoundError,
  AuthenticatedActorRequiredError,
} from '../actor-context/actor-binding.errors';
import {
  InvalidRequestActorError,
  createAdminActor,
  createCustomerActor,
  createSystemActor,
  type AuthenticatedRequestActor,
} from '../actor-context/request-actor';
import { RequestContextService, RequestContextUnavailableError } from './request-context.service';

describe('RequestContextService actor binding', () => {
  let service: RequestContextService;

  beforeEach(() => {
    service = new RequestContextService();
  });

  it('treats an unbound request as anonymous', () => {
    service.run({ requestId: 'r-1' }, () => {
      expect(service.getActor()).toEqual({ kind: 'ANONYMOUS' });
      expect(service.requireActor()).toEqual({ kind: 'ANONYMOUS' });
      expect(service.getBoundActor()).toBeUndefined();
    });
  });

  it.each([
    ['admin', createAdminActor('adm-1')],
    ['customer', createCustomerActor('cus-1', 'grant-1')],
    ['system', createSystemActor('reservation-sweep')],
  ])('exposes a bound %s actor', (_label, actor: AuthenticatedRequestActor) => {
    service.run({ requestId: 'r-1' }, () => {
      service.bindActor(actor);

      expect(service.getActor()).toEqual(actor);
      expect(service.getBoundActor()).toEqual(actor);
      expect(service.requireAuthenticatedActor()).toEqual(actor);
    });
  });

  it('leaves the request ID untouched when an actor is bound', () => {
    service.run({ requestId: 'r-42' }, () => {
      service.bindActor(createAdminActor('adm-1'));

      expect(service.requireRequestId()).toBe('r-42');
      expect(service.get()).toEqual({ requestId: 'r-42' });
    });
  });

  it('refuses a second bind and keeps the first actor', () => {
    service.run({ requestId: 'r-1' }, () => {
      service.bindActor(createAdminActor('adm-1'));

      expect(() => service.bindActor(createCustomerActor('cus-1'))).toThrow(ActorAlreadyBoundError);
      expect(() => service.bindActor(createCustomerActor('cus-1'))).toThrow(
        /already bound.*refusing to rebind as CUSTOMER/s,
      );
      expect(service.getActor()).toEqual({ kind: 'ADMIN', adminId: 'adm-1' });
    });
  });

  it('does not name the bound identifier in the rebinding error', () => {
    service.run({ requestId: 'r-1' }, () => {
      service.bindActor(createAdminActor('adm-secret-1'));

      let message = '';
      try {
        service.bindActor(createAdminActor('adm-2'));
      } catch (error) {
        message = (error as Error).message;
      }

      expect(message).toContain('already bound');
      expect(message).not.toContain('adm-secret-1');
    });
  });

  it('rejects an invalid actor before it can occupy the single binding', () => {
    service.run({ requestId: 'r-1' }, () => {
      const invalid = { kind: 'ADMIN', adminId: '' } as AuthenticatedRequestActor;

      expect(() => service.bindActor(invalid)).toThrow(InvalidRequestActorError);
      // The failed attempt must not have consumed the bind.
      service.bindActor(createAdminActor('adm-1'));
      expect(service.getBoundActor()).toEqual({ kind: 'ADMIN', adminId: 'adm-1' });
    });
  });

  it('ignores mutation of the object the caller bound', () => {
    const source = { kind: 'CUSTOMER', customerId: 'cus-1' } as {
      kind: 'CUSTOMER';
      customerId: string;
    };

    service.run({ requestId: 'r-1' }, () => {
      service.bindActor(source);
      source.customerId = 'cus-hijacked';

      expect(service.getActor()).toEqual({ kind: 'CUSTOMER', customerId: 'cus-1' });
    });
  });

  it('returns a frozen actor that cannot be edited in place', () => {
    service.run({ requestId: 'r-1' }, () => {
      service.bindActor(createAdminActor('adm-1'));
      const actor = service.requireAuthenticatedActor();

      expect(Object.isFrozen(actor)).toBe(true);
      expect(() => {
        (actor as { adminId: string }).adminId = 'adm-2';
      }).toThrow(TypeError);
    });
  });

  it('does not expose the internal store through get()', () => {
    service.run({ requestId: 'r-1' }, () => {
      service.bindActor(createAdminActor('adm-1'));
      const context = service.get();

      expect(context).toEqual({ requestId: 'r-1' });
      expect(Object.keys(context ?? {})).toEqual(['requestId']);
      expect(Object.isFrozen(context)).toBe(true);
    });
  });

  it('rejects anonymity where an identity is required', () => {
    service.run({ requestId: 'r-1' }, () => {
      expect(() => service.requireAuthenticatedActor()).toThrow(AuthenticatedActorRequiredError);
      expect(() => service.requireAuthenticatedActor()).toThrow(/requires an authenticated actor/);
    });
  });

  it('reports no actor outside a request instead of assuming one', () => {
    expect(service.getActor()).toBeUndefined();
    expect(service.getBoundActor()).toBeUndefined();
    expect(() => service.requireActor()).toThrow(RequestContextUnavailableError);
    expect(() => service.requireAuthenticatedActor()).toThrow(RequestContextUnavailableError);
    expect(() => service.bindActor(createAdminActor('adm-1'))).toThrow(
      RequestContextUnavailableError,
    );
  });

  it('starts each context unbound, including a nested one', () => {
    service.run({ requestId: 'outer' }, () => {
      service.bindActor(createAdminActor('adm-outer'));

      service.run({ requestId: 'inner' }, () => {
        expect(service.getBoundActor()).toBeUndefined();
        service.bindActor(createCustomerActor('cus-inner'));
        expect(service.getActor()).toEqual({ kind: 'CUSTOMER', customerId: 'cus-inner' });
      });

      expect(service.getActor()).toEqual({ kind: 'ADMIN', adminId: 'adm-outer' });
    });

    expect(service.getActor()).toBeUndefined();
  });

  it('does not leak a bound actor after a callback throws', () => {
    expect(() => {
      service.run({ requestId: 'boom' }, () => {
        service.bindActor(createAdminActor('adm-1'));
        throw new Error('handler failed');
      });
    }).toThrow('handler failed');

    expect(service.getActor()).toBeUndefined();
  });

  it('isolates actors across interleaved concurrent requests', async () => {
    const observe = async (requestId: string, customerId: string, delayMs: number) =>
      service.run({ requestId }, async () => {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        service.bindActor(createCustomerActor(customerId));
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        return { requestId: service.requireRequestId(), actor: service.requireActor() };
      });

    const results = await Promise.all([
      observe('slow', 'cus-slow', 20),
      observe('medium', 'cus-medium', 10),
      observe('fast', 'cus-fast', 1),
    ]);

    expect(results).toEqual([
      { requestId: 'slow', actor: { kind: 'CUSTOMER', customerId: 'cus-slow' } },
      { requestId: 'medium', actor: { kind: 'CUSTOMER', customerId: 'cus-medium' } },
      { requestId: 'fast', actor: { kind: 'CUSTOMER', customerId: 'cus-fast' } },
    ]);
  });
});
