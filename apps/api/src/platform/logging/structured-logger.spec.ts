import {
  ANONYMOUS_ACTOR,
  createAdminActor,
  type RequestActor,
} from '../actor-context/request-actor';
import type { RequestContextService } from '../request-context/request-context.service';
import { buildLogRecord } from './log-record.factory';
import {
  FALLBACK_LOG_EVENT,
  LOG_SCHEMA_VERSION,
  LOG_SERVICE_NAME,
  type LogRecord,
} from './log-record';
import { StdoutLogSink, type LogSink } from './log-sink';
import type { LoggingConfig } from './logging-config';
import { StructuredLogger } from './structured-logger.service';

const FIXED_TIME = new Date('2026-07-23T12:00:00.000Z');

class RecordingSink implements LogSink {
  readonly records: LogRecord[] = [];
  write(record: LogRecord): void {
    this.records.push(record);
  }
}

interface FakeContext {
  requestId?: string;
  actor?: RequestActor;
}

function fakeRequestContext(context: FakeContext): RequestContextService {
  return {
    getRequestId: (): string | undefined => context.requestId,
    getActor: (): RequestActor | undefined => context.actor,
  } as unknown as RequestContextService;
}

function makeLogger(
  context: FakeContext,
  config: LoggingConfig = { level: 'debug', stackEnabled: false },
): { logger: StructuredLogger; sink: RecordingSink } {
  const sink = new RecordingSink();
  const clock = { now: (): Date => FIXED_TIME };
  const logger = new StructuredLogger(fakeRequestContext(context), clock, sink, config);
  return { logger, sink };
}

describe('buildLogRecord', () => {
  it('sets every reserved platform field from trusted input', () => {
    const record = buildLogRecord({
      level: 'info',
      event: 'http.request.completed',
      message: 'done',
      timestamp: FIXED_TIME,
      requestId: 'req-1',
      actor: createAdminActor('adm-1'),
    });
    expect(record).toMatchObject({
      schemaVersion: LOG_SCHEMA_VERSION,
      timestamp: FIXED_TIME.toISOString(),
      level: 'info',
      service: LOG_SERVICE_NAME,
      event: 'http.request.completed',
      message: 'done',
      requestId: 'req-1',
      actor: { kind: 'ADMIN', id: 'adm-1' },
    });
  });

  it('falls back on a malformed event name rather than trusting it', () => {
    const record = buildLogRecord({
      level: 'info',
      event: 'Not An Event',
      message: 'm',
      timestamp: FIXED_TIME,
    });
    expect(record.event).toBe(FALLBACK_LOG_EVENT);
  });

  it('collapses newlines and bounds the message', () => {
    const record = buildLogRecord({
      level: 'info',
      event: 'platform.error',
      message: `line1\nline2`,
      timestamp: FIXED_TIME,
    });
    expect(record.message).toBe('line1 line2');
  });

  it('namespaces caller attributes and cannot be made to override a reserved field', () => {
    const record = buildLogRecord({
      level: 'info',
      event: 'platform.log',
      message: 'm',
      timestamp: FIXED_TIME,
      fields: { attributes: { level: 'debug', orderId: 'o-1', password: 'hunter2' } },
    });
    expect(record.level).toBe('info');
    expect(record.attributes).toEqual({ orderId: 'o-1', password: '[REDACTED]' });
  });
});

describe('StructuredLogger correlation', () => {
  it('injects request id and actor from the active context', () => {
    const { logger, sink } = makeLogger({ requestId: 'req-9', actor: createAdminActor('adm-9') });
    logger.info('http.request.completed', 'ok');
    expect(sink.records[0]).toMatchObject({
      requestId: 'req-9',
      actor: { kind: 'ADMIN', id: 'adm-9' },
    });
  });

  it('projects an anonymous actor as kind only', () => {
    const { logger, sink } = makeLogger({ requestId: 'req-a', actor: ANONYMOUS_ACTOR });
    logger.info('http.request.completed', 'ok');
    expect(sink.records[0]?.actor).toEqual({ kind: 'ANONYMOUS' });
  });

  it('omits correlation outside a request instead of inventing it', () => {
    const { logger, sink } = makeLogger({});
    logger.warn('platform.error', 'no context');
    expect(sink.records[0]?.requestId).toBeUndefined();
    expect(sink.records[0]?.actor).toBeUndefined();
  });

  it('is deterministic with a fixed clock', () => {
    const { logger, sink } = makeLogger({ requestId: 'r' });
    logger.info('platform.log', 'm');
    expect(sink.records[0]?.timestamp).toBe(FIXED_TIME.toISOString());
  });
});

describe('StructuredLogger level filtering', () => {
  it('drops records below the configured threshold', () => {
    const { logger, sink } = makeLogger({}, { level: 'warn', stackEnabled: false });
    logger.debug('platform.log', 'debug');
    logger.info('platform.log', 'info');
    logger.warn('platform.error', 'warn');
    logger.error('platform.error', 'error');
    expect(sink.records.map((r) => r.level)).toEqual(['warn', 'error']);
  });
});

describe('StdoutLogSink', () => {
  const record: LogRecord = {
    schemaVersion: LOG_SCHEMA_VERSION,
    timestamp: FIXED_TIME.toISOString(),
    level: 'info',
    service: LOG_SERVICE_NAME,
    event: 'platform.log',
    message: 'hello',
  };

  it('writes one valid JSON line to stdout for info', () => {
    const spy = jest.spyOn(process.stdout, 'write').mockReturnValue(true);
    new StdoutLogSink().write(record);
    expect(spy).toHaveBeenCalledTimes(1);
    const line = spy.mock.calls[0]?.[0] as string;
    expect(line.endsWith('\n')).toBe(true);
    expect(line).not.toContain('['); // no ANSI
    expect(() => JSON.parse(line) as unknown).not.toThrow();
    spy.mockRestore();
  });

  it('writes error records to stderr', () => {
    const spy = jest.spyOn(process.stderr, 'write').mockReturnValue(true);
    new StdoutLogSink().write({ ...record, level: 'error' });
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('falls back to a minimal valid record when serialisation fails', () => {
    const spy = jest.spyOn(process.stdout, 'write').mockReturnValue(true);
    const circular: Record<string, unknown> = {};
    circular['self'] = circular;
    new StdoutLogSink().write({ ...record, attributes: circular });
    const line = spy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(line) as { message: string };
    expect(parsed.message).toContain('could not be serialised');
    spy.mockRestore();
  });
});
