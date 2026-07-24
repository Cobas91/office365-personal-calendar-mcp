import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getValidMsAccessTokenMock = vi.fn(async () => 'fake-ms-access-token');

vi.mock('../src/auth/msAccounts.js', () => ({
  getValidMsAccessToken: (...args: unknown[]) => getValidMsAccessTokenMock(...args),
  getMsAccountIdForMcpToken: vi.fn(() => 'account-1')
}));

const { GraphApiError, GraphClient } = await import('../src/graph/client.js');

describe('GraphClient', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    getValidMsAccessTokenMock.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists calendars using a bearer token from the token store', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ value: [{ id: 'cal-1', name: 'Family' }] }), { status: 200 })
    );

    const client = new GraphClient('account-1');
    const calendars = await client.listCalendars();

    expect(calendars).toEqual([{ id: 'cal-1', name: 'Family' }]);
    expect(getValidMsAccessTokenMock).toHaveBeenCalledWith('account-1');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://graph.microsoft.com/v1.0/me/calendars?$top=100');
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer fake-ms-access-token'
    );
  });

  it('lists events scoped to a specific calendar and date range', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ value: [] }), { status: 200 }));

    const client = new GraphClient('account-1');
    await client.listEvents({
      calendarId: 'cal-1',
      startDateTime: '2026-08-01T00:00:00',
      endDateTime: '2026-08-31T23:59:59'
    });

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/me/calendars/cal-1/calendarView');
    expect(url).toContain('startDateTime=2026-08-01T00%3A00%3A00');
  });

  it('throws a GraphApiError with the Graph error code on failure', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'ErrorItemNotFound', message: 'not found' } }), {
        status: 404
      })
    );

    const client = new GraphClient('account-1');
    const failure = client.getEvent('missing-event');
    await expect(failure).rejects.toBeInstanceOf(GraphApiError);
    await expect(failure).rejects.toMatchObject({
      status: 404,
      graphErrorCode: 'ErrorItemNotFound'
    });
  });

  it('resolves to undefined for a 204 No Content response (delete)', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    const client = new GraphClient('account-1');
    await expect(client.deleteEvent('event-1')).resolves.toBeUndefined();
  });
});
