import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GraphEvent } from '../graph/types.js';
import { getGraphClient, jsonResult, withToolErrorHandling, type ToolExtra } from './helpers.js';

export function registerUpdateEventTool(server: McpServer): void {
  server.registerTool(
    'update_event',
    {
      title: 'Update event',
      description: 'Updates fields of an existing event. Only the provided fields are changed.',
      inputSchema: {
        eventId: z.string().describe('Event id, as returned by list_events'),
        subject: z.string().optional(),
        startDateTime: z.string().optional().describe('ISO 8601 start time'),
        endDateTime: z.string().optional().describe('ISO 8601 end time'),
        timeZone: z.string().optional().describe('Required if startDateTime or endDateTime is set'),
        location: z.string().optional(),
        body: z.string().optional().describe('Plain-text description/body')
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
    },
    async (
      { eventId, subject, startDateTime, endDateTime, timeZone, location, body },
      extra: ToolExtra
    ) =>
      withToolErrorHandling(async () => {
        if ((startDateTime || endDateTime) && !timeZone) {
          return jsonResult({
            error: 'timeZone is required when changing startDateTime or endDateTime'
          });
        }
        const patch: Partial<GraphEvent> = {
          ...(subject ? { subject } : {}),
          ...(startDateTime ? { start: { dateTime: startDateTime, timeZone: timeZone! } } : {}),
          ...(endDateTime ? { end: { dateTime: endDateTime, timeZone: timeZone! } } : {}),
          ...(location ? { location: { displayName: location } } : {}),
          ...(body ? { body: { contentType: 'text', content: body } } : {})
        };
        const updated = await getGraphClient(extra).updateEvent(eventId, patch);
        return jsonResult({
          id: updated.id,
          subject: updated.subject,
          start: updated.start,
          end: updated.end
        });
      })
  );
}
