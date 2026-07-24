import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getGraphClient, jsonResult, withToolErrorHandling, type ToolExtra } from './helpers.js';

export function registerListEventsTool(server: McpServer): void {
  server.registerTool(
    'list_events',
    {
      title: 'List events',
      description:
        'Lists events in a date/time range. Pass a calendarId from list_calendars to look in a specific ' +
        'calendar (e.g. a shared family calendar); omit it to use the default calendar.',
      inputSchema: {
        startDateTime: z.string().describe('ISO 8601 start of the range, e.g. 2026-08-01T00:00:00'),
        endDateTime: z.string().describe('ISO 8601 end of the range, e.g. 2026-08-31T23:59:59'),
        calendarId: z
          .string()
          .optional()
          .describe('Calendar id from list_calendars. Omit for the default calendar.')
      },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async ({ startDateTime, endDateTime, calendarId }, extra: ToolExtra) =>
      withToolErrorHandling(async () => {
        const events = await getGraphClient(extra).listEvents({
          calendarId,
          startDateTime,
          endDateTime
        });
        return jsonResult(
          events.map((e) => ({
            id: e.id,
            subject: e.subject,
            start: e.start,
            end: e.end,
            location: e.location?.displayName,
            isCancelled: e.isCancelled ?? false,
            organizer: e.organizer?.emailAddress?.address
          }))
        );
      })
  );
}
