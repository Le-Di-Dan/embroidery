import { NestFactory } from '@nestjs/core';

import { WorkerLifecycleService } from './worker-lifecycle.service';
import { WorkerModule } from './worker.module';

describe('WorkerLifecycleService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('starts a keep-alive timer on bootstrap and clears it on shutdown', () => {
    const service = new WorkerLifecycleService();
    expect(service.isRunning()).toBe(false);

    service.onApplicationBootstrap();
    expect(service.isRunning()).toBe(true);
    expect(jest.getTimerCount()).toBe(1);

    service.onApplicationShutdown('SIGTERM');
    expect(service.isRunning()).toBe(false);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('emits no periodic logs while alive', () => {
    const service = new WorkerLifecycleService();
    service.onApplicationBootstrap();

    const logSpy = jest.spyOn(
      (service as unknown as { logger: { log: (message: string) => void } }).logger,
      'log',
    );
    const debugSpy = jest.spyOn(
      (service as unknown as { logger: { debug: (message: string) => void } }).logger,
      'debug',
    );

    // Advance far past several keep-alive intervals: the timer must stay silent.
    jest.advanceTimersByTime(10 * 60_000);
    expect(logSpy).not.toHaveBeenCalled();
    expect(debugSpy).not.toHaveBeenCalled();

    service.onApplicationShutdown();
  });

  it('survives repeated shutdown calls', () => {
    const service = new WorkerLifecycleService();
    service.onApplicationBootstrap();
    service.onApplicationShutdown();
    expect(() => service.onApplicationShutdown()).not.toThrow();
    expect(service.isRunning()).toBe(false);
  });
});

describe('worker application context', () => {
  it('boots and closes cleanly', async () => {
    const context = await NestFactory.createApplicationContext(WorkerModule, {
      logger: false,
    });
    const service = context.get(WorkerLifecycleService);
    expect(service.isRunning()).toBe(true);
    await context.close();
    expect(service.isRunning()).toBe(false);
  });
});
