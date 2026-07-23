import { CleanupStack } from './cleanup-stack';

describe('CleanupStack', () => {
  it('runs actions in reverse registration order', async () => {
    const order: string[] = [];
    const stack = new CleanupStack();
    stack.push('first', () => {
      order.push('first');
    });
    stack.push('second', () => {
      order.push('second');
    });

    await stack.run();

    expect(order).toEqual(['second', 'first']);
    expect(stack.size).toBe(0);
  });

  it('awaits async actions', async () => {
    const order: string[] = [];
    const stack = new CleanupStack();
    stack.push('slow', async () => {
      await Promise.resolve();
      order.push('slow');
    });
    stack.push('fast', () => {
      order.push('fast');
    });

    await stack.run();

    expect(order).toEqual(['fast', 'slow']);
  });

  it('runs every action even when one throws, then aggregates the failures', async () => {
    const order: string[] = [];
    const stack = new CleanupStack();
    stack.push('drop-db', () => {
      order.push('drop-db');
    });
    stack.push('close-app', () => {
      throw new Error('close failed');
    });

    await expect(stack.run()).rejects.toThrow(AggregateError);
    // The database drop still ran despite the app close throwing first.
    expect(order).toEqual(['drop-db']);
  });

  it('names every failed step in the aggregate message', async () => {
    const stack = new CleanupStack();
    stack.push('drop-db', () => {
      throw new Error('drop failed');
    });
    stack.push('close-app', () => {
      throw new Error('close failed');
    });

    await stack.run().then(
      () => {
        throw new Error('expected run() to reject');
      },
      (error: unknown) => {
        expect(error).toBeInstanceOf(AggregateError);
        expect((error as AggregateError).message).toContain('close-app');
        expect((error as AggregateError).message).toContain('drop-db');
        expect((error as AggregateError).errors).toHaveLength(2);
      },
    );
  });

  it('is a no-op when empty', async () => {
    const stack = new CleanupStack();
    await expect(stack.run()).resolves.toBeUndefined();
  });
});
