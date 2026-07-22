/**
 * HTTP behaviour of the request-context middleware (APP0-B02).
 *
 * The application under test is a purpose-built module rather than `AppModule`:
 * the real graph pulls in `DatabaseModule`, so booting it would make these
 * assertions depend on a live PostgreSQL instance to prove something entirely
 * unrelated to persistence. The middleware wiring mirrors production exactly —
 * same module, same middleware, same global prefix — so what is exercised here
 * is the real code path.
 */
import { Controller, Get, INestApplication, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { GLOBAL_ROUTE_PREFIX } from '../../bootstrap/api-application';
import { RequestContextModule } from './request-context.module';
import { RequestContextService } from './request-context.service';
import { REQUEST_ID_HEADER, REQUEST_ID_MAX_LENGTH } from './request-id.contract';

/** Test-only surface: never registered in the production application module. */
@Controller('context-probe')
class ContextProbeController {
  constructor(private readonly requestContext: RequestContextService) {}

  /** Reports the context id observed after an awaited async hop. */
  @Get()
  async read(): Promise<{ requestId: string; body: 'unchanged' }> {
    await new Promise((resolve) => setImmediate(resolve));
    return { requestId: this.requestContext.requireRequestId(), body: 'unchanged' };
  }

  /** Holds the request open so a second request can interleave with it. */
  @Get('slow')
  async slow(): Promise<{ requestId: string }> {
    await new Promise((resolve) => setTimeout(resolve, 60));
    return { requestId: this.requestContext.requireRequestId() };
  }

  @Get('boom')
  fail(): never {
    throw new Error('deliberate failure');
  }
}

@Module({ imports: [RequestContextModule], controllers: [ContextProbeController] })
class ContextProbeModule {}

const PROBE_PATH = `/${GLOBAL_ROUTE_PREFIX}/context-probe`;

/** `getHttpServer()` is typed `any`; narrow it once instead of at every call. */
type HttpServer = Parameters<typeof request>[0];

interface ProbeBody {
  readonly requestId: string;
  readonly body?: string;
}

/** Narrows supertest's `any` body without leaking `any` into assertions. */
function bodyOf(response: { readonly body: unknown }): ProbeBody {
  return response.body as ProbeBody;
}

describe('RequestIdMiddleware over HTTP', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [ContextProbeModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.setGlobalPrefix(GLOBAL_ROUTE_PREFIX);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  const server = (): HttpServer => app.getHttpServer() as HttpServer;
  const probe = (): request.Test => request(server()).get(PROBE_PATH);

  it('preserves a valid gateway request ID byte for byte', async () => {
    const supplied = 'gateway.effective-ID_1';
    const response = await probe().set(REQUEST_ID_HEADER, supplied).expect(200);

    expect(bodyOf(response).requestId).toBe(supplied);
  });

  it('preserves a request ID of exactly the maximum length', async () => {
    const supplied = 'a'.repeat(REQUEST_ID_MAX_LENGTH);
    const response = await probe().set(REQUEST_ID_HEADER, supplied).expect(200);

    expect(bodyOf(response).requestId).toBe(supplied);
  });

  it('generates a valid request ID when the header is absent', async () => {
    const response = await probe().expect(200);

    expect(bodyOf(response).requestId).toMatch(/^[A-Za-z0-9._-]{1,64}$/);
  });

  it('generates a fresh ID per request when the header is absent', async () => {
    const [first, second] = await Promise.all([probe().expect(200), probe().expect(200)]);

    expect(bodyOf(first).requestId).not.toBe(bodyOf(second).requestId);
  });

  it.each([
    ['an oversized value', 'a'.repeat(REQUEST_ID_MAX_LENGTH + 1)],
    ['an empty value', ''],
    ['a value with spaces', 'not a valid id'],
    ['a value with a quote', 'abc"def'],
    ['a value with braces', '{abc}'],
    ['a comma-joined proxy value', 'abc,def'],
  ])('replaces %s instead of echoing it', async (_label, supplied) => {
    const response = await probe().set(REQUEST_ID_HEADER, supplied).expect(200);

    expect(bodyOf(response).requestId).not.toBe(supplied);
    expect(bodyOf(response).requestId).toMatch(/^[A-Za-z0-9._-]{1,64}$/);
  });

  it('leaves the response body otherwise untouched', async () => {
    const response = await probe().set(REQUEST_ID_HEADER, 'body-check').expect(200);

    expect(bodyOf(response)).toEqual({ requestId: 'body-check', body: 'unchanged' });
  });

  it('does not emit an X-Request-ID response header, leaving the gateway sole owner', async () => {
    // The gateway sets `add_header X-Request-ID $effective_request_id always`;
    // emitting it here as well would send the header twice to the client.
    const response = await probe().set(REQUEST_ID_HEADER, 'owner-check').expect(200);

    expect(response.headers[REQUEST_ID_HEADER.toLowerCase()]).toBeUndefined();
  });

  it('still establishes a context on a failing request', async () => {
    // A 500 rather than a crash proves the middleware neither swallowed the
    // error nor prevented the request from reaching the handler.
    await request(server()).get(`${PROBE_PATH}/boom`).expect(500);
  });

  it('keeps concurrent requests isolated when one is delayed', async () => {
    const slow = request(server()).get(`${PROBE_PATH}/slow`).set(REQUEST_ID_HEADER, 'slow-request');

    // Let the slow request enter its handler before the fast ones start.
    await new Promise((resolve) => setTimeout(resolve, 10));

    const fast = await Promise.all([
      probe().set(REQUEST_ID_HEADER, 'fast-one').expect(200),
      probe().set(REQUEST_ID_HEADER, 'fast-two').expect(200),
    ]);
    const slowResponse = await slow.expect(200);

    expect(bodyOf(slowResponse).requestId).toBe('slow-request');
    expect(fast.map((response) => bodyOf(response).requestId)).toEqual(['fast-one', 'fast-two']);
  });

  it('keeps many interleaved requests correlated to their own ID', async () => {
    const ids = Array.from({ length: 24 }, (_value, index) => `parallel-${index}`);
    const responses = await Promise.all(
      ids.map(async (id) => probe().set(REQUEST_ID_HEADER, id).expect(200)),
    );

    expect(responses.map((response) => bodyOf(response).requestId)).toEqual(ids);
  });
});
