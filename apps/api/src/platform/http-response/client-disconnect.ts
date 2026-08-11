/**
 * The client-connection abort seam every private binary delivery shares.
 *
 * Introduced by `APP3-B05A` inside its own controller and lifted here by
 * `APP3-B06C`, which needs exactly the same behaviour. Two copies of a
 * connection-lifecycle rule is how one of them quietly stops matching the other
 * — and the consequence of getting it wrong is a provider connection draining
 * into a socket nobody is reading, which no test notices and every production
 * incident does.
 *
 * The guard on `writableEnded` is what makes this correct rather than noisy:
 * `close` fires on every request, including the ones that completed normally, and
 * aborting after a finished response would report healthy traffic as cancelled.
 */
import type { IncomingMessage } from 'node:http';

/** Structural response type: callers set headers without importing Express. */
export interface HeaderSettableResponse {
  setHeader(name: string, value: string): unknown;
  readonly writableEnded: boolean;
}

/** An `AbortController` tied to the client's connection. */
export function watchClientDisconnect(
  request: IncomingMessage,
  response: HeaderSettableResponse,
): AbortController {
  const controller = new AbortController();
  request.once('close', () => {
    if (!response.writableEnded) {
      controller.abort();
    }
  });
  return controller;
}
