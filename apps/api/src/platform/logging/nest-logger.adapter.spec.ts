import { PLATFORM_LOG_EVENT } from './log-record';
import type { LogRecordFields } from './log-record.factory';
import type { LoggingConfig } from './logging-config';
import { NestLoggerAdapter } from './nest-logger.adapter';
import type { StructuredLogger } from './structured-logger.service';

interface Call {
  method: 'debug' | 'info' | 'warn' | 'error';
  event: string;
  message: string;
  fields?: LogRecordFields | undefined;
}

function makeAdapter(config: LoggingConfig): { adapter: NestLoggerAdapter; calls: Call[] } {
  const calls: Call[] = [];
  const record =
    (method: Call['method']) =>
    (event: string, message: string, fields?: LogRecordFields): void => {
      calls.push({ method, event, message, fields });
    };
  const logger = {
    debug: record('debug'),
    info: record('info'),
    warn: record('warn'),
    error: record('error'),
  } as unknown as StructuredLogger;
  return { adapter: new NestLoggerAdapter(logger, config), calls };
}

const STACK_ON: LoggingConfig = { level: 'debug', stackEnabled: true };
const STACK_OFF: LoggingConfig = { level: 'debug', stackEnabled: false };

describe('NestLoggerAdapter', () => {
  it('maps log/warn/debug/verbose/fatal onto platform levels with context', () => {
    const { adapter, calls } = makeAdapter(STACK_OFF);
    adapter.log('routes mapped', 'RoutesResolver');
    adapter.warn('slow', 'Bootstrap');
    adapter.debug('detail', 'Ctx');
    adapter.verbose('trace-level', 'Ctx');
    adapter.fatal('down', 'Ctx');
    expect(calls.map((c) => c.method)).toEqual(['info', 'warn', 'debug', 'debug', 'error']);
    expect(calls[0]).toMatchObject({
      event: PLATFORM_LOG_EVENT.APPLICATION_LOG,
      message: 'routes mapped',
      fields: { context: 'RoutesResolver' },
    });
    expect(calls[4]?.event).toBe(PLATFORM_LOG_EVENT.PLATFORM_ERROR);
  });

  it('includes a redacted trace only when stack logging is enabled', () => {
    const { adapter, calls } = makeAdapter(STACK_ON);
    adapter.error('boom', 'Error: boom\n    at db (postgres://u:p@h/db)', 'Ctx');
    const attributes = calls[0]?.fields?.attributes;
    expect(attributes?.['trace']).toContain('at db');
  });

  it('omits the trace when stack logging is disabled', () => {
    const { adapter, calls } = makeAdapter(STACK_OFF);
    adapter.error('boom', 'Error: boom\n    at secret', 'Ctx');
    expect(calls[0]?.fields?.attributes).toBeUndefined();
  });

  it('never dumps a non-string message raw', () => {
    const { adapter, calls } = makeAdapter(STACK_OFF);
    adapter.log({ secret: 'x' });
    expect(calls[0]?.message).toBe('[object]');
  });
});
