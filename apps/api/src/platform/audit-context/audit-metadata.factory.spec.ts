import {
  createAdminActor,
  createCustomerActor,
  createSystemActor,
} from '../actor-context/request-actor';
import {
  RequestContextService,
  RequestContextUnavailableError,
} from '../request-context/request-context.service';
import { AuditClock } from './audit-clock';
import { AuditMetadataFactory } from './audit-metadata.factory';

/** A clock that hands back one known instant, and a fresh Date each call. */
class FixedAuditClock extends AuditClock {
  constructor(private readonly iso: string) {
    super();
  }

  override now(): Date {
    return new Date(this.iso);
  }
}

const OCCURRED_AT = '2026-07-22T10:30:00.000Z';

describe('AuditMetadataFactory', () => {
  let requestContext: RequestContextService;
  let factory: AuditMetadataFactory;

  beforeEach(() => {
    requestContext = new RequestContextService();
    factory = new AuditMetadataFactory(requestContext, new FixedAuditClock(OCCURRED_AT));
  });

  it('snapshots an anonymous request', () => {
    requestContext.run({ requestId: 'r-1' }, () => {
      expect(factory.forCurrentRequest()).toEqual({
        requestId: 'r-1',
        actor: { kind: 'ANONYMOUS' },
        occurredAt: new Date(OCCURRED_AT),
      });
    });
  });

  it.each([
    ['admin', createAdminActor('adm-1')],
    ['customer', createCustomerActor('cus-1', 'grant-1')],
    ['system', createSystemActor('reservation-sweep')],
  ])('snapshots a bound %s actor', (_label, actor) => {
    requestContext.run({ requestId: 'r-2' }, () => {
      requestContext.bindActor(actor);

      expect(factory.forCurrentRequest()).toEqual({
        requestId: 'r-2',
        actor,
        occurredAt: new Date(OCCURRED_AT),
      });
    });
  });

  it('correlates by the established request ID, never a new one', () => {
    const first = requestContext.run({ requestId: 'r-3' }, () => factory.forCurrentRequest());
    const second = requestContext.run({ requestId: 'r-3' }, () => factory.forCurrentRequest());

    expect(first.requestId).toBe('r-3');
    expect(second.requestId).toBe('r-3');
  });

  it('takes the instant from the injected clock', () => {
    const clock = new AuditClock();
    const nowSpy = jest.spyOn(clock, 'now').mockReturnValue(new Date(OCCURRED_AT));
    const clockedFactory = new AuditMetadataFactory(requestContext, clock);

    const metadata = requestContext.run({ requestId: 'r-4' }, () =>
      clockedFactory.forCurrentRequest(),
    );

    expect(nowSpy).toHaveBeenCalledTimes(1);
    expect(metadata.occurredAt.toISOString()).toBe(OCCURRED_AT);
  });

  it('does not share the clock instance with the snapshot', () => {
    const clockValue = new Date(OCCURRED_AT);
    const clock = new AuditClock();
    jest.spyOn(clock, 'now').mockReturnValue(clockValue);

    const metadata = requestContext.run({ requestId: 'r-5' }, () =>
      new AuditMetadataFactory(requestContext, clock).forCurrentRequest(),
    );
    clockValue.setFullYear(1999);

    expect(metadata.occurredAt.toISOString()).toBe(OCCURRED_AT);
  });

  it('returns a frozen snapshot', () => {
    requestContext.run({ requestId: 'r-6' }, () => {
      const metadata = factory.forCurrentRequest();

      expect(Object.isFrozen(metadata)).toBe(true);
      expect(() => {
        (metadata as { requestId: string }).requestId = 'r-hijacked';
      }).toThrow(TypeError);
      expect(Object.isFrozen(metadata.actor)).toBe(true);
    });
  });

  it('carries who, when and which request — and nothing transport-shaped', () => {
    requestContext.run({ requestId: 'r-7' }, () => {
      requestContext.bindActor(createAdminActor('adm-1'));
      const metadata = factory.forCurrentRequest();

      expect(Object.keys(metadata).sort()).toEqual(['actor', 'occurredAt', 'requestId']);
      // Guards against a future field smuggling a request, header or payload in.
      expect(JSON.stringify(metadata)).not.toMatch(
        /header|cookie|authorization|token|body|query|url|ip|userAgent/i,
      );
    });
  });

  it('reflects a later binding within the same request', () => {
    requestContext.run({ requestId: 'r-8' }, () => {
      expect(factory.forCurrentRequest().actor).toEqual({ kind: 'ANONYMOUS' });
      requestContext.bindActor(createCustomerActor('cus-1'));
      expect(factory.forCurrentRequest().actor).toEqual({ kind: 'CUSTOMER', customerId: 'cus-1' });
    });
  });

  it('fails outside a request rather than inventing correlation or an actor', () => {
    expect(() => factory.forCurrentRequest()).toThrow(RequestContextUnavailableError);
  });
});
