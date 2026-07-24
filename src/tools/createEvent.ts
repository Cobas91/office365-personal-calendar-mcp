import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GraphEvent } from '../graph/types.js';
import { getGraphClient, jsonResult, withToolErrorHandling, type ToolExtra } from './helpers.js';

export function registerCreateEventTool(server: McpServer): void {
  server.registerTool(
    'create_event',
    {
      title: 'Create event',
      description: 'Creates a new event in the given calendar (from list_calendars).',
      inputSchema: {
        calendarId: z.string().describe('Calendar id from list_calendars to create the event in'),
        subject: z.string().describe('Event title'),
        startDateTime: z.string().describe('ISO 8601 start time, e.g. 2026-08-01T18:00:00'),
        endDateTime: z.string().describe('ISO 8601 end time, e.g. 2026-08-01T19:00:00'),
        timeZone: z
          .string()
          .default('UTC')
          .describe('IANA or Windows time zone name, e.g. Europe/Berlin'),
        location: z.string().optional().describe('Free-text location'),
        body: z.string().optional().describe('Plain-text description/body'),
        attendees: z.array(z.string()).optional().describe('Email addresses of attendees to invite')
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
    },
    async (
      { calendarId, subject, startDateTime, endDateTime, timeZone, location, body, attendees },
      extra: ToolExtra
    ) =>
      withToolErrorHandling(async () => {
        const payload: Partial<GraphEvent> = {
          subject,
          start: { dateTime: startDateTime, timeZone },
          end: { dateTime: endDateTime, timeZone },
          ...(location ? { location: { displayName: location } } : {}),
          ...(body ? { body: { contentType: 'text', content: body } } : {}),
          ...(attendees?.length
            ? {
                attendees: attendees.map((address) => ({
                  emailAddress: { address },
                  type: 'required' as const
                }))
              }
            : {})
        };
        const created = await getGraphClient(extra).createEvent(calendarId, payload);
        return jsonResult({
          id: created.id,
          subject: created.subject,
          start: created.start,
          end: created.end,
          webLink: created.webLink
        });
      })
  );
}
