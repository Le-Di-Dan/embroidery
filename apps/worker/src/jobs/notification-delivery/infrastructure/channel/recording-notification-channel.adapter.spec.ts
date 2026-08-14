/**
 * The recording development adapter (`APP4-W01` §12).
 *
 * The claims worth proving are negative ones — that this adapter reaches
 * nothing outside the process — so the interesting assertions install spies on
 * the global network entry points and then assert they were never touched. A
 * test that only checked the happy path would pass just as happily against an
 * adapter that quietly posted to a provider on the side.
 */
import { Socket } from 'node:net';

import { RecordingNotificationChannelAdapter } from './recording-notification-channel.adapter';
import type { NotificationDelivery } from '../../domain/channel/notification-channel.port';

const ISSUED_AT = new Date('2026-08-14T09:00:00.000Z');
const EXPIRES_AT = new Date('2026-08-14T09:10:00.000Z');

function emailDelivery(overrides: Partial<NotificationDelivery> = {}): NotificationDelivery {
  return {
    channel: 'EMAIL',
    normalizedRecipient: 'recipient@example.com',
    secretKind: 'VERIFICATION_CODE',
    secret: 'synthetic-code-a',
    issuedAt: ISSUED_AT,
    expiresAt: EXPIRES_AT,
    ...overrides,
  };
}

describe('RecordingNotificationChannelAdapter', () => {
  let adapter: RecordingNotificationChannelAdapter;

  beforeEach(() => {
    adapter = new RecordingNotificationChannelAdapter();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('records one EMAIL delivery and reports success', async () => {
    const result = await adapter.send(emailDelivery());

    expect(result).toEqual({ outcome: 'SENT' });
    expect(adapter.records()).toHaveLength(1);
    expect(adapter.records()[0]).toMatchObject({
      channel: 'EMAIL',
      normalizedRecipient: 'recipient@example.com',
      secretKind: 'VERIFICATION_CODE',
    });
  });

  it('records one SMS delivery of a secure-link token', async () => {
    await adapter.send(
      emailDelivery({
        channel: 'SMS',
        normalizedRecipient: '+84900000001',
        secretKind: 'SECURE_LINK_TOKEN',
        secret: 'synthetic-token-b',
      }),
    );

    const [record] = adapter.records();
    expect(record?.channel).toBe('SMS');
    expect(record?.secretKind).toBe('SECURE_LINK_TOKEN');
    // The raw token, not a rendered URL: building the customer-visible link is
    // a later rendering boundary's, not this adapter's (`APP4-W01` §20).
    expect(record?.secret).toBe('synthetic-token-b');
    expect(record?.secret).not.toContain('http');
  });

  it('makes no external call', async () => {
    // `Socket.prototype.connect` rather than `http.request`: every outbound
    // path in Node — `http`, `https`, an SDK's own client, a raw socket —
    // funnels through it, and `http.request` is non-configurable so it cannot
    // be spied on anyway. `fetch` is watched separately because it does not.
    const connect = jest.spyOn(Socket.prototype, 'connect');
    const fetchSpy = jest.spyOn(globalThis, 'fetch');

    await adapter.send(emailDelivery());
    await adapter.send(emailDelivery({ channel: 'SMS' }));

    expect(connect).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('reports the scripted outcomes in order, then succeeds again', async () => {
    adapter.program(
      { outcome: 'FAILED', retryable: true },
      { outcome: 'FAILED', retryable: false },
    );

    expect(await adapter.send(emailDelivery())).toEqual({ outcome: 'FAILED', retryable: true });
    expect(await adapter.send(emailDelivery())).toEqual({ outcome: 'FAILED', retryable: false });
    expect(await adapter.send(emailDelivery())).toEqual({ outcome: 'SENT' });
  });

  it('records a refused delivery too, so a retry can be compared against it', async () => {
    adapter.program({ outcome: 'FAILED', retryable: true });

    await adapter.send(emailDelivery());
    await adapter.send(emailDelivery());

    expect(adapter.records()).toHaveLength(2);
    expect(adapter.records()[0]?.secret).toBe(adapter.records()[1]?.secret);
  });

  it('resets to an empty, unscripted state', async () => {
    adapter.program({ outcome: 'FAILED', retryable: true });
    await adapter.send(emailDelivery());

    adapter.reset();

    expect(adapter.records()).toHaveLength(0);
    expect(await adapter.send(emailDelivery())).toEqual({ outcome: 'SENT' });
  });
});
