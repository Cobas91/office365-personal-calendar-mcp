import type { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import type { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';
import { db } from '../db.js';

/**
 * SQLite-backed store for MCP clients registered via Dynamic Client Registration
 * (RFC 7591). These are entirely separate from the single Microsoft Azure App
 * Registration (MS_CLIENT_ID/MS_CLIENT_SECRET) — one row here per MCP client
 * (e.g. one per Claude deployment) that has registered against this server.
 */
export const clientStore: OAuthRegisteredClientsStore = {
  getClient(clientId: string): OAuthClientInformationFull | undefined {
    const row = db.prepare('SELECT metadata FROM oauth_clients WHERE client_id = $clientId').get({
      $clientId: clientId
    }) as { metadata: string } | undefined;
    if (!row) return undefined;
    return JSON.parse(row.metadata) as OAuthClientInformationFull;
  },

  registerClient(client: OAuthClientInformationFull): OAuthClientInformationFull {
    db.prepare(
      `INSERT INTO oauth_clients (client_id, client_secret, redirect_uris, client_name, metadata, created_at)
       VALUES ($clientId, $clientSecret, $redirectUris, $clientName, $metadata, $createdAt)`
    ).run({
      $clientId: client.client_id,
      $clientSecret: client.client_secret ?? null,
      $redirectUris: JSON.stringify(client.redirect_uris),
      $clientName: client.client_name ?? null,
      $metadata: JSON.stringify(client),
      $createdAt: Date.now()
    });
    return client;
  }
};
