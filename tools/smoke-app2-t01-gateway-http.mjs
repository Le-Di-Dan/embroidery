/**
 * `APP2-T01-C1` — the one HTTP client the production media smoke uses.
 *
 * Every request in this harness goes through the real Nginx gateway. The
 * gateway hosts resolve to the loopback edge, so the request is addressed to
 * `http://localhost` with an explicit `Host:` header: that works whether or not
 * the developer's hosts file has the entries, and it makes the routed host an
 * explicit, asserted part of each call rather than an environment accident.
 *
 * `curl` rather than `fetch` because the media scenarios need raw response
 * bytes, and because the rest of this repository's smoke harnesses already
 * drive the gateway this way.
 *
 * The route under test is anonymous, so this client has no notion of a session:
 * it cannot attach a cookie even by accident.
 */
import { execFileSync } from 'node:child_process';

export function requestArgs({ path, host, headers = {} }) {
  const args = ['-s', '-D', '-', '--output', '-', '-H', `Host: ${host}`];
  for (const [name, value] of Object.entries(headers)) {
    args.push('-H', `${name}: ${value}`);
  }
  args.push(`http://localhost${path}`);
  return args;
}

/** Splits a raw curl `-D -` response into status, headers and body bytes. */
export function parseResponse(raw) {
  let head = raw;
  let body = Buffer.alloc(0);
  const separator = raw.indexOf('\r\n\r\n');
  if (separator >= 0) {
    head = raw.subarray(0, separator);
    body = raw.subarray(separator + 4);
  }
  const [statusLine, ...headerLines] = head.toString('latin1').split('\r\n');
  const headers = {};
  for (const line of headerLines) {
    const at = line.indexOf(':');
    if (at > 0) {
      headers[line.slice(0, at).trim().toLowerCase()] = line.slice(at + 1).trim();
    }
  }
  return { status: Number(statusLine.split(' ')[1]), headers, body };
}

/** One gateway request. Returns `{ status, headers, body }`. */
export function gatewayRequest(options) {
  const raw = execFileSync('curl', requestArgs(options), {
    encoding: 'buffer',
    maxBuffer: 32 * 1024 * 1024,
  });
  return parseResponse(raw);
}

/** Parses a JSON envelope body; returns undefined for a non-JSON payload. */
export function envelopeOf(response) {
  const text = response.body.toString('utf8');
  if (text === '') return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
