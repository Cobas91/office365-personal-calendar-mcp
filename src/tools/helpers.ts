import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { GraphApiError, graphClientForMcpToken, type GraphClient } from '../graph/client.js';

export interface ToolExtra {
  authInfo?: AuthInfo;
}

export function getGraphClient(extra: ToolExtra): GraphClient {
  if (!extra.authInfo?.token) {
    throw new Error('This request is not authenticated. Connect your Microsoft account first.');
  }
  return graphClientForMcpToken(extra.authInfo.token);
}

export function textResult(text: string): CallToolResult {
  return { content: [{ type: 'text', text }] };
}

export function jsonResult(data: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

export function errorResult(message: string): CallToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

/** Wraps a tool handler so Graph/auth errors become a normal (isError) tool result instead of a thrown exception. */
export function withToolErrorHandling(fn: () => Promise<CallToolResult>): Promise<CallToolResult> {
  return fn().catch((err: unknown) => {
    if (err instanceof GraphApiError) {
      if (err.status === 404) {
        return errorResult(
          'Not found: the calendar or event id does not exist (or is no longer shared with you).'
        );
      }
      if (err.status === 401 || err.status === 403) {
        return errorResult(
          'Microsoft rejected this request (expired or revoked permission). Please reconnect your Microsoft account.'
        );
      }
      return errorResult(
        `Microsoft Graph error (${err.graphErrorCode ?? err.status}): ${err.message}`
      );
    }
    const message = err instanceof Error ? err.message : String(err);
    return errorResult(`Error: ${message}`);
  });
}
