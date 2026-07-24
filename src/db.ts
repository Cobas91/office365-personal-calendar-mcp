import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';

mkdirSync(dirname(config.DB_PATH), { recursive: true });

export const db = new DatabaseSync(config.DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
  -- MCP clients registered against this server via Dynamic Client Registration (RFC 7591).
  -- Unrelated to the single Microsoft Azure App Registration configured via MS_CLIENT_ID.
  CREATE TABLE IF NOT EXISTS oauth_clients (
    client_id TEXT PRIMARY KEY,
    client_secret TEXT,
    redirect_uris TEXT NOT NULL, -- JSON string array
    client_name TEXT,
    metadata TEXT NOT NULL, -- full OAuthClientInformationFull, JSON
    created_at INTEGER NOT NULL
  );

  -- One row per Microsoft account that has completed the consent flow. Tokens are
  -- encrypted at rest (see crypto.ts) and never exposed to the MCP client.
  CREATE TABLE IF NOT EXISTS ms_accounts (
    id TEXT PRIMARY KEY,
    ms_access_token_enc TEXT NOT NULL,
    ms_refresh_token_enc TEXT NOT NULL,
    ms_access_token_expires_at INTEGER NOT NULL,
    scope TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  -- Short-lived record bridging the MCP-client-facing authorize() call to the
  -- Microsoft redirect_uri callback (see auth/provider.ts + auth/callbackRoute.ts).
  CREATE TABLE IF NOT EXISTS auth_transactions (
    ms_state TEXT PRIMARY KEY,
    mcp_client_id TEXT NOT NULL,
    mcp_redirect_uri TEXT NOT NULL,
    mcp_code_challenge TEXT NOT NULL,
    mcp_state TEXT,
    resource TEXT,
    scopes TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  -- Authorization codes issued by *this* server to the MCP client, after the
  -- Microsoft leg of the flow has completed. Single use, short-lived.
  CREATE TABLE IF NOT EXISTS auth_codes (
    code TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    code_challenge TEXT NOT NULL,
    redirect_uri TEXT NOT NULL,
    ms_account_id TEXT NOT NULL REFERENCES ms_accounts(id) ON DELETE CASCADE,
    resource TEXT,
    scopes TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );

  -- Access/refresh tokens issued by this server to MCP clients. These are the only
  -- tokens the MCP client ever sees; Microsoft's tokens stay server-side.
  CREATE TABLE IF NOT EXISTS mcp_tokens (
    access_token TEXT PRIMARY KEY,
    refresh_token TEXT UNIQUE NOT NULL,
    client_id TEXT NOT NULL,
    ms_account_id TEXT NOT NULL REFERENCES ms_accounts(id) ON DELETE CASCADE,
    scopes TEXT NOT NULL,
    access_token_expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
`);
