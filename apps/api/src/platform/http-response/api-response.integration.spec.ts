/**
 * HTTP behaviour of the global envelope and exception filter (APP0-B03).
 *
 * The application under test is a purpose-built module rather than `AppModule`:
 * the real graph imports `DatabaseModule`, so booting it would make these
 * assertions depend on a live PostgreSQL instance to prove something unrelated
 * to persistence. Wiring mirrors production exactly — same `RequestContextModule`,
 * same `HttpResponseModule`, same global prefix.
 */
import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  INestApplication,
  Module,
  NotFoundException,
  StreamableFile,
  BadRequestException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { GLOBAL_ROUTE_PREFIX } from '../../bootstrap/api-application';
import { HealthController } from '../../modules/health/health.controller';
import { RequestContextModule } from '../request-context/request-context.module';
import { REQUEST_ID_HEADER } from '../request-context/request-id.contract';
import { SkipApiEnvelope, ApiSuccessCode, SKIP_API_ENVELOPE } from './api-envelope.decorators';
import { createSuccessEnvelope } from './api-envelope.factory';
import { API_ERROR_CODE, INTERNAL_ERROR_MESSAGE } from './api-error-code';
import { HttpResponseModule } from './http-response.module';
import { ResponseClock } from './response-clock';

/** A message packed with everything that must never reach a client. */
const LEAKY_MESSAGE =
  'connect ECONNREFUSED postgres://admin:hunter2@db.internal:5432/embroidery ' +
  'while running SELECT * FROM customers; at C:\\srv\\app\\dist\\main.js:42 ' +
  'and /var/lib/app/secrets.json (authorization: Bearer sk_live_abc123)';

/** Test-only surface: never registered in the production application module. */
@Controller('envelope-probe')
class EnvelopeProbeController {
  @Get('object')
  object(): { id: string } {
    return { id: 'abc' };
  }

  @Get('array')
  array(): number[] {
    return [1, 2, 3];
  }

  @Get('string')
  string(): string {
    return 'plain';
  }

  @Get('null')
  nothing(): null {
    return null;
  }

  @Get('coded')
  @ApiSuccessCode('PROBE_READ', 'Probe read successfully')
  coded(): { ok: boolean } {
    return { ok: true };
  }

  @Get('no-content')
  @HttpCode(HttpStatus.NO_CONTENT)
  noContent(): void {
    return undefined;
  }

  @Get('stream')
  stream(): StreamableFile {
    return new StreamableFile(Buffer.from('binary-payload'));
  }

  @Get('pre-wrapped')
  preWrapped(): unknown {
    return createSuccessEnvelope({
      data: { already: true },
      code: 'PRE_WRAPPED',
      message: 'Built by the handler',
      requestId: 'handler-supplied',
      timestamp: '2026-01-01T00:00:00.000Z',
    });
  }

  @Get('raw-body')
  @SkipApiEnvelope()
  rawBody(): { operational: true } {
    return { operational: true };
  }

  @Get('client-error')
  clientError(): never {
    throw new BadRequestException('Field is required');
  }

  @Get('not-found')
  notFound(): never {
    throw new NotFoundException();
  }

  @Get('leaky')
  leaky(): never {
    throw new Error(LEAKY_MESSAGE);
  }

  @Get('leaky-http')
  leakyHttp(): never {
    throw new BadRequestException({ message: 'Invalid input', internal: LEAKY_MESSAGE });
  }

  @Get('thrown-string')
  thrownString(): never {
    // Intentionally not an Error: the filter must sanitise non-Error throwables
    // too, which is exactly what this endpoint exists to prove.
    // eslint-disable-next-line @typescript-eslint/only-throw-error
    throw LEAKY_MESSAGE;
  }

  @Get('opted-out-error')
  @SkipApiEnvelope()
  optedOutError(): never {
    throw new Error(LEAKY_MESSAGE);
  }
}

@Module({
  imports: [RequestContextModule, HttpResponseModule],
  controllers: [EnvelopeProbeController],
})
class EnvelopeProbeModule {}

const BASE = `/${GLOBAL_ROUTE_PREFIX}/envelope-probe`;
const FIXED_TIME = '2026-07-13T00:00:00.000Z';

type HttpServer = Parameters<typeof request>[0];

interface Envelope {
  readonly success: boolean;
  readonly code: string;
  readonly message: string;
  readonly data?: unknown;
  readonly errors?: { field: string; code: string; message: string }[];
  readonly meta: { requestId: string; timestamp: string };
}

function envelopeOf(response: { readonly body: unknown }): Envelope {
  return response.body as Envelope;
}

describe('global response envelope over HTTP', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [EnvelopeProbeModule] })
      // A fixed clock lets these tests assert the exact envelope instead of
      // pattern-matching the timestamp.
      .overrideProvider(ResponseClock)
      .useValue({ nowIso: () => FIXED_TIME })
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

  describe('success wrapping', () => {
    it('wraps an object and correlates it with the request context', async () => {
      const response = await get('/object').set(REQUEST_ID_HEADER, 'req-object').expect(200);

      expect(envelopeOf(response)).toEqual({
        success: true,
        code: 'OK',
        message: 'Request completed successfully',
        data: { id: 'abc' },
        meta: { requestId: 'req-object', timestamp: FIXED_TIME },
      });
    });

    it('wraps an array without flattening it', async () => {
      const response = await get('/array').set(REQUEST_ID_HEADER, 'req-array').expect(200);

      expect(envelopeOf(response).data).toEqual([1, 2, 3]);
    });

    it('wraps a primitive', async () => {
      const response = await get('/string').set(REQUEST_ID_HEADER, 'req-string').expect(200);

      expect(envelopeOf(response).data).toBe('plain');
    });

    it('represents an empty payload as explicit null data', async () => {
      const response = await get('/null').set(REQUEST_ID_HEADER, 'req-null').expect(200);

      expect(envelopeOf(response).data).toBeNull();
      expect(envelopeOf(response).success).toBe(true);
    });

    it('uses the endpoint-declared success code', async () => {
      const response = await get('/coded').set(REQUEST_ID_HEADER, 'req-coded').expect(200);

      expect(envelopeOf(response).code).toBe('PROBE_READ');
      expect(envelopeOf(response).message).toBe('Probe read successfully');
    });
  });

  describe('non-JSON and opted-out responses', () => {
    it('leaves a 204 without a body', async () => {
      const response = await get('/no-content').expect(204);

      expect(response.text).toBe('');
      expect(response.body).toEqual({});
    });

    it('does not wrap a streamed file', async () => {
      const response = await get('/stream').expect(200);

      expect(response.body).toEqual(Buffer.from('binary-payload'));
    });

    it('does not double-wrap an envelope the handler already built', async () => {
      const response = await get('/pre-wrapped').set(REQUEST_ID_HEADER, 'req-pre').expect(200);
      const envelope = envelopeOf(response);

      expect(envelope.code).toBe('PRE_WRAPPED');
      expect(envelope.data).toEqual({ already: true });
      // The decisive assertion: `data` holds the payload, not another envelope.
      expect(envelope.data).not.toHaveProperty('success');
    });

    it('returns an opted-out body unchanged', async () => {
      const response = await get('/raw-body').expect(200);

      expect(response.body).toEqual({ operational: true });
    });

    it('exempts the real health controller', () => {
      // Asserted through the metadata the interceptor actually reads, so the
      // health contract is proven without booting the database-backed module.
      expect(new Reflector().get(SKIP_API_ENVELOPE, HealthController)).toBe(true);
    });
  });

  describe('error mapping', () => {
    it('maps a client error to the canonical envelope with its status', async () => {
      const response = await get('/client-error').set(REQUEST_ID_HEADER, 'req-400').expect(400);

      expect(envelopeOf(response)).toEqual({
        success: false,
        code: API_ERROR_CODE.BAD_REQUEST,
        message: 'Field is required',
        meta: { requestId: 'req-400', timestamp: FIXED_TIME },
      });
    });

    it('maps a not-found thrown by a handler', async () => {
      const response = await get('/not-found').set(REQUEST_ID_HEADER, 'req-404').expect(404);

      expect(envelopeOf(response).code).toBe(API_ERROR_CODE.NOT_FOUND);
    });

    it('maps an unknown route to a safe 404 envelope', async () => {
      const response = await request(server())
        .get(`/${GLOBAL_ROUTE_PREFIX}/does-not-exist`)
        .set(REQUEST_ID_HEADER, 'req-unknown-route')
        .expect(404);

      expect(envelopeOf(response).code).toBe(API_ERROR_CODE.NOT_FOUND);
      // Proves the B02 middleware covers unmatched routes too.
      expect(envelopeOf(response).meta.requestId).toBe('req-unknown-route');
    });

    it('reports an unknown failure generically', async () => {
      const response = await get('/leaky').set(REQUEST_ID_HEADER, 'req-500').expect(500);

      expect(envelopeOf(response)).toEqual({
        success: false,
        code: API_ERROR_CODE.INTERNAL_SERVER_ERROR,
        message: INTERNAL_ERROR_MESSAGE,
        meta: { requestId: 'req-500', timestamp: FIXED_TIME },
      });
    });

    it('safe-maps an error thrown from an envelope-exempt endpoint', async () => {
      // Opting out of success wrapping must not opt out of error sanitisation.
      const response = await get('/opted-out-error').expect(500);

      expect(envelopeOf(response).message).toBe(INTERNAL_ERROR_MESSAGE);
    });
  });

  describe('secret leakage', () => {
    const forbidden = [
      'postgres://',
      'hunter2',
      'db.internal',
      'SELECT * FROM',
      'C:\\srv\\app',
      '/var/lib/app',
      'sk_live_abc123',
      'ECONNREFUSED',
      'main.js:42',
    ];

    it.each([
      ['an unknown Error', '/leaky', 500],
      ['a thrown string', '/thrown-string', 500],
      ['an HttpException with an internal field', '/leaky-http', 400],
      ['an exempt endpoint', '/opted-out-error', 500],
    ])('leaks nothing from %s', async (_label, path, status) => {
      const response = await get(path).expect(status);
      const serialised = JSON.stringify(response.body);

      for (const secret of forbidden) {
        expect(serialised).not.toContain(secret);
      }
      expect(serialised).not.toContain('    at ');
      expect(serialised).not.toContain('stack');
    });
  });

  describe('correlation', () => {
    it('falls back to a generated request ID on a direct call with no header', async () => {
      const response = await get('/object').expect(200);

      expect(envelopeOf(response).meta.requestId).toMatch(/^[A-Za-z0-9._-]{1,64}$/);
    });

    it('leaves the gateway as the sole response-header owner', async () => {
      const response = await get('/object').set(REQUEST_ID_HEADER, 'req-header-owner').expect(200);

      expect(response.headers[REQUEST_ID_HEADER.toLowerCase()]).toBeUndefined();
      expect(envelopeOf(response).meta.requestId).toBe('req-header-owner');
    });

    it('keeps concurrent success and error envelopes correlated to their own request', async () => {
      const ids = Array.from({ length: 16 }, (_value, index) => `concurrent-${index}`);
      const responses = await Promise.all(
        ids.map(async (id, index) =>
          index % 2 === 0
            ? get('/object').set(REQUEST_ID_HEADER, id).expect(200)
            : get('/leaky').set(REQUEST_ID_HEADER, id).expect(500),
        ),
      );

      expect(responses.map((response) => envelopeOf(response).meta.requestId)).toEqual(ids);
    });
  });
});
