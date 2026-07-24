import { randomBytes } from 'node:crypto';
import type { Response } from 'express';
import type {
  AuthorizationParams,
  OAuthServerProvider
} from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type {
  OAuthClientInformationFull,
  OAuthTokenRevocationRequest,
  OAuthTokens
} from '@modelcontextprotocol/sdk/shared/auth.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { db } from '../db.js';
import { clientStore } from './clientStore.js';
import { buildMsAuthorizeUrl } from './msOAuth.js';
import { msGraphScopes } from '../config.js';

const AUTH_TRANSACTION_TTL_MS = 10 * 60 * 1000; // 10 minutes to complete the Microsoft consent screen
const AUTH_CODE_TTL_MS = 5 * 60 * 1000; // 5 minutes for the MCP client to redeem our own code
const ACCESS_TOKEN_TTL_SECONDS = 60 * 60; // 1 hour

function newOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Custom OAuthServerProvider implementing the "third-party proxy" pattern described in
 * docs/adr/0001-oauth-third-party-proxy.md: this server is a full Authorization Server
 * towards the MCP client (Claude), and a plain OAuth *client* towards Microsoft. Unlike the
 * SDK's stock ProxyOAuthServerProvider (which forwards the client's own redirect_uri straight
 * through to the upstream AS), this provider performs a "double hop":
 *
 *   1. authorize() redirects the browser to Microsoft using OUR OWN fixed redirect_uri
 *      (Azure App Registrations require an exact, pre-registered redirect URI, so an
 *      arbitrary MCP client's callback URL cannot be forwarded as-is).
 *   2. Microsoft redirects back to our /oauth/microsoft/callback route (see callbackRoute.ts),
 *      which exchanges the code for Microsoft tokens itself and stores them encrypted.
 *   3. We then mint our OWN authorization code/access/refresh tokens for the MCP client.
 *      The MCP client never sees a Microsoft token - only our opaque ones (see ADR 0002).
 */
export const authProvider: OAuthServerProvider = {
  get clientsStore() {
    return clientStore;
  },

  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response
  ): Promise<void> {
    const msState = newOpaqueToken();
    const now = Date.now();

    db.prepare('DELETE FROM auth_transactions WHERE created_at < $cutoff').run({
      $cutoff: now - AUTH_TRANSACTION_TTL_MS
    });

    db.prepare(
      `INSERT INTO auth_transactions
         (ms_state, mcp_client_id, mcp_redirect_uri, mcp_code_challenge, mcp_state, resource, scopes, created_at)
       VALUES ($msState, $clientId, $redirectUri, $codeChallenge, $mcpState, $resource, $scopes, $now)`
    ).run({
      $msState: msState,
      $clientId: client.client_id,
      $redirectUri: params.redirectUri,
      $codeChallenge: params.codeChallenge,
      $mcpState: params.state ?? null,
      $resource: params.resource?.href ?? null,
      $scopes: (params.scopes ?? []).join(' '),
      $now: now
    });

    res.redirect(buildMsAuthorizeUrl({ state: msState, scopes: msGraphScopes }));
  },

  async challengeForAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string
  ): Promise<string> {
    const row = db
      .prepare(
        'SELECT code_challenge, expires_at FROM auth_codes WHERE code = $code AND client_id = $clientId'
      )
      .get({ $code: authorizationCode, $clientId: client.client_id }) as
      { code_challenge: string; expires_at: number } | undefined;
    if (!row || row.expires_at < Date.now()) {
      throw new Error('Unknown or expired authorization code');
    }
    return row.code_challenge;
  },

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string
  ): Promise<OAuthTokens> {
    const row = db
      .prepare(
        'SELECT ms_account_id, resource, scopes, expires_at FROM auth_codes WHERE code = $code AND client_id = $clientId'
      )
      .get({ $code: authorizationCode, $clientId: client.client_id }) as
      | { ms_account_id: string; resource: string | null; scopes: string; expires_at: number }
      | undefined;

    if (!row || row.expires_at < Date.now()) {
      throw new Error('Unknown or expired authorization code');
    }

    // Single use.
    db.prepare('DELETE FROM auth_codes WHERE code = $code').run({ $code: authorizationCode });

    return issueMcpTokens({
      clientId: client.client_id,
      msAccountId: row.ms_account_id,
      scopes: row.scopes
    });
  },

  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string
  ): Promise<OAuthTokens> {
    const row = db
      .prepare(
        'SELECT ms_account_id, scopes FROM mcp_tokens WHERE refresh_token = $refreshToken AND client_id = $clientId'
      )
      .get({ $refreshToken: refreshToken, $clientId: client.client_id }) as
      { ms_account_id: string; scopes: string } | undefined;

    if (!row) {
      throw new Error('Unknown refresh token');
    }

    // Rotate: the old access/refresh token pair is replaced by a new one.
    db.prepare('DELETE FROM mcp_tokens WHERE refresh_token = $refreshToken').run({
      $refreshToken: refreshToken
    });

    return issueMcpTokens({
      clientId: client.client_id,
      msAccountId: row.ms_account_id,
      scopes: row.scopes
    });
  },

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const row = db
      .prepare(
        'SELECT client_id, scopes, access_token_expires_at FROM mcp_tokens WHERE access_token = $token'
      )
      .get({ $token: token }) as
      { client_id: string; scopes: string; access_token_expires_at: number } | undefined;

    if (!row) {
      throw new Error('Invalid access token');
    }
    if (row.access_token_expires_at < Date.now()) {
      throw new Error('Access token expired');
    }

    return {
      token,
      clientId: row.client_id,
      scopes: row.scopes.split(' ').filter(Boolean),
      expiresAt: Math.floor(row.access_token_expires_at / 1000)
    };
  },

  async revokeToken(
    _client: OAuthClientInformationFull,
    request: OAuthTokenRevocationRequest
  ): Promise<void> {
    db.prepare('DELETE FROM mcp_tokens WHERE access_token = $token OR refresh_token = $token').run({
      $token: request.token
    });
  }
};

function issueMcpTokens(params: {
  clientId: string;
  msAccountId: string;
  scopes: string;
}): OAuthTokens {
  const accessToken = newOpaqueToken();
  const refreshToken = newOpaqueToken();
  const now = Date.now();

  db.prepare(
    `INSERT INTO mcp_tokens
       (access_token, refresh_token, client_id, ms_account_id, scopes, access_token_expires_at, created_at)
     VALUES ($accessToken, $refreshToken, $clientId, $msAccountId, $scopes, $expiresAt, $now)`
  ).run({
    $accessToken: accessToken,
    $refreshToken: refreshToken,
    $clientId: params.clientId,
    $msAccountId: params.msAccountId,
    $scopes: params.scopes,
    $expiresAt: now + ACCESS_TOKEN_TTL_SECONDS * 1000,
    $now: now
  });

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: 'bearer',
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
    scope: params.scopes
  };
}

/** Used by callbackRoute.ts once the Microsoft leg of the flow has finished. */
export function createAuthCodeForTransaction(params: { msState: string; msAccountId: string }): {
  redirectUri: string;
  code: string;
  mcpState: string | null;
} {
  const tx = db.prepare('SELECT * FROM auth_transactions WHERE ms_state = $msState').get({
    $msState: params.msState
  }) as
    | {
        mcp_client_id: string;
        mcp_redirect_uri: string;
        mcp_code_challenge: string;
        mcp_state: string | null;
        resource: string | null;
        scopes: string;
      }
    | undefined;

  if (!tx) {
    throw new Error('Unknown or expired OAuth transaction');
  }
  db.prepare('DELETE FROM auth_transactions WHERE ms_state = $msState').run({
    $msState: params.msState
  });

  const code = newOpaqueToken();
  db.prepare(
    `INSERT INTO auth_codes (code, client_id, code_challenge, redirect_uri, ms_account_id, resource, scopes, expires_at)
     VALUES ($code, $clientId, $codeChallenge, $redirectUri, $msAccountId, $resource, $scopes, $expiresAt)`
  ).run({
    $code: code,
    $clientId: tx.mcp_client_id,
    $codeChallenge: tx.mcp_code_challenge,
    $redirectUri: tx.mcp_redirect_uri,
    $msAccountId: params.msAccountId,
    $resource: tx.resource,
    $scopes: tx.scopes,
    $expiresAt: Date.now() + AUTH_CODE_TTL_MS
  });

  return { redirectUri: tx.mcp_redirect_uri, code, mcpState: tx.mcp_state };
}
