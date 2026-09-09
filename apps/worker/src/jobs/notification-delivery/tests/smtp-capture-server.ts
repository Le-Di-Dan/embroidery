/**
 * A disposable in-process SMTP server that captures what the adapter sends
 * (`APP12-N01.B01` §13).
 *
 * The acceptance the Product Owner asked for has to cross a **real SMTP
 * protocol boundary**, not a stubbed `sendMail`. A mock proves the adapter calls
 * a function; it cannot prove the adapter negotiates a session, authenticates,
 * and produces a MIME message a server will accept — which is the part that was
 * missing from the system entirely and the part `APP12-U01` blocked on.
 *
 * So this is a genuine SMTP listener on loopback: the adapter connects over TCP,
 * speaks EHLO/AUTH/MAIL/RCPT/DATA, and the raw message is captured here as the
 * bytes that actually went over the wire.
 *
 * Test-only. Never imported by application code, and it listens on an
 * ephemeral port that dies with the test.
 */
import { SMTPServer } from 'smtp-server';

export interface CapturedMessage {
  /** Envelope recipients, as given in `RCPT TO`. */
  readonly recipients: readonly string[];
  /** Envelope sender, as given in `MAIL FROM`. */
  readonly sender: string;
  /** The full raw message, headers and body. */
  readonly raw: string;
}

export interface SmtpCaptureServer {
  readonly port: number;
  readonly messages: readonly CapturedMessage[];
  close(): Promise<void>;
}

export interface SmtpCaptureOptions {
  readonly username: string;
  readonly password: string;
  /** Reject every message with this SMTP reply code, to exercise failure paths. */
  readonly rejectWith?: number;
}

/**
 * Starts the server on an ephemeral loopback port and resolves once it listens.
 *
 * `authOptional` is false: the adapter must actually authenticate, so a
 * regression that dropped credentials would fail here rather than pass quietly.
 */
export async function startSmtpCaptureServer(
  options: SmtpCaptureOptions,
): Promise<SmtpCaptureServer> {
  const messages: CapturedMessage[] = [];

  const server = new SMTPServer({
    // Plain SMTP on loopback. The transport under test still negotiates a real
    // session; TLS is the deployment's concern and is covered by configuration,
    // not by terminating a certificate inside a unit test.
    secure: false,
    disabledCommands: ['STARTTLS'],
    authMethods: ['PLAIN', 'LOGIN'],
    onAuth(auth, _session, callback) {
      if (auth.username === options.username && auth.password === options.password) {
        callback(null, { user: auth.username });
        return;
      }
      callback(new Error('Invalid credentials'));
    },
    onData(stream, session, callback) {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => {
        if (options.rejectWith !== undefined) {
          const error = new Error('Rejected by capture server') as Error & { responseCode: number };
          error.responseCode = options.rejectWith;
          callback(error);
          return;
        }
        messages.push({
          recipients: session.envelope.rcptTo.map((r) => r.address),
          sender: session.envelope.mailFrom === false ? '' : session.envelope.mailFrom.address,
          raw: Buffer.concat(chunks).toString('utf8'),
        });
        callback();
      });
    },
  });

  const port = await new Promise<number>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.server.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('SMTP capture server did not bind a TCP port.'));
        return;
      }
      resolve(address.port);
    });
  });

  return {
    port,
    messages,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/**
 * Decodes a captured MIME part far enough to assert on its text.
 *
 * Nodemailer encodes non-ASCII bodies as quoted-printable, and the Vietnamese
 * copy this checkpoint ships is full of it — asserting on the raw wire bytes
 * would test the encoder, not the message. Soft line breaks are joined first,
 * then `=XX` escapes are decoded as UTF-8.
 */
export function decodeQuotedPrintable(raw: string): string {
  const joined = raw.replace(/=\r?\n/g, '');
  const bytes: number[] = [];
  for (let i = 0; i < joined.length; i += 1) {
    if (joined[i] === '=' && i + 2 < joined.length) {
      const hex = joined.slice(i + 1, i + 3);
      if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
        bytes.push(Number.parseInt(hex, 16));
        i += 2;
        continue;
      }
    }
    bytes.push(joined.charCodeAt(i));
  }
  return Buffer.from(bytes).toString('utf8');
}

/** The decoded body of a captured message, headers stripped. */
export function decodedBody(message: CapturedMessage): string {
  return decodeQuotedPrintable(message.raw);
}

/**
 * The `Subject:` header, decoded from RFC 2047 encoded-words.
 *
 * A header is not the body: a non-ASCII subject travels as
 * `=?UTF-8?B?…?=` or `=?UTF-8?Q?…?=`, so the body's quoted-printable decoder
 * reads it as literal punctuation. Asserting on the raw header would either fail
 * on correct output or, worse, pass on a subject that no mail client will render
 * as Vietnamese.
 *
 * Folded continuation lines are unfolded first, and adjacent encoded-words are
 * concatenated without the whitespace between them, as the RFC requires.
 */
export function decodedSubject(message: CapturedMessage): string {
  const match = /^Subject:\s*((?:.*(?:\r?\n[ \t].*)*))/im.exec(message.raw);
  if (match === null) {
    return '';
  }
  const unfolded = match[1]!.replace(/\r?\n[ \t]+/g, ' ').trim();

  let decoded = '';
  let lastWasEncoded = false;
  for (const token of unfolded.split(/(\s+)/)) {
    const word = /^=\?([^?]+)\?([BbQq])\?([^?]*)\?=$/.exec(token);
    if (word === null) {
      if (!(lastWasEncoded && token.trim() === '')) decoded += token;
      lastWasEncoded = false;
      continue;
    }
    const [, , encoding, payload] = word;
    decoded +=
      encoding!.toUpperCase() === 'B'
        ? Buffer.from(payload!, 'base64').toString('utf8')
        : decodeQuotedPrintable(payload!.replace(/_/g, ' '));
    lastWasEncoded = true;
  }
  return decoded;
}
