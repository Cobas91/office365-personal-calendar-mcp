import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getGraphClient, jsonResult, withToolErrorHandling, type ToolExtra } from './helpers.js';

export function registerGetEventTool(server: McpServer): void {
  server.registerTool(
    'get_event',
    {
      title: 'Get event details',
      description: 'Fetches full details of a single calendar event by its id (from list_events).',
      inputSchema: {
        eventId: z.string().describe('Event id, as returned by list_events')
      },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async ({ eventId }, extra: ToolExtra) =>
      withToolErrorHandling(async () => {
        const event = await getGraphClient(extra).getEvent(eventId);
        return jsonResult(event);
      })
  );
}
