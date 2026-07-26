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
    // Obtain a genuinely-free port by binding ephemeral port 0 and releasing it,
    // then assert isPortFree reports it free. A hard-coded high port is not
    // reliable: the OS may reserve it (e.g. Hyper-V/WSL/Docker dynamic-port
    // exclusion ranges), making listen() fail even with nothing listening.
    const port = await new Promise((resolve) => {
      const probe = net.createServer();
      probe.listen(0, '127.0.0.1', () => {
        const assigned = probe.address().port;
        probe.close(() => resolve(assigned));
      });
    });
    expect(await isPortFree(port)).toBe(true);
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
