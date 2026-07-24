import { getMsAccountIdForMcpToken, getValidMsAccessToken } from '../auth/msAccounts.js';
import type { GraphCalendar, GraphErrorBody, GraphEvent, GraphListResponse } from './types.js';

const GRAPH_BASE_URL = 'https://graph.microsoft.com/v1.0';

export class GraphApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly graphErrorCode: string | undefined,
    message: string
  ) {
    super(message);
    this.name = 'GraphApiError';
  }
}

/**
 * Thin wrapper around the Microsoft Graph calendar endpoints. All Graph calls MUST go
 * through this module (never call `fetch` against graph.microsoft.com directly) so that
 * token refresh and error handling stay in one place - see CLAUDE.md conventions.
 */
export class GraphClient {
  constructor(private readonly msAccountId: string) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const accessToken = await getValidMsAccessToken(this.msAccountId);
    const response = await fetch(`${GRAPH_BASE_URL}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...init.headers
      }
    });

    if (response.status === 204) {
      return undefined as T;
    }

    const text = await response.text();
    const body = text ? JSON.parse(text) : undefined;

    if (!response.ok) {
      const errorBody = body as GraphErrorBody | undefined;
      throw new GraphApiError(
        response.status,
        errorBody?.error?.code,
        errorBody?.error?.message ?? `Microsoft Graph request failed with status ${response.status}`
      );
    }

    return body as T;
  }

  listCalendars(): Promise<GraphCalendar[]> {
    return this.request<GraphListResponse<GraphCalendar>>('/me/calendars?$top=100').then(
      (r) => r.value
    );
  }

  async listEvents(params: {
    calendarId?: string;
    startDateTime: string;
    endDateTime: string;
  }): Promise<GraphEvent[]> {
    const basePath = params.calendarId
      ? `/me/calendars/${params.calendarId}/calendarView`
      : '/me/calendarView';
    const query = new URLSearchParams({
      startDateTime: params.startDateTime,
      endDateTime: params.endDateTime,
      $top: '100',
      $orderby: 'start/dateTime'
    });
    const result = await this.request<GraphListResponse<GraphEvent>>(
      `${basePath}?${query.toString()}`
    );
    return result.value;
  }

  getEvent(eventId: string): Promise<GraphEvent> {
    return this.request<GraphEvent>(`/me/events/${encodeURIComponent(eventId)}`);
  }

  createEvent(calendarId: string, event: Partial<GraphEvent>): Promise<GraphEvent> {
    return this.request<GraphEvent>(`/me/calendars/${encodeURIComponent(calendarId)}/events`, {
      method: 'POST',
      body: JSON.stringify(event)
    });
  }

  updateEvent(eventId: string, patch: Partial<GraphEvent>): Promise<GraphEvent> {
    return this.request<GraphEvent>(`/me/events/${encodeURIComponent(eventId)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch)
    });
  }

  async deleteEvent(eventId: string): Promise<void> {
    await this.request<void>(`/me/events/${encodeURIComponent(eventId)}`, { method: 'DELETE' });
  }
}

/** Builds a GraphClient scoped to the Microsoft account linked to the given MCP access token. */
export function graphClientForMcpToken(mcpAccessToken: string): GraphClient {
  return new GraphClient(getMsAccountIdForMcpToken(mcpAccessToken));
}
