import type { LogRecord } from '../../src/platform/logging/log-record';
import type { LogSink } from '../../src/platform/logging/log-sink';

/**
 * Test `LogSink` that captures records instead of writing to the process
 * streams (APP0-B05 built the sink as an interface for exactly this). Lets an
 * integration test assert the structured completion log without monkey-patching
 * `process.stdout` and keeps test output quiet.
 */
export class RecordingLogSink implements LogSink {
  readonly records: LogRecord[] = [];

  write(record: LogRecord): void {
    this.records.push(record);
  }

  /** Records emitted for a given platform event, in order. */
  byEvent(event: string): LogRecord[] {
    return this.records.filter((record) => record.event === event);
  }
}
