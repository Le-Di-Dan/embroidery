import { loadLoggingConfig } from './logging-config';

describe('loadLoggingConfig', () => {
  it('defaults to info and no stack in production', () => {
    expect(loadLoggingConfig({ NODE_ENV: 'production' })).toEqual({
      level: 'info',
      stackEnabled: false,
    });
  });

  it('defaults to debug and stack enabled outside production', () => {
    expect(loadLoggingConfig({ NODE_ENV: 'development' })).toEqual({
      level: 'debug',
      stackEnabled: true,
    });
  });

  it('accepts an explicit level regardless of case', () => {
    expect(loadLoggingConfig({ NODE_ENV: 'production', LOG_LEVEL: 'WARN' }).level).toBe('warn');
  });

  it('lets an operator force a stack on in production', () => {
    expect(
      loadLoggingConfig({ NODE_ENV: 'production', LOG_STACK_ENABLED: 'true' }).stackEnabled,
    ).toBe(true);
  });

  it('fails fast on an invalid level instead of falling back silently', () => {
    expect(() => loadLoggingConfig({ LOG_LEVEL: 'trace' })).toThrow(/Invalid LOG_LEVEL/);
  });

  it('fails fast on an invalid stack flag', () => {
    expect(() => loadLoggingConfig({ LOG_STACK_ENABLED: 'yes' })).toThrow(
      /Invalid LOG_STACK_ENABLED/,
    );
  });
});
