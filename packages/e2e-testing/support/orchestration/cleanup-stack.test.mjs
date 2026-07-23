import { describe, expect, it, jest } from '@jest/globals';

import { CleanupStack } from './cleanup-stack.mjs';

describe('CleanupStack', () => {
  it('runs steps in reverse (LIFO) order', async () => {
    const order = [];
    const stack = new CleanupStack();
    stack.push('a', () => order.push('a'));
    stack.push('b', () => order.push('b'));
    stack.push('c', () => order.push('c'));
    const failures = await stack.run();
    expect(order).toEqual(['c', 'b', 'a']);
    expect(failures).toEqual([]);
  });

  it('runs every remaining step even when one throws, aggregating failures', async () => {
    const order = [];
    const stack = new CleanupStack();
    stack.push('drop-db', () => order.push('drop-db'));
    stack.push('stop-api', () => {
      order.push('stop-api');
      throw new Error('api would not stop');
    });
    stack.push('stop-gateway', () => order.push('stop-gateway'));

    const failures = await stack.run();

    expect(order).toEqual(['stop-gateway', 'stop-api', 'drop-db']);
    expect(failures).toHaveLength(1);
    expect(failures[0].name).toBe('stop-api');
    expect(failures[0].error).toBeInstanceOf(Error);
  });

  it('is a no-op on a second run (double cleanup safety)', async () => {
    const fn = jest.fn();
    const stack = new CleanupStack();
    stack.push('once', fn);
    await stack.run();
    await stack.run();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(stack.done).toBe(true);
  });

  it('forwards failure messages to the logger without throwing', async () => {
    const logs = [];
    const stack = new CleanupStack();
    stack.push('boom', () => {
      throw new Error('kaboom');
    });
    const failures = await stack.run({ logger: (m) => logs.push(m) });
    expect(failures).toHaveLength(1);
    expect(logs.join('\n')).toContain('kaboom');
  });
});
