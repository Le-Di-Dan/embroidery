/**
 * Classification and safety rules of the error mapper (DB7-CP2).
 *
 * Synthetic driver errors here; the companion integration suite proves the same
 * mapping fires for errors PostgreSQL actually raises. Both are needed: this
 * one can exercise SQLSTATEs that are awkward to provoke on demand, and it is
 * where the "nothing leaks" rules are asserted exhaustively.
 */
import { mapDatabaseError, withMappedErrors } from './map-database-error';
import { PersistenceError } from './persistence-error';
import { TransactionRequiredError } from './transaction-required-error';

/** Shaped like a `pg` DatabaseError, including the fields that must NOT be read. */
function driverError(fields: Record<string, unknown>): Error {
  return Object.assign(new Error('pg: something went wrong'), fields);
}

/** Shaped like a Drizzle wrapper: the real error hides on `cause`. */
function wrapped(inner: Error): Error {
  return new Error('Failed query: insert into "orders" ...', { cause: inner });
}

describe('mapDatabaseError', () => {
  describe('constraint catalogue', () => {
    it('maps a named business arbiter to its specific code', () => {
      const mapped = mapDatabaseError(
        driverError({ code: '23505', constraint: 'uq_orders__request' }),
      );

      expect(mapped.kind).toBe('CONFLICT');
      expect(mapped.code).toBe('ORDER_ALREADY_EXISTS_FOR_REQUEST');
      expect(mapped.replayable).toBe(false);
    });

    it('marks a duplicate idempotency claim replayable rather than failing', () => {
      const mapped = mapDatabaseError(
        driverError({ code: '23505', constraint: 'uq_idempotency_records__namespace_scope_key' }),
      );

      expect(mapped.code).toBe('IDEMPOTENCY_KEY_IN_USE');
      expect(mapped.replayable).toBe(true);
    });

    it('marks a duplicate provider event replayable', () => {
      const mapped = mapDatabaseError(
        driverError({
          code: '23505',
          constraint: 'uq_payment_provider_events__provider_key__provider_event_ref',
        }),
      );

      expect(mapped.code).toBe('PROVIDER_EVENT_ALREADY_RECORDED');
      expect(mapped.replayable).toBe(true);
    });

    it('falls back to the family rule for an uncatalogued constraint', () => {
      const mapped = mapDatabaseError(
        driverError({ code: '23505', constraint: 'uq_something_not_catalogued' }),
      );

      expect(mapped.kind).toBe('CONFLICT');
      expect(mapped.code).toBe('DUPLICATE_RESOURCE');
    });
  });

  describe('SQLSTATE families', () => {
    it.each([
      ['23505', 'CONFLICT', 'DUPLICATE_RESOURCE', false],
      ['23503', 'INVALID_REFERENCE', 'REFERENCE_NOT_FOUND', false],
      ['23514', 'INVARIANT_VIOLATION', 'VALUE_NOT_ALLOWED', false],
      ['23502', 'INVARIANT_VIOLATION', 'REQUIRED_VALUE_MISSING', false],
      ['23000', 'IMMUTABLE_EVIDENCE', 'IMMUTABLE_RECORD', false],
      ['23001', 'INVALID_REFERENCE', 'REFERENCE_IN_USE', false],
      ['55P03', 'CONCURRENT_MODIFICATION', 'RESOURCE_LOCKED', false],
      ['40001', 'RETRYABLE_TRANSACTION_FAILURE', 'TRANSIENT_CONFLICT', true],
      ['40P01', 'RETRYABLE_TRANSACTION_FAILURE', 'TRANSIENT_CONFLICT', true],
      ['57014', 'CONCURRENT_MODIFICATION', 'OPERATION_TIMED_OUT', false],
      ['25006', 'INVARIANT_VIOLATION', 'READ_ONLY_TRANSACTION', false],
      ['53300', 'DATABASE_UNAVAILABLE', 'DATABASE_UNAVAILABLE', true],
      ['3D000', 'DATABASE_UNAVAILABLE', 'DATABASE_MISCONFIGURED', true],
      ['08006', 'DATABASE_UNAVAILABLE', 'DATABASE_UNAVAILABLE', true],
      ['28P01', 'DATABASE_UNAVAILABLE', 'DATABASE_MISCONFIGURED', true],
      ['ECONNREFUSED', 'DATABASE_UNAVAILABLE', 'DATABASE_UNAVAILABLE', true],
    ])('maps %s to %s / %s', (code, kind, expectedCode, retryable) => {
      const mapped = mapDatabaseError(driverError({ code }));

      expect(mapped.kind).toBe(kind);
      expect(mapped.code).toBe(expectedCode);
      expect(mapped.retryable).toBe(retryable);
    });

    it('classifies an unrecognised SQLSTATE without inventing a meaning', () => {
      const mapped = mapDatabaseError(driverError({ code: 'XX999' }));

      expect(mapped.kind).toBe('UNKNOWN_PERSISTENCE_FAILURE');
      expect(mapped.code).toBe('PERSISTENCE_FAILURE');
    });

    it('classifies a non-driver error without inventing a meaning', () => {
      const mapped = mapDatabaseError(new TypeError('undefined is not a function'));

      expect(mapped.kind).toBe('UNKNOWN_PERSISTENCE_FAILURE');
      expect(mapped.message).toBe('The operation could not be completed.');
    });
  });

  describe('driver-error unwrapping', () => {
    it('finds the SQLSTATE through a Drizzle wrapper', () => {
      const mapped = mapDatabaseError(
        wrapped(driverError({ code: '23505', constraint: 'uq_orders__request' })),
      );

      expect(mapped.code).toBe('ORDER_ALREADY_EXISTS_FOR_REQUEST');
    });

    it('lets a forgotten-transaction programming error through unchanged', () => {
      const bug = new TransactionRequiredError('OrderRepository.createFromAcceptedQuotation');

      // Rethrows rather than returning: classifying it as a persistence failure
      // would hide the one message that names the actual mistake.
      expect(() => mapDatabaseError(bug)).toThrow(TransactionRequiredError);
      expect(() => mapDatabaseError(bug)).toThrow(/must run inside a transaction/);
    });

    it('does not re-map an already-mapped error', () => {
      const first = mapDatabaseError(
        driverError({ code: '23505', constraint: 'uq_orders__request' }),
      );
      expect(mapDatabaseError(first)).toBe(first);
    });
  });

  describe('safety', () => {
    const leaky = driverError({
      code: '23505',
      constraint: 'uq_customer_contact_points__kind_value__verified',
      table: 'customer_contact_points',
      detail: 'Key (kind, normalized_value)=(EMAIL, victim@example.com) already exists.',
      where: 'SQL statement "INSERT INTO customer_contact_points ..."',
      internalQuery: 'INSERT INTO customer_contact_points VALUES ($1, $2)',
      schema: 'public',
    });

    it('never puts DETAIL, SQL text or a row value in the message', () => {
      const mapped = mapDatabaseError(leaky, 'CustomerRepository.addContactPoint');

      expect(mapped.message).toBe('This contact is already verified for another customer.');
      expect(mapped.message).not.toContain('victim@example.com');
      expect(mapped.message).not.toContain('INSERT');
      expect(mapped.message).not.toContain('23505');
    });

    it('keeps diagnostics off any serialised form of the error', () => {
      const mapped = mapDatabaseError(leaky, 'CustomerRepository.addContactPoint');
      const serialised = JSON.stringify({ ...mapped, message: mapped.message });

      expect(serialised).not.toContain('23505');
      expect(serialised).not.toContain('uq_customer_contact_points');
      expect(serialised).not.toContain('victim@example.com');
      expect(Object.keys(mapped)).not.toContain('diagnostics');
    });

    it('still exposes diagnostics to an operator log line', () => {
      const mapped = mapDatabaseError(leaky, 'CustomerRepository.addContactPoint');
      const line = mapped.describeForLog();

      expect(line).toContain('kind=CONFLICT');
      expect(line).toContain('sqlstate=23505');
      expect(line).toContain('constraint=uq_customer_contact_points__kind_value__verified');
      expect(line).toContain('operation=CustomerRepository.addContactPoint');
      // The log line is structured, not a dump: no row values reach it either.
      expect(line).not.toContain('victim@example.com');
    });

    it('preserves the original error as `cause` for the crash log', () => {
      const mapped = mapDatabaseError(leaky);
      expect(mapped.cause).toBe(leaky);
    });
  });

  describe('withMappedErrors', () => {
    it('returns the value when the work succeeds', async () => {
      await expect(withMappedErrors('Repo.method', () => Promise.resolve(7))).resolves.toBe(7);
    });

    it('maps a driver error thrown by the work', async () => {
      await expect(
        withMappedErrors('Repo.method', () =>
          Promise.reject(driverError({ code: '23503', constraint: 'fk_orders__request' })),
        ),
      ).rejects.toBeInstanceOf(PersistenceError);
    });

    it('labels the mapped error with the operation', async () => {
      const error = await withMappedErrors('Repo.method', () =>
        Promise.reject(driverError({ code: '23503' })),
      ).catch((thrown: unknown) => thrown as PersistenceError);

      expect(error.diagnostics.operation).toBe('Repo.method');
    });
  });
});
