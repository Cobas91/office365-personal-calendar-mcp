import { config, msAuthorizationEndpoint, msRedirectUri, msTokenEndpoint } from '../config.js';

export interface MsTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

/** Builds the Microsoft v2.0 /authorize URL for the initial browser redirect. */
export function buildMsAuthorizeUrl(params: { state: string; scopes: string[] }): string {
  const url = new URL(msAuthorizationEndpoint);
  url.search = new URLSearchParams({
    client_id: config.MS_CLIENT_ID,
    response_type: 'code',
    redirect_uri: msRedirectUri,
    response_mode: 'query',
    scope: params.scopes.join(' '),
    state: params.state
  }).toString();
  return url.href;
}

async function postForm(body: URLSearchParams): Promise<MsTokenResponse> {
  const response = await fetch(msTokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Microsoft token endpoint returned ${response.status}: ${text}`);
  }
  return (await response.json()) as MsTokenResponse;
}

/** Exchanges the Microsoft authorization code (received on our own callback route) for tokens. */
export function exchangeMsAuthorizationCode(code: string): Promise<MsTokenResponse> {
  return postForm(
    new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: config.MS_CLIENT_ID,
      client_secret: config.MS_CLIENT_SECRET,
      code,
      redirect_uri: msRedirectUri
    })
  );
}

/** Refreshes a Microsoft access token using the stored Microsoft refresh token. */
export function refreshMsAccessToken(refreshToken: string): Promise<MsTokenResponse> {
  return postForm(
    new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: config.MS_CLIENT_ID,
      client_secret: config.MS_CLIENT_SECRET,
      refresh_token: refreshToken
    })
  );
}
