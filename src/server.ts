import { randomUUID } from 'node:crypto';
import express, { type Request, type Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  getOAuthProtectedResourceMetadataUrl,
  mcpAuthRouter
} from '@modelcontextprotocol/sdk/server/auth/router.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import './db.js';
import { config, msGraphScopes } from './config.js';
import { authProvider } from './auth/provider.js';
import { microsoftCallbackRouter } from './auth/callbackRoute.js';
import { createMcpServer } from './mcpServer.js';

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Fixed Microsoft redirect_uri target - see docs/adr/0001-oauth-third-party-proxy.md
app.use(microsoftCallbackRouter);

const issuerUrl = new URL(config.MCP_BASE_URL);
const mcpServerUrl = new URL('/mcp', config.MCP_BASE_URL);

// Open-registration MCP servers are an easy target for abuse: anyone who finds this
// server's URL could otherwise register a client and start burning Microsoft Graph
// quota/consent screens. If DCR_BOOTSTRAP_TOKEN is set, gate the registration endpoint
// behind it. See docs/adr/0004-dcr-access-protection.md.
app.use('/register', (req, res, next) => {
  if (!config.DCR_BOOTSTRAP_TOKEN) {
    next();
    return;
  }
  if (req.headers.authorization !== `Bearer ${config.DCR_BOOTSTRAP_TOKEN}`) {
    res.status(401).json({
      error: 'invalid_client',
      error_description: 'Missing or invalid client registration bootstrap token'
    });
    return;
  }
  next();
});

app.use(
  mcpAuthRouter({
    provider: authProvider,
    issuerUrl,
    resourceServerUrl: mcpServerUrl,
    scopesSupported: msGraphScopes,
    resourceName: 'Outlook Calendar MCP Server'
  })
);

const requireAuth = requireBearerAuth({
  verifier: { verifyAccessToken: (token) => authProvider.verifyAccessToken(token) },
  resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(mcpServerUrl)
});

const transports = new Map<string, StreamableHTTPServerTransport>();

async function handleMcpPost(req: Request, res: Response): Promise<void> {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  try {
    let transport = sessionId ? transports.get(sessionId) : undefined;

    if (!transport) {
      if (sessionId || !isInitializeRequest(req.body)) {
        res.status(400).json({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Bad Request: No valid session ID provided' },
          id: null
        });
        return;
      }

      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => {
          transports.set(id, transport!);
        }
      });
      transport.onclose = () => {
        if (transport!.sessionId) transports.delete(transport!.sessionId);
      };

      const server = createMcpServer();
      await server.connect(transport);
    }

    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error('Error handling MCP request:', err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal server error' },
        id: null
      });
    }
  }
}

async function handleMcpSessionRequest(req: Request, res: Response): Promise<void> {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  const transport = sessionId ? transports.get(sessionId) : undefined;
  if (!transport) {
    res.status(400).send('Invalid or missing session ID');
    return;
  }
  await transport.handleRequest(req, res);
}

app.post('/mcp', requireAuth, handleMcpPost);
app.get('/mcp', requireAuth, handleMcpSessionRequest);
app.delete('/mcp', requireAuth, handleMcpSessionRequest);

app.listen(config.PORT, () => {
  console.log(`outlook-calendar-mcp listening on port ${config.PORT}`);
  console.log(`MCP endpoint: ${mcpServerUrl.href}`);
});

process.on('SIGINT', async () => {
  for (const transport of transports.values()) {
    await transport.close().catch(() => undefined);
  }
  process.exit(0);
});
