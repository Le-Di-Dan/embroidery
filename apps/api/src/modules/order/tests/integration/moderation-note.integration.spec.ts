/**
 * `APP5-B05` §13 — appending an internal moderation note, end to end.
 *
 * Seven claims, and six of them are about what an append does **not** do: it
 * does not move the request, does not write a transition row, does not raise an
 * outbox fact, does not accept an operator identity, does not accept a sequence
 * or a timestamp, and cannot be performed without an Admin session.
 */
import request from 'supertest';
import { sql } from 'drizzle-orm';

import {
  codeOf,
  createModerationContext,
  dataOf,
  ROUTES,
  type ModerationTestContext,
  type SeededModerationRequest,
} from './moderation-context';

interface NoteReceipt {
  readonly requestId: string;
  readonly sequence: number;
  readonly kind: string;
  readonly adminId: string;
  readonly createdAt: string;
  readonly requestStatus: string;
}

describe('APP5-B05 moderation note append (integration)', () => {
  let context: ModerationTestContext;
  let seeded: SeededModerationRequest;

  beforeAll(async () => {
    context = await createModerationContext('app5-b05-note');
  }, 180_000);

  afterAll(async () => {
    await context?.close();
  });

  beforeEach(async () => {
    await context.reset();
    await context.seedAdminSession();
    seeded = await context.seedRequest({ status: 'UNDER_REVIEW' });
  });

  function post(body: object) {
    return request(context.server())
      .post(ROUTES.notes(seeded.requestId))
      .set('Cookie', context.adminCookie())
      .send(body);
  }

  it('appends a note for an authenticated Admin and derives the operator server-side', async () => {
    const response = await post({ kind: 'NOTE', note: 'Khách đã gửi thêm ảnh qua Zalo.' });

    expect(response.status).toBe(201);
    const receipt = dataOf<NoteReceipt>(response);
    expect(receipt.requestId).toBe(seeded.requestId);
    expect(receipt.kind).toBe('NOTE');
    // The operator is the session's admin, not a value the body could carry.
    expect(receipt.adminId).toBe(context.adminId());

    const rows = await context.rows<{ admin_id: string; note: string; kind: string }>(
      sql`select admin_id, note, kind from request_moderation_notes
          where custom_request_id = ${seeded.requestId}`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.admin_id).toBe(context.adminId());
    expect(rows[0]?.note).toBe('Khách đã gửi thêm ảnh qua Zalo.');
  });

  it('refuses an unauthenticated caller and writes nothing', async () => {
    const response = await request(context.server())
      .post(ROUTES.notes(seeded.requestId))
      .send({ kind: 'NOTE', note: 'Không được ghi.' });

    expect(response.status).toBe(401);
    expect(
      await context.count(sql`select count(*)::text as count from request_moderation_notes`),
    ).toBe(0);
  });

  it('assigns the append sequence server-side, in append order', async () => {
    const first = dataOf<NoteReceipt>(await post({ kind: 'NOTE', note: 'Ghi chú một.' }));
    const second = dataOf<NoteReceipt>(await post({ kind: 'CLARIFY', note: 'Ghi chú hai.' }));

    expect(second.sequence).toBeGreaterThan(first.sequence);

    const rows = await context.rows<{ note: string }>(
      sql`select note from request_moderation_notes
          where custom_request_id = ${seeded.requestId} order by id asc`,
    );
    expect(rows.map((row) => row.note)).toEqual(['Ghi chú một.', 'Ghi chú hai.']);
  });

  it('leaves the request status untouched and creates no transition row or outbox fact', async () => {
    const receipt = dataOf<NoteReceipt>(await post({ kind: 'NOTE', note: 'Chỉ là ghi chú.' }));
    expect(receipt.requestStatus).toBe('UNDER_REVIEW');

    const [row] = await context.rows<{ status: string }>(
      sql`select status from custom_requests where id = ${seeded.requestId}`,
    );
    expect(row?.status).toBe('UNDER_REVIEW');

    // `G01-D05` and §8: a note-only append is not a move, so nothing records one.
    expect(
      await context.count(
        sql`select count(*)::text as count from custom_request_transitions
            where custom_request_id = ${seeded.requestId}`,
      ),
    ).toBe(0);
    expect(
      await context.count(
        sql`select count(*)::text as count from outbox_events where aggregate_kind = 'CUSTOM_REQUEST'`,
      ),
    ).toBe(0);
  });

  it.each([
    ['an unknown kind', { kind: 'PAUSE', note: 'x' }],
    ['a blank note', { kind: 'NOTE', note: '   ' }],
    ['a missing kind', { note: 'x' }],
    ['a server-owned sequence', { kind: 'NOTE', note: 'x', sequence: 1 }],
    [
      'a server-owned operator',
      { kind: 'NOTE', note: 'x', adminId: '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6099' },
    ],
    [
      'a server-owned timestamp',
      { kind: 'NOTE', note: 'x', createdAt: '2026-08-16T00:00:00.000Z' },
    ],
  ])('refuses %s', async (_label, body) => {
    const response = await post(body);
    expect(response.status).toBe(400);
    expect(
      await context.count(sql`select count(*)::text as count from request_moderation_notes`),
    ).toBe(0);
  });

  it('answers 404 for a request that does not exist', async () => {
    const response = await request(context.server())
      .post(ROUTES.notes('019a2b3c-4d5e-7f60-8a1b-2c3d4e5f60ff'))
      .set('Cookie', context.adminCookie())
      .send({ kind: 'NOTE', note: 'x' });

    expect(response.status).toBe(404);
    expect(codeOf(response)).toBe('REQUEST_NOT_FOUND');
  });

  it('publishes no route that could edit or remove a note', async () => {
    const noteRoute = `${ROUTES.notes(seeded.requestId)}/1`;
    const agent = request(context.server());

    // Not "the handler refuses" — there is no handler. TBL-041 is append-only
    // (CST-098), and the surface says so by having nothing that addresses a
    // single note.
    expect((await agent.put(noteRoute).set('Cookie', context.adminCookie()).send({})).status).toBe(
      404,
    );
    expect(
      (await agent.patch(noteRoute).set('Cookie', context.adminCookie()).send({})).status,
    ).toBe(404);
    expect((await agent.delete(noteRoute).set('Cookie', context.adminCookie())).status).toBe(404);
  });
});
