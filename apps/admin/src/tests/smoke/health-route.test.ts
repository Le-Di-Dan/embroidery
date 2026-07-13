import { GET } from '../../app/healthz/route';

describe('admin health route', () => {
  it('responds with a healthy status payload', async () => {
    const response = GET();
    expect(response.status).toBe(200);
    const body = (await response.json()) as { status: string; service: string; timestamp: string };
    expect(body.status).toBe('ok');
    expect(body.service).toBe('admin');
    expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);
  });
});
