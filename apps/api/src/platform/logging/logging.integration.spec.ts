/**
 * HTTP behaviour of structured logging (APP0-B05).
 *
 * Like the B03 and B04 probes, the surface under test is declared here and
 * registered in a test-only module, never in the production graph. `AppModule`
 * is avoided for the same reason — it imports `DatabaseModule` — so the real
 * `HealthController` is included with a stubbed database health service to prove
 * its body is unchanged without a live PostgreSQL. The sink is overridden with a
 * recording implementation so records are asserted directly, with no reliance on
 * a process-global stream patch.
 */
import {
  BadRequestException,
  Controller,
  Get,
  INestApplication,
  Module,
  Param,
  Post,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DatabaseHealthService } from '@embroidery/persistence';
import request from 'supertest';

import { GLOBAL_ROUTE_PREFIX } from '../../bootstrap/api-application';
import { HealthController } from '../../modules/health/health.controller';
import { createAdminActor } from '../actor-context/request-actor';
import { HttpResponseModule } from '../http-response/http-response.module';
import { ResponseClock } from '../http-response/response-clock';
import { RequestContextModule } from '../request-context/request-context.module';
import { RequestContextService } from '../request-context/request-context.service';
import { REQUEST_ID_HEADER } from '../request-context/request-id.contract';
import { LogClock } from './log-clock';
import { LOG_SINK, type LogSink } from './log-sink';
import { PLATFORM_LOG_EVENT, type LogRecord } from './log-record';

const LEAKY =
  'connect postgres://admin:hunter2@db.internal:5432/app while SELECT * FROM customers ' +
  '(authorization: Bearer sk_live_abc123def456)';

@Controller('log-probe')
class LogProbeController {
  constructor(private readonly requestContext: RequestContextService) {}

  @Get('ok')
  ok(): { ok: boolean } {
    return { ok: true };
  }

  @Get('as-admin/:id')
  asAdmin(@Param('id') id: string): { ok: boolean } {
    this.requestContext.bindActor(createAdminActor(id));
    return { ok: true };
  }

  @Get('bad')
  bad(): never {
    throw new BadRequestException('bad input');
  }

  @Get('boom')
  boom(): never {
    throw new Error(LEAKY);
  }

  @Post('echo')
  echo(): { ok: boolean } {
    return { ok: true };
  }
}

class RecordingSink implements LogSink {
  readonly records: LogRecord[] = [];
  write(record: LogRecord): void {
    this.records.push(record);
  }
  reset(): void {
    this.records.length = 0;
  }
}

@Module({
  imports: [RequestContextModule, HttpResponseModule],
  controllers: [LogProbeController, HealthController],
  providers: [
    { provide: DatabaseHealthService, useValue: { check: (): unknown => ({ status: 'up' }) } },
  ],
})
class LogProbeModule {}

const BASE = `/${GLOBAL_ROUTE_PREFIX}`;
type HttpServer = Parameters<typeof request>[0];
const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

describe('structured logging over HTTP', () => {
  let app: INestApplication;
  const sink = new RecordingSink();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [LogProbeModule] })
      .overrideProvider(ResponseClock)
      .useValue({ nowIso: (): string => '2026-07-23T00:00:00.000Z' })
      .overrideProvider(LogClock)
      .useValue({ now: (): Date => new Date('2026-07-23T00:00:00.000Z') })
      .overrideProvider(LOG_SINK)
      .useValue(sink)
      .compile();

    app = moduleRef.createNestApplication({ logger: false });
    app.setGlobalPrefix(GLOBAL_ROUTE_PREFIX);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => sink.reset());

  const server = (): HttpServer => app.getHttpServer() as HttpServer;
  const completions = (): LogRecord[] =>
    sink.records.filter((r) => r.event === PLATFORM_LOG_EVENT.HTTP_REQUEST_COMPLETED);
  const errors = (): LogRecord[] =>
    sink.records.filter((r) => r.event === PLATFORM_LOG_EVENT.PLATFORM_ERROR);

  it('emits exactly one completion record correlated to the B02 request id', async () => {
    await request(server())
      .get(`${BASE}/log-probe/ok`)
      .set(REQUEST_ID_HEADER, 'req-ok')
      .expect(200);
    await settle();

    expect(completions()).toHaveLength(1);
    expect(completions()[0]).toMatchObject({
      level: 'info',
      event: 'http.request.completed',
      requestId: 'req-ok',
      actor: { kind: 'ANONYMOUS' },
      http: { method: 'GET', statusCode: 200 },
    });
    expect(completions()[0]?.http?.route).toContain('/api/log-probe/ok');
    expect(typeof completions()[0]?.http?.durationMs).toBe('number');
  });

  it('captures an actor bound during the handler', async () => {
    await request(server())
      .get(`${BASE}/log-probe/as-admin/adm-7`)
      .set(REQUEST_ID_HEADER, 'req-adm')
      .expect(200);
    await settle();
    expect(completions()[0]?.actor).toEqual({ kind: 'ADMIN', id: 'adm-7' });
  });

  it('logs a client error as a single warn completion with no internal error record', async () => {
    await request(server())
      .get(`${BASE}/log-probe/bad`)
      .set(REQUEST_ID_HEADER, 'req-bad')
      .expect(400);
    await settle();
    expect(completions()).toHaveLength(1);
    expect(completions()[0]?.level).toBe('warn');
    expect(errors()).toHaveLength(0);
  });

  it('logs an unknown 500 as one completion plus exactly one internal error record', async () => {
    const response = await request(server())
      .get(`${BASE}/log-probe/boom`)
      .set(REQUEST_ID_HEADER, 'req-boom')
      .expect(500);
    await settle();

    // Public response is exactly the B03 safe envelope — unchanged by logging.
    expect(response.body).toMatchObject({
      success: false,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred. Please try again later.',
    });
    expect(JSON.stringify(response.body)).not.toMatch(/hunter2|Bearer|postgres|customers/);

    expect(completions()).toHaveLength(1);
    expect(completions()[0]?.level).toBe('warn');
    expect(errors()).toHaveLength(1);
    expect(errors()[0]).toMatchObject({
      level: 'error',
      requestId: 'req-boom',
      http: { method: 'GET', statusCode: 500 },
    });
  });

  it('redacts the internal error record and never carries the raw exception', async () => {
    await request(server())
      .get(`${BASE}/log-probe/boom`)
      .set(REQUEST_ID_HEADER, 'req-red')
      .expect(500);
    await settle();
    const serialized = JSON.stringify(errors()[0]);
    expect(serialized).toContain('[REDACTED]');
    expect(serialized).not.toMatch(/hunter2|sk_live_abc123|admin:hunter2/);
  });

  it('does not log the query string', async () => {
    await request(server())
      .get(`${BASE}/log-probe/ok?secret=abc123&token=xyz`)
      .set(REQUEST_ID_HEADER, 'req-q')
      .expect(200);
    await settle();
    const serialized = JSON.stringify(sink.records);
    expect(serialized).not.toContain('secret=abc123');
    expect(serialized).not.toContain('xyz');
    expect(completions()[0]?.http?.route).not.toContain('?');
  });

  it('does not log the request body', async () => {
    await request(server())
      .post(`${BASE}/log-probe/echo`)
      .set(REQUEST_ID_HEADER, 'req-body')
      .send({ password: 'hunter2', note: 'body-marker-9271' })
      .expect(201);
    await settle();
    expect(JSON.stringify(sink.records)).not.toContain('body-marker-9271');
  });

  it('does not log authorization or cookie headers', async () => {
    await request(server())
      .get(`${BASE}/log-probe/ok`)
      .set(REQUEST_ID_HEADER, 'req-h')
      .set('Authorization', 'Bearer sk_live_header_secret')
      .set('Cookie', 'session=cookie_secret_value')
      .expect(200);
    await settle();
    const serialized = JSON.stringify(sink.records);
    expect(serialized).not.toContain('sk_live_header_secret');
    expect(serialized).not.toContain('cookie_secret_value');
  });

  it('keeps concurrent requests correlated to their own request id and actor', async () => {
    await Promise.all([
      request(server()).get(`${BASE}/log-probe/as-admin/adm-a`).set(REQUEST_ID_HEADER, 'req-a'),
      request(server()).get(`${BASE}/log-probe/ok`).set(REQUEST_ID_HEADER, 'req-b'),
      request(server()).get(`${BASE}/log-probe/as-admin/adm-c`).set(REQUEST_ID_HEADER, 'req-c'),
    ]);
    await settle();

    const byId = new Map(completions().map((r) => [r.requestId, r.actor]));
    expect(byId.get('req-a')).toEqual({ kind: 'ADMIN', id: 'adm-a' });
    expect(byId.get('req-b')).toEqual({ kind: 'ANONYMOUS' });
    expect(byId.get('req-c')).toEqual({ kind: 'ADMIN', id: 'adm-c' });
  });

  it('leaves the health liveness body unchanged and still logs its completion', async () => {
    const response = await request(server())
      .get(`${BASE}/health`)
      .set(REQUEST_ID_HEADER, 'req-health')
      .expect(200);
    await settle();
    expect(response.body).toMatchObject({ status: 'ok', service: 'api' });
    expect(completions().some((r) => r.requestId === 'req-health')).toBe(true);
  });
});
