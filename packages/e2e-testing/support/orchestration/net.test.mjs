import net from 'node:net';

import { afterEach, describe, expect, it } from '@jest/globals';

import { assertPortsFree, isPortFree, isPortListening, waitForPort } from './net.mjs';

const servers = [];

function listen(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    servers.push(server);
    server.listen(port, '127.0.0.1', () => resolve(server.address().port));
  });
}

afterEach(() => {
  for (const server of servers.splice(0)) {
    server.close();
  }
});

describe('net helpers', () => {
  it('detects a free port and a listening port', async () => {
    const port = await listen(0);
    expect(await isPortListening(port)).toBe(true);
    expect(await isPortFree(port)).toBe(false);
  });

  it('reports an unused high port as free', async () => {
    // Port 0 bind then close leaves it free; use a very unlikely fixed port.
    expect(await isPortFree(59_999)).toBe(true);
  });

  it('assertPortsFree throws listing the taken port', async () => {
    const port = await listen(0);
    await expect(assertPortsFree([{ port, label: 'gateway' }])).rejects.toThrow(/gateway/);
  });

  it('waitForPort resolves once a port is listening', async () => {
    const port = await listen(0);
    await expect(waitForPort(port, { timeoutMs: 2000, intervalMs: 100 })).resolves.toBeUndefined();
  });
});
