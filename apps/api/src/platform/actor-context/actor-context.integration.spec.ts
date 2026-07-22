/**
 * HTTP behaviour of the actor context and audit metadata (APP0-B04).
 *
 * The binder below stands in for the authentication layer APP1 will add: it
 * proves the seam works end to end without this checkpoint choosing a provider,
 * reading a credential or shipping a route. Like the B03 probe, it is declared
 * inside the test file and registered in a test-only module, so it cannot reach
 * the production application graph.
 *
 * `AppModule` is not used for the same reason as in B03 — the real graph imports
 * `DatabaseModule` and would make these assertions need PostgreSQL.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { Controller, Get, INestApplication, Injectable, Module, Param } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { GLOBAL_ROUTE_PREFIX } from '../../bootstrap/api-application';
import { AuditContextModule } from '../audit-context/audit-context.module';
import { AuditClock } from '../audit-context/audit-clock';
import { AuditMetadataFactory } from '../audit-context/audit-metadata.factory';
import { HttpResponseModule } from '../http-response/http-response.module';
import { ResponseClock } from '../http-response/response-clock';
import { RequestContextModule } from '../request-context/request-context.module';
import { RequestContextService } from '../request-context/request-context.service';
import { REQUEST_ID_HEADER } from '../request-context/request-id.contract';
import { createAdminActor, createCustomerActor } from './request-actor';

/**
 * A stand-in application service: it is several layers below the controller and
 * receives no request argument, so what it reads can only have come through the
 * async context.
 */
@Injectable()
class ActorProbeService {
  constructor(
    private readonly requestContext: RequestContextService,
    private readonly auditMetadata: AuditMetadataFactory,
  ) {}

  async describe(): Promise<unknown> {
    // An await before the read, so a context that did not survive the async
    // boundary would fail here rather than pass by accident.
    await new Promise((resolve) => setImmediate(resolve));
    const metadata = this.auditMetadata.forCurrentRequest();

    return {
      actor: this.requestContext.requireActor(),
      audit: { ...metadata, occurredAt: metadata.occurredAt.toISOString() },
    };
  }
}

/** Test-only surface: never registered in the production application module. */
@Controller('actor-probe')
class ActorProbeController {
  constructor(
    private readonly requestContext: RequestContextService,
    private readonly probe: ActorProbeService,
  ) {}

  @Get('who-am-i')
  async whoAmI(): Promise<unknown> {
    return this.probe.describe();
  }

  @Get('as-admin/:adminId')
  async asAdmin(@Param('adminId') adminId: string): Promise<unknown> {
    this.requestContext.bindActor(createAdminActor(adminId));
    return this.probe.describe();
  }

  @Get('as-customer/:customerId')
  async asCustomer(@Param('customerId') customerId: string): Promise<unknown> {
    this.requestContext.bindActor(createCustomerActor(customerId));
    return this.probe.describe();
  }

  @Get('double-bind')
  async doubleBind(): Promise<unknown> {
    this.requestContext.bindActor(createAdminActor('adm-first'));
    this.requestContext.bindActor(createAdminActor('adm-second'));
    return this.probe.describe();
  }
}

@Module({
  imports: [RequestContextModule, AuditContextModule, HttpResponseModule],
  controllers: [ActorProbeController],
  providers: [ActorProbeService],
})
class ActorProbeModule {}

const BASE = `/${GLOBAL_ROUTE_PREFIX}/actor-probe`;
const FIXED_RESPONSE_TIME = '2026-07-13T00:00:00.000Z';
const FIXED_AUDIT_TIME = '2026-07-22T10:30:00.000Z';

type HttpServer = Parameters<typeof request>[0];

interface Envelope {
  readonly success: boolean;
  readonly code: string;
  readonly message: string;
  readonly data?: {
    readonly actor: { kind: string };
    readonly audit: { requestId: string; actor: { kind: string }; occurredAt: string };
  };
  readonly meta: { requestId: string; timestamp: string };
}

function envelopeOf(response: { readonly body: unknown }): Envelope {
  return response.body as Envelope;
}

describe('actor context over HTTP', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [ActorProbeModule] })
      .overrideProvider(ResponseClock)
      .useValue({ nowIso: (): string => FIXED_RESPONSE_TIME })
      .overrideProvider(AuditClock)
      .useValue({ now: (): Date => new Date(FIXED_AUDIT_TIME) })
      .compile();

    app = moduleRef.createNestApplication({ logger: false });
    app.setGlobalPrefix(GLOBAL_ROUTE_PREFIX);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  const server = (): HttpServer => app.getHttpServer() as HttpServer;
  const get = (path: string): request.Test => request(server()).get(`${BASE}${path}`);

  it('treats a request with no authentication as anonymous', async () => {
    const response = await get('/who-am-i').set(REQUEST_ID_HEADER, 'req-anon').expect(200);

    expect(envelopeOf(response).data).toEqual({
      actor: { kind: 'ANONYMOUS' },
      audit: {
        requestId: 'req-anon',
        actor: { kind: 'ANONYMOUS' },
        occurredAt: FIXED_AUDIT_TIME,
      },
    });
  });

  it('propagates a bound actor to a service the controller never passes it to', async () => {
    const response = await get('/as-admin/adm-1').set(REQUEST_ID_HEADER, 'req-admin').expect(200);

    expect(envelopeOf(response).data).toEqual({
      actor: { kind: 'ADMIN', adminId: 'adm-1' },
      audit: {
        requestId: 'req-admin',
        actor: { kind: 'ADMIN', adminId: 'adm-1' },
        occurredAt: FIXED_AUDIT_TIME,
      },
    });
  });

  it('leaves the envelope correlation exactly as APP0-B02/B03 established it', async () => {
    const response = await get('/as-admin/adm-1').set(REQUEST_ID_HEADER, 'req-meta').expect(200);

    expect(envelopeOf(response).meta).toEqual({
      requestId: 'req-meta',
      timestamp: FIXED_RESPONSE_TIME,
    });
  });

  it('keeps concurrent requests with different actors isolated', async () => {
    const responses = await Promise.all([
      get('/as-admin/adm-a').set(REQUEST_ID_HEADER, 'req-a'),
      get('/as-customer/cus-b').set(REQUEST_ID_HEADER, 'req-b'),
      get('/who-am-i').set(REQUEST_ID_HEADER, 'req-c'),
    ]);

    expect(responses.map((response) => envelopeOf(response).data)).toEqual([
      {
        actor: { kind: 'ADMIN', adminId: 'adm-a' },
        audit: {
          requestId: 'req-a',
          actor: { kind: 'ADMIN', adminId: 'adm-a' },
          occurredAt: FIXED_AUDIT_TIME,
        },
      },
      {
        actor: { kind: 'CUSTOMER', customerId: 'cus-b' },
        audit: {
          requestId: 'req-b',
          actor: { kind: 'CUSTOMER', customerId: 'cus-b' },
          occurredAt: FIXED_AUDIT_TIME,
        },
      },
      {
        actor: { kind: 'ANONYMOUS' },
        audit: { requestId: 'req-c', actor: { kind: 'ANONYMOUS' }, occurredAt: FIXED_AUDIT_TIME },
      },
    ]);
  });

  it('maps a rebinding attempt to a safe error that leaks no internals', async () => {
    const response = await get('/double-bind').set(REQUEST_ID_HEADER, 'req-double').expect(500);
    const envelope = envelopeOf(response);

    expect(envelope.success).toBe(false);
    expect(envelope.code).toBe('INTERNAL_SERVER_ERROR');
    expect(envelope.meta.requestId).toBe('req-double');
    expect(JSON.stringify(envelope)).not.toMatch(/adm-first|adm-second|ActorAlreadyBound|at /);
  });

  it('ships no production code path that binds an actor', () => {
    // The binder above is a test fixture. Until APP1 adds a real authentication
    // layer, nothing outside a spec may call `bindActor` — a production route
    // that did would let a client choose who it is.
    const sourceRoot = join(__dirname, '..', '..');
    const callers = productionFilesCalling(sourceRoot, 'bindActor(');

    expect(callers).toEqual([]);
  });
});

/** Recursively lists non-spec `.ts` files under `directory` containing `needle`. */
function productionFilesCalling(directory: string, needle: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return productionFilesCalling(path, needle);
    }
    if (!entry.name.endsWith('.ts') || entry.name.includes('.spec.')) {
      return [];
    }
    // The declaration itself is not a call site.
    const isDeclaringFile = entry.name === 'request-context.service.ts';
    return !isDeclaringFile && readFileSync(path, 'utf8').includes(needle) ? [path] : [];
  });
}
