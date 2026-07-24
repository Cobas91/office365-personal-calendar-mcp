import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerListCalendarsTool } from './listCalendars.js';
import { registerListEventsTool } from './listEvents.js';
import { registerGetEventTool } from './getEvent.js';
import { registerCreateEventTool } from './createEvent.js';
import { registerUpdateEventTool } from './updateEvent.js';
import { registerDeleteEventTool } from './deleteEvent.js';

export function registerAllTools(server: McpServer): void {
  registerListCalendarsTool(server);
  registerListEventsTool(server);
  registerGetEventTool(server);
  registerCreateEventTool(server);
  registerUpdateEventTool(server);
  registerDeleteEventTool(server);
}
