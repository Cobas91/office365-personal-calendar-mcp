import { Router } from 'express';
import { db } from '../db.js';
import { exchangeMsAuthorizationCode } from './msOAuth.js';
import { createMsAccount } from './msAccounts.js';
import { createAuthCodeForTransaction } from './provider.js';

/**
 * Handles the redirect back from Microsoft's /authorize endpoint. This is the fixed,
 * pre-registered redirect_uri configured in the Azure App Registration - see
 * docs/adr/0001-oauth-third-party-proxy.md for why this can't be the MCP client's own
 * callback URL.
 */
export const microsoftCallbackRouter = Router();

function lookupMcpRedirectUriForState(msState: string | undefined): string | undefined {
  if (!msState) return undefined;
  const row = db
    .prepare('SELECT mcp_redirect_uri FROM auth_transactions WHERE ms_state = $msState')
    .get({
      $msState: msState
    }) as { mcp_redirect_uri: string } | undefined;
  return row?.mcp_redirect_uri;
}

microsoftCallbackRouter.get('/oauth/microsoft/callback', async (req, res) => {
  const { code, state, error, error_description: errorDescription } = req.query;

  if (typeof error === 'string') {
    const mcpRedirectUri = lookupMcpRedirectUriForState(
      typeof state === 'string' ? state : undefined
    );
    if (mcpRedirectUri) {
      const url = new URL(mcpRedirectUri);
      url.searchParams.set('error', error);
      if (typeof errorDescription === 'string')
        url.searchParams.set('error_description', errorDescription);
      res.redirect(url.href);
      return;
    }
    res.status(400).send(`Microsoft sign-in failed: ${error} ${errorDescription ?? ''}`);
    return;
  }

  if (typeof code !== 'string' || typeof state !== 'string') {
    res.status(400).send('Missing code or state parameter');
    return;
  }

  try {
    const msTokens = await exchangeMsAuthorizationCode(code);
    const msAccountId = createMsAccount(msTokens);
    const {
      redirectUri,
      code: mcpCode,
      mcpState
    } = createAuthCodeForTransaction({ msState: state, msAccountId });

    const url = new URL(redirectUri);
    url.searchParams.set('code', mcpCode);
    if (mcpState) url.searchParams.set('state', mcpState);
    res.redirect(url.href);
  } catch (err) {
    console.error('Microsoft OAuth callback failed:', err);
    res.status(502).send('Failed to complete Microsoft sign-in. Please try connecting again.');
  }
});
