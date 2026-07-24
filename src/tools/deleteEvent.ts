import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getGraphClient, textResult, withToolErrorHandling, type ToolExtra } from './helpers.js';

export function registerDeleteEventTool(server: McpServer): void {
  server.registerTool(
    'delete_event',
    {
      title: 'Delete/cancel event',
      description: 'Deletes (cancels) an existing event by its id.',
      inputSchema: {
        eventId: z.string().describe('Event id, as returned by list_events')
      },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false }
    },
    async ({ eventId }, extra: ToolExtra) =>
      withToolErrorHandling(async () => {
        await getGraphClient(extra).deleteEvent(eventId);
        return textResult(`Event ${eventId} deleted.`);
      })
  );
}
