import { randomUUID } from 'node:crypto';
import { db } from '../db.js';
import { decrypt, encrypt } from '../crypto.js';
import { refreshMsAccessToken, type MsTokenResponse } from './msOAuth.js';

interface MsAccountRow {
  id: string;
  ms_access_token_enc: string;
  ms_refresh_token_enc: string;
  ms_access_token_expires_at: number;
  scope: string;
}

/** Persists a fresh Microsoft token response as a new account row and returns its id. */
export function createMsAccount(tokens: MsTokenResponse): string {
  const id = randomUUID();
  const now = Date.now();
  db.prepare(
    `INSERT INTO ms_accounts
       (id, ms_access_token_enc, ms_refresh_token_enc, ms_access_token_expires_at, scope, created_at, updated_at)
     VALUES ($id, $accessTokenEnc, $refreshTokenEnc, $expiresAt, $scope, $now, $now)`
  ).run({
    $id: id,
    $accessTokenEnc: encrypt(tokens.access_token),
    $refreshTokenEnc: encrypt(tokens.refresh_token),
    $expiresAt: now + tokens.expires_in * 1000,
    $scope: tokens.scope,
    $now: now
  });
  return id;
}

function getRow(msAccountId: string): MsAccountRow {
  const row = db.prepare('SELECT * FROM ms_accounts WHERE id = $id').get({ $id: msAccountId }) as
    MsAccountRow | undefined;
  if (!row) {
    throw new Error(`Unknown Microsoft account id: ${msAccountId}`);
  }
  return row;
}

/** Resolves the Microsoft account linked to an MCP access token (see provider.ts). */
export function getMsAccountIdForMcpToken(mcpAccessToken: string): string {
  const row = db.prepare('SELECT ms_account_id FROM mcp_tokens WHERE access_token = $token').get({
    $token: mcpAccessToken
  }) as { ms_account_id: string } | undefined;
  if (!row) {
    throw new Error('No Microsoft account linked to this access token');
  }
  return row.ms_account_id;
}

/**
 * Returns a valid (non-expired) Microsoft access token for the given account,
 * transparently refreshing it via the stored Microsoft refresh token if needed.
 * This is the only place Graph API callers should obtain an access token from.
 */
export async function getValidMsAccessToken(msAccountId: string): Promise<string> {
  const row = getRow(msAccountId);
  const EXPIRY_SKEW_MS = 60_000;
  if (row.ms_access_token_expires_at - EXPIRY_SKEW_MS > Date.now()) {
    return decrypt(row.ms_access_token_enc);
  }

  const refreshToken = decrypt(row.ms_refresh_token_enc);
  const refreshed = await refreshMsAccessToken(refreshToken);
  const now = Date.now();
  db.prepare(
    `UPDATE ms_accounts
     SET ms_access_token_enc = $accessTokenEnc,
         ms_refresh_token_enc = $refreshTokenEnc,
         ms_access_token_expires_at = $expiresAt,
         scope = $scope,
         updated_at = $now
     WHERE id = $id`
  ).run({
    $id: msAccountId,
    $accessTokenEnc: encrypt(refreshed.access_token),
    // Microsoft may or may not rotate the refresh token; keep the latest one if provided.
    $refreshTokenEnc: encrypt(refreshed.refresh_token ?? refreshToken),
    $expiresAt: now + refreshed.expires_in * 1000,
    $scope: refreshed.scope,
    $now: now
  });
  return refreshed.access_token;
}
