/**
 * A disposable SMTP capture listener for the `APP12-N01.S01` browser acceptance.
 *
 * ## Why this exists at all
 *
 * Every earlier browser run read the verification code out of the worker's
 * **recording adapter** — an array in this process. That was the only thing
 * available: before `APP12-N01.B01` the repository had no transport, which is
 * exactly the release blocker `APP12-U01` found. `S01` §18 forbids that route
 * now, and rightly: a code taken from process memory proves the API minted one,
 * never that anything left the process. The acceptance has to show a message
 * crossing a real SMTP boundary and the browser answering with the code that was
 * *in the message*.
 *
 * So the run boots the same in-process worker it always did, but composes it
 * with `NOTIFICATION_TRANSPORT=SMTP` pointed at this listener. The worker's
 * `SmtpNotificationChannelAdapter` connects over TCP on loopback, speaks
 * EHLO/AUTH/MAIL/RCPT/DATA, and what is captured here is the bytes that went
 * over the wire.
 *
 * ## What it is not
 *
 * Not a mail server, not a relay, and not reachable from anywhere but this
 * machine: it binds `127.0.0.1` on an ephemeral port that dies with the run. It
 * never forwards, so no synthetic address can produce mail to a real inbox —
 * which is what keeps `REAL_INBOX_MANUAL` honestly `NOT_EXECUTED` rather than
 * accidentally half-done.
 *
 * The credentials it accepts are generated per run and exist only in this
 * process's memory and the worker's. Nothing here is read from `.env`, and
 * nothing is logged.
 *
 * Test-only.
 */
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';

/**
 * `smtp-server` is declared by `apps/worker`, which owns the SMTP boundary.
 *
 * Resolved from there rather than added to this harness's manifest, for the
 * reason the image modes already record: pnpm's isolated `node_modules` gives no
 * hoist, and a second declaration of a protocol library is the drift a single
 * owner exists to prevent.
 */
function requireFromWorker(repoRoot, specifier) {
  return createRequire(join(repoRoot, 'apps', 'worker', 'package.json'))(specifier);
}

/** A per-run credential pair. Never printed, never persisted, never reused. */
function generateCredentials() {
  return {
    username: `n01s1-${randomBytes(4).toString('hex')}`,
    password: randomBytes(24).toString('base64url'),
  };
}

/**
 * Decodes the quoted-printable text part enough to read a six-digit code.
 *
 * Nodemailer encodes the plain-text alternative as quoted-printable, which
 * leaves ASCII digits literal but folds long lines with a trailing `=`. Undoing
 * the soft breaks is all that is needed for a code that sits alone on its own
 * line; nothing here tries to be a MIME parser, and a message it cannot read
 * yields `undefined` rather than a guess.
 */
function unfoldQuotedPrintable(raw) {
  return raw.replace(/=\r?\n/g, '');
}

/**
 * The six-digit code carried by one captured message.
 *
 * The renderer puts the code on a line of its own, so an anchored six-digit
 * match over the body is unambiguous — and deliberately restricted to the body,
 * because a `Message-ID` or a boundary marker is full of digits.
 *
 * The returned value is a secret. Callers type it into a field and compare it
 * with nothing; it is never logged, attached, or passed to a matcher that would
 * print its operand on failure.
 */
export function codeFromMessage(message) {
  const body = unfoldQuotedPrintable(message.raw);
  const separator = body.indexOf('\r\n\r\n');
  const withoutTopHeaders = separator === -1 ? body : body.slice(separator + 4);
  const match = /^\s*(\d{6})\s*$/m.exec(withoutTopHeaders);
  return match?.[1];
}

/**
 * Starts the listener and resolves once it is accepting connections.
 *
 * `authOptional` is false on purpose: the adapter must actually authenticate, so
 * a regression that dropped the credential fails here loudly instead of
 * delivering anonymously and passing.
 *
 * @param {{ repoRoot: string }} params
 */
export async function startSmtpCapture({ repoRoot }) {
  const { SMTPServer } = requireFromWorker(repoRoot, 'smtp-server');
  const credentials = generateCredentials();
  /** @type {Array<{ recipients: string[], sender: string, raw: string, receivedAt: number }>} */
  const messages = [];

  const server = new SMTPServer({
    // Plain SMTP on loopback. The transport under test still negotiates a real
    // session; TLS termination is a deployment concern, proved by configuration
    // rather than by issuing a certificate to a throwaway listener.
    secure: false,
    disabledCommands: ['STARTTLS'],
    authMethods: ['PLAIN', 'LOGIN'],
    onAuth(auth, _session, callback) {
      if (auth.username === credentials.username && auth.password === credentials.password) {
        callback(null, { user: auth.username });
        return;
      }
      callback(new Error('Invalid credentials'));
    },
    onData(stream, session, callback) {
      const chunks = [];
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('end', () => {
        messages.push({
          recipients: session.envelope.rcptTo.map((recipient) => recipient.address),
          sender: session.envelope.mailFrom === false ? '' : session.envelope.mailFrom.address,
          raw: Buffer.concat(chunks).toString('utf8'),
          receivedAt: Date.now(),
        });
        callback();
      });
    },
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(undefined));
  });

  const port = server.server.address().port;

  return {
    port,

    /**
     * The environment a worker must be composed with to deliver here.
     *
     * `SMTP_REQUIRE_TLS=false` is the one place that value is acceptable, and
     * the loader agrees: it refuses the combination outright when `NODE_ENV` is
     * a delivering environment, so this cannot be copied into staging or
     * production and quietly work.
     */
    workerEnv: () => ({
      NOTIFICATION_TRANSPORT: 'SMTP',
      SMTP_HOST: '127.0.0.1',
      SMTP_PORT: String(port),
      SMTP_SECURE: 'false',
      SMTP_REQUIRE_TLS: 'false',
      SMTP_USERNAME: credentials.username,
      SMTP_PASSWORD: credentials.password,
      EMAIL_FROM_ADDRESS: 'no-reply@vidu.test',
      EMAIL_FROM_NAME: 'Xưởng thêu',
    }),

    /** How many messages this listener has accepted. Never their contents. */
    count: () => messages.length,

    /**
     * The six-digit code one captured message carries, or `undefined`.
     *
     * Exposed on the handle as well as at module scope so a caller holds one
     * object rather than two imports — and so the secret path has exactly one
     * name a reviewer can search for.
     */
    codeOf: codeFromMessage,

    /** Every message accepted for one envelope recipient, oldest first. */
    messagesFor: (address) =>
      messages.filter((message) =>
        message.recipients.some((recipient) => recipient.toLowerCase() === address.toLowerCase()),
      ),

    /**
     * Safe facts about one message: everything except what it carries.
     *
     * `hasCode` is a boolean rather than the code, so a report or a failure
     * message can describe the delivery without ever holding the secret.
     */
    safeMessage: (message) => ({
      recipientCount: message.recipients.length,
      sender: message.sender,
      byteLength: Buffer.byteLength(message.raw, 'utf8'),
      hasSubject: /^Subject:/m.test(message.raw),
      hasTextPart: message.raw.includes('text/plain'),
      hasHtmlPart: message.raw.includes('text/html'),
      hasCode: codeFromMessage(message) !== undefined,
    }),

    close: () =>
      new Promise((resolve) => {
        server.close(() => resolve(undefined));
      }),
  };
}
