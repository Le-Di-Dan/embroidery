/**
 * The pure queue model: filters on the wire, status presentation, the row
 * projection and keyset accumulation (`APP5-A01`).
 *
 * These are the assertions that decide whether the screen tells the truth:
 *
 *  - the default status filter sends **nothing**, so `APP5-B04` stays the
 *    authority on what "cần xử lý" means and the screen cannot drift from it;
 *  - a canonical state the queue offers no action in still gets its real name,
 *    and a state the contract does not define never reaches an operator as a
 *    raw token;
 *  - the row projection carries no `customerId` at all and keeps `requestId`
 *    only as an address;
 *  - a cursor is a continuation only when `hasNext` *and* a usable cursor agree.
 */
import {
  ALL_FILTER_VALUE,
  DEFAULT_QUEUE_FILTERS,
  isAnyQueueFilterActive,
  normalizeQueueFilters,
  QUEUE_STATUS_FILTER_OPTIONS,
  QUEUE_SUBJECT_FILTER_OPTIONS,
  toQueueFilterSearchString,
  toQueueListParams,
  TRIAGE_FILTER_VALUE,
} from '../../src/features/custom-request-queue/model/custom-request-queue-filters';
import {
  appliedScopeLabels,
  presentStatus,
  subjectKindLabel,
} from '../../src/features/custom-request-queue/model/custom-request-presentation';
import {
  flattenQueuePages,
  resolveNextCursor,
  toQueueRow,
} from '../../src/features/custom-request-queue/model/custom-request-queue-rows';
import { CUSTOM_REQUEST_QUEUE_COPY } from '../../src/features/custom-request-queue/model/custom-request-queue-copy';
import { customRequestQueueKeys } from '../../src/features/custom-request-queue/model/custom-request-queue-keys';
import {
  CUSTOMER_ID,
  makeQueueItem,
  makeQueuePage,
  REQUEST_NEW_ID,
  REQUEST_QUOTED_ID,
} from '../support/custom-request-fixture';

describe('filter serialization', () => {
  it('sends no status at all by default, leaving the triage set to the server', () => {
    expect(toQueueListParams(DEFAULT_QUEUE_FILTERS)).toEqual({});
  });

  it('sends one explicit status as the contract’s repeatable array', () => {
    expect(
      toQueueListParams({ status: 'NEEDS_CLARIFICATION', subjectKind: ALL_FILTER_VALUE }),
    ).toEqual({
      status: ['NEEDS_CLARIFICATION'],
    });
  });

  it('sends a subject kind only when one is chosen', () => {
    expect(
      toQueueListParams({ status: TRIAGE_FILTER_VALUE, subjectKind: 'CUSTOMER_OWNED' }),
    ).toEqual({
      subjectKind: 'CUSTOMER_OWNED',
    });
  });

  it('never sends code, date-range or contact parameters — this screen has no such control', () => {
    const params = toQueueListParams({ status: 'QUOTED', subjectKind: 'CATALOG' });

    for (const absent of ['code', 'submittedFrom', 'submittedTo', 'contact', 'contactKind']) {
      expect(absent in params).toBe(false);
    }
  });

  it('keeps the address clean for the default queue and one parameter per active filter', () => {
    expect(toQueueFilterSearchString(DEFAULT_QUEUE_FILTERS)).toBe('');
    expect(toQueueFilterSearchString({ status: 'NEW', subjectKind: 'CATALOG' })).toBe(
      'status=NEW&subject=CATALOG',
    );
  });

  it('normalizes an arbitrary, repeated or hand-edited value to the default', () => {
    expect(normalizeQueueFilters({ status: 'DROP TABLE', subject: ['nonsense'] })).toEqual(
      DEFAULT_QUEUE_FILTERS,
    );
    expect(normalizeQueueFilters({})).toEqual(DEFAULT_QUEUE_FILTERS);
    // Only the whitelisted values survive.
    expect(normalizeQueueFilters({ status: 'QUOTED', subject: 'CATALOG' })).toEqual({
      status: 'QUOTED',
      subjectKind: 'CATALOG',
    });
  });

  it('treats only a non-default filter as active — that is which empty state applies', () => {
    expect(isAnyQueueFilterActive(DEFAULT_QUEUE_FILTERS)).toBe(false);
    expect(isAnyQueueFilterActive({ status: 'NEW', subjectKind: ALL_FILTER_VALUE })).toBe(true);
    expect(isAnyQueueFilterActive({ status: TRIAGE_FILTER_VALUE, subjectKind: 'CATALOG' })).toBe(
      true,
    );
  });

  it('offers the default scope first and every canonical state after it', () => {
    expect(QUEUE_STATUS_FILTER_OPTIONS[0]?.value).toBe(TRIAGE_FILTER_VALUE);
    expect(QUEUE_STATUS_FILTER_OPTIONS).toHaveLength(11);
    expect(QUEUE_SUBJECT_FILTER_OPTIONS.map((option) => option.value)).toEqual([
      ALL_FILTER_VALUE,
      'CATALOG',
      'CUSTOMER_OWNED',
    ]);
  });

  it('keys the cache by the filters and the page size, and never by a cursor', () => {
    const key = customRequestQueueKeys.list({ status: 'NEW', subjectKind: 'CATALOG' });

    expect(key).toEqual([
      'admin',
      'custom-requests',
      'queue',
      { pageSize: 20, status: 'NEW', subjectKind: 'CATALOG' },
    ]);
    expect(JSON.stringify(key)).not.toContain('cursor');
    // A filter change addresses a different entry — that is the pagination reset.
    expect(key).not.toEqual(customRequestQueueKeys.list(DEFAULT_QUEUE_FILTERS));
  });
});

describe('status and subject presentation', () => {
  it('names a triage state', () => {
    expect(presentStatus('NEEDS_CLARIFICATION')).toEqual({
      token: 'NEEDS_CLARIFICATION',
      label: CUSTOM_REQUEST_QUEUE_COPY.status.needsClarification,
      known: true,
    });
  });

  it('names an APP6 state truthfully rather than folding it into an APP5 one', () => {
    const quoted = presentStatus('QUOTED');

    expect(quoted.known).toBe(true);
    expect(quoted.label).toBe(CUSTOM_REQUEST_QUEUE_COPY.status.quoted);
    expect(quoted.label).not.toBe(CUSTOM_REQUEST_QUEUE_COPY.status.new);
    expect(quoted.label).not.toBe(CUSTOM_REQUEST_QUEUE_COPY.status.underReview);
  });

  it('degrades an undefined state to a neutral label instead of echoing the token', () => {
    for (const raw of ['SOMETHING_NEW', '', undefined, null, 42]) {
      const presentation = presentStatus(raw);
      expect(presentation.known).toBe(false);
      expect(presentation.token).toBe('UNKNOWN');
      expect(presentation.label).toBe(CUSTOM_REQUEST_QUEUE_COPY.status.unknown);
    }
  });

  it('maps both XOR branches and refuses to guess a third', () => {
    expect(subjectKindLabel('CATALOG')).toBe(CUSTOM_REQUEST_QUEUE_COPY.subject.catalog);
    expect(subjectKindLabel('CUSTOMER_OWNED')).toBe(
      CUSTOM_REQUEST_QUEUE_COPY.subject.customerOwned,
    );
    expect(subjectKindLabel('BOTH')).toBe(CUSTOM_REQUEST_QUEUE_COPY.subject.unknown);
  });

  it('builds the effective scope from the server’s applied statuses', () => {
    expect(appliedScopeLabels(['NEW', 'UNDER_REVIEW', 'NEEDS_CLARIFICATION'])).toEqual([
      CUSTOM_REQUEST_QUEUE_COPY.status.new,
      CUSTOM_REQUEST_QUEUE_COPY.status.underReview,
      CUSTOM_REQUEST_QUEUE_COPY.status.needsClarification,
    ]);
    // A scope the screen has no label for is still stated, never dropped.
    expect(appliedScopeLabels(['MYSTERY'])).toEqual([CUSTOM_REQUEST_QUEUE_COPY.status.unknown]);
  });
});

describe('row projection', () => {
  it('exposes the operational fields and keeps the request id as an address only', () => {
    const row = toQueueRow(makeQueueItem());

    expect(row.code).toBe('REQ-2026-000123');
    expect(row.totalQuantity).toBe(12);
    expect(row.detailHref).toBe(`/requests/${REQUEST_NEW_ID}`);
    // Nothing addressable-by-eye: no raw id is a *rendered* value, and the
    // customer id is not on the projection at all.
    expect(JSON.stringify({ ...row, detailHref: '', key: '' })).not.toContain(REQUEST_NEW_ID);
    expect(JSON.stringify(row)).not.toContain(CUSTOMER_ID);
  });

  it('states an absent customer name and an unresolved subject rather than inventing them', () => {
    const row = toQueueRow(
      makeQueueItem({ customerDisplayName: undefined, subjectSummary: undefined }),
    );

    expect(row.customerDisplayName).toBe(CUSTOM_REQUEST_QUEUE_COPY.customer.unnamed);
    expect(row.subjectSummary).toBe(CUSTOM_REQUEST_QUEUE_COPY.subject.missingSummary);
  });
});

describe('keyset accumulation', () => {
  it('keeps server order and the first occurrence of a request seen twice', () => {
    const first = makeQueuePage([
      makeQueueItem(),
      makeQueueItem({ requestId: REQUEST_QUOTED_ID, code: 'REQ-2' }),
    ]);
    const second = makeQueuePage([
      makeQueueItem({ code: 'REQ-1-MOVED' }),
      makeQueueItem({ requestId: '01940000-0000-7000-8000-00000000000f', code: 'REQ-3' }),
    ]);

    const rows = flattenQueuePages([first, second]);

    expect(rows.map((row) => row.code)).toEqual(['REQ-2026-000123', 'REQ-2', 'REQ-3']);
  });

  it('continues only when hasNext and a usable cursor agree', () => {
    expect(resolveNextCursor(makeQueuePage([], { next: 'opaque-cursor' }))).toBe('opaque-cursor');
    expect(resolveNextCursor(makeQueuePage([]))).toBeUndefined();
    expect(resolveNextCursor(undefined)).toBeUndefined();
    // hasNext with an unusable cursor is not a continuation.
    expect(resolveNextCursor(makeQueuePage([], { next: '' }))).toBeUndefined();
  });
});
