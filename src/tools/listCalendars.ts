import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getGraphClient, jsonResult, withToolErrorHandling, type ToolExtra } from './helpers.js';

export function registerListCalendarsTool(server: McpServer): void {
  server.registerTool(
    'list_calendars',
    {
      title: 'List calendars',
      description:
        'Lists all calendars visible in the connected Microsoft account, including shared calendars ' +
        'such as a Microsoft 365 Family calendar. Use this first to find a calendar id for the other tools.',
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async (_args, extra: ToolExtra) =>
      withToolErrorHandling(async () => {
        const calendars = await getGraphClient(extra).listCalendars();
        return jsonResult(
          calendars.map((c) => ({
            id: c.id,
            name: c.name,
            isDefaultCalendar: c.isDefaultCalendar ?? false,
            canEdit: c.canEdit ?? false,
            owner: c.owner?.name ?? c.owner?.address
          }))
        );
      })
  );
}
