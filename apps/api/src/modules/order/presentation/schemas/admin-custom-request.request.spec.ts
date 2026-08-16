/**
 * Filter-parsing proof for the Admin queue query (`APP5-B04` §15.1).
 *
 * The schema is where an operator's typed filter becomes a database predicate,
 * so the cases that matter are the ones where a lenient parse would silently
 * change what is being asked.
 */
import { listAdminCustomRequestsQuerySchema } from './admin-custom-request.request';

function parse(
  query: Record<string, unknown>,
): ReturnType<typeof listAdminCustomRequestsQuerySchema.safeParse> {
  return listAdminCustomRequestsQuerySchema.safeParse(query);
}

describe('listAdminCustomRequestsQuerySchema', () => {
  it('accepts an empty query — the queue has a default, not a required filter', () => {
    const result = parse({});
    expect(result.success).toBe(true);
  });

  it('normalizes a single repeated status into an array', () => {
    // Express hands a lone `?status=NEW` over as a string and a repeated one as
    // an array; both have to reach the query as a list.
    const single = parse({ status: 'NEW' });
    expect(single.success && single.data.status).toEqual(['NEW']);

    const many = parse({ status: ['NEW', 'REJECTED'] });
    expect(many.success && many.data.status).toEqual(['NEW', 'REJECTED']);
  });

  it('refuses a status outside the canonical vocabulary', () => {
    expect(parse({ status: 'ARCHIVED' }).success).toBe(false);
  });

  it('uppercases a request code and matches it whole', () => {
    const result = parse({ code: ' req-7k3mpq2xvd ' });
    expect(result.success && result.data.code).toBe('REQ-7K3MPQ2XVD');
  });

  it('refuses a partial request code rather than turning it into a prefix search', () => {
    expect(parse({ code: 'REQ-7K3' }).success).toBe(false);
    expect(parse({ code: '7K3MPQ2XVD' }).success).toBe(false);
  });

  it('requires both halves of the contact filter or neither', () => {
    expect(parse({ contactKind: 'EMAIL' }).success).toBe(false);
    expect(parse({ contact: 'bay@vidu.test' }).success).toBe(false);
    expect(parse({ contactKind: 'EMAIL', contact: 'bay@vidu.test' }).success).toBe(true);
  });

  it('refuses an inverted submitted range', () => {
    expect(
      parse({
        submittedFrom: '2026-08-16T10:00:00.000Z',
        submittedTo: '2026-08-16T09:00:00.000Z',
      }).success,
    ).toBe(false);
    expect(
      parse({
        submittedFrom: '2026-08-16T09:00:00.000Z',
        submittedTo: '2026-08-16T10:00:00.000Z',
      }).success,
    ).toBe(true);
  });

  it('coerces limit from its string query form and bounds it', () => {
    const result = parse({ limit: '25' });
    expect(result.success && result.data.limit).toBe(25);
    expect(parse({ limit: '0' }).success).toBe(false);
    expect(parse({ limit: '101' }).success).toBe(false);
  });

  it('rejects an unknown parameter instead of dropping it', () => {
    // A dropped filter is worse than a refused one: the operator would believe
    // the page was narrowed when it was not.
    expect(parse({ customerId: '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6072' }).success).toBe(false);
    expect(parse({ sort: 'oldest' }).success).toBe(false);
  });
});
