import { redactString } from './log-redaction';
import type { LogErrorFields } from './log-record';

/** Longest redacted message retained on an error summary. */
const MAX_ERROR_MESSAGE_LENGTH = 1_000;

/** Longest stack retained (after redaction) when stack logging is enabled. */
const MAX_STACK_LENGTH = 4_000;

/** Most stack frames retained; a stack is for orientation, not a full dump. */
const MAX_STACK_LINES = 30;

/**
 * Builds the redacted internal-error summary for an error-level record
 * (APP0-B05).
 *
 * Internal logs may say more than the client-facing envelope, but every part is
 * still redacted: the message and each stack line pass through value redaction
 * so a connection string, bearer token or inline secret never survives. The
 * stack is bounded in both lines and characters and is included only when the
 * environment has enabled it — production defaults to no stack. The raw
 * exception object is never serialised.
 */
export function summarizeError(exception: unknown, stackEnabled: boolean): LogErrorFields {
  if (exception instanceof Error) {
    const summary: LogErrorFields = {
      name: exception.name,
      message: truncate(redactString(exception.message), MAX_ERROR_MESSAGE_LENGTH),
    };
    const code = safeCode(exception);
    const stack = stackEnabled ? safeStack(exception) : undefined;
    return {
      ...summary,
      ...(code === undefined ? {} : { code }),
      ...(stack === undefined ? {} : { stack }),
    };
  }
  // A thrown non-Error carries no reviewable structure; report only its type.
  return { name: 'NonError', message: `A non-Error value was thrown (${typeof exception}).` };
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max)}[Truncated]`;
}

/** A stable internal code, when the error exposes a safe string one. */
function safeCode(error: Error): string | undefined {
  const candidate = (error as { code?: unknown }).code;
  return typeof candidate === 'string' && candidate.length > 0 && candidate.length <= 100
    ? candidate
    : undefined;
}

function safeStack(error: Error): string | undefined {
  if (typeof error.stack !== 'string' || error.stack.length === 0) {
    return undefined;
  }
  const redacted = error.stack
    .split('\n')
    .slice(0, MAX_STACK_LINES)
    .map((line) => redactString(line))
    .join('\n');
  return truncate(redacted, MAX_STACK_LENGTH);
}
