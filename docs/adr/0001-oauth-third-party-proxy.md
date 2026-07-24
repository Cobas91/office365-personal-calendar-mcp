# 0001. OAuth third-party proxy with a custom double-hop provider

Status: Accepted
Date: 2026-07-24

## Kontext

Claude (und jeder andere MCP-Client) spricht OAuth 2.1 mit dem MCP-Server, nicht direkt mit
Microsoft. Laut MCP-Autorisierungs-Spec (2025-06-18) muss der MCP-Server dafür selbst als
Authorization Server auftreten (inkl. Dynamic Client Registration, RFC 7591, und Protected
Resource Metadata, RFC 9728) und gleichzeitig als OAuth-Client gegenüber Microsoft agieren.

Der ursprüngliche Plan sah vor, dafür direkt die `ProxyOAuthServerProvider`-Klasse aus
`@modelcontextprotocol/sdk` zu verwenden, die Authorize-/Token-Requests 1:1 an einen
Upstream-Server durchreicht (reines Pass-Through, inkl. Weiterreichen des MCP-Client-eigenen
`redirect_uri`).

Beim Implementieren zeigte sich, dass reines Pass-Through gegen Microsoft aus zwei Gründen
nicht funktioniert:

1. **Azure App Registrations verlangen exakte, vorab registrierte Redirect-URIs.** Ein
   beliebiger MCP-Client (z. B. Claude) bringt seine eigene Callback-URL mit; die direkt an
   Microsoft durchzureichen würde bei jedem MCP-Client, dessen Callback-URL nicht in der Azure
   App Registration hinterlegt ist, mit `redirect_uri_mismatch` fehlschlagen.
2. **Der Plan verlangt explizit, dass Microsoft-Refresh-Tokens verschlüsselt serverseitig in
   SQLite gespeichert werden** (Abschnitt 5.1 des Implementierungsplans) - das ist mit reinem
   Pass-Through nicht vereinbar, da dort der MCP-Client selbst das Microsoft-Token hält.

## Entscheidung

Es wird ein **custom `OAuthServerProvider`** implementiert (`src/auth/provider.ts`), der die
SDK-Typen (`OAuthServerProvider`, `OAuthRegisteredClientsStore`) implementiert, aber einen
"Double Hop" durchführt:

1. `authorize()` validiert den MCP-Client (PKCE, redirect_uri) lokal, legt eine kurzlebige
   Transaktion in SQLite ab (`auth_transactions`) und leitet den Browser zu Microsoft weiter -
   mit der **eigenen, fest registrierten** `redirect_uri`
   (`<MCP_BASE_URL>/oauth/microsoft/callback`), nicht der des MCP-Clients.
2. Microsoft leitet nach Login/Consent auf diese feste Callback-Route zurück
   (`src/auth/callbackRoute.ts`). Dort wird der Microsoft-Code gegen Tokens getauscht, die
   Tokens werden verschlüsselt in `ms_accounts` gespeichert (siehe [[0002-sqlite-token-storage]]),
   und es wird ein **eigener** Authorization Code ausgestellt.
3. Dieser eigene Code wird an den ursprünglichen `redirect_uri` des MCP-Clients weitergeleitet.
   Der Token-Endpoint (`exchangeAuthorizationCode`/`exchangeRefreshToken`) tauscht ihn gegen
   **eigene** opake Access-/Refresh-Tokens, die auf den gespeicherten Microsoft-Account
   verweisen (`mcp_tokens.ms_account_id`).

Die SDK-Helfer `mcpAuthRouter` (Metadata, DCR, Token-/Authorize-/Revoke-Routing) und
`requireBearerAuth` werden weiterhin genutzt - nur die `ProxyOAuthServerProvider`-Klasse selbst
wird durch die eigene Implementierung ersetzt.

Der MCP-Client sieht zu keinem Zeitpunkt ein echtes Microsoft-Token.

## Alternativen (verworfen)

- **Stock `ProxyOAuthServerProvider` 1:1 wie im Plan skizziert:** scheitert an Azure's
  Redirect-URI-Validierung für beliebige MCP-Clients und widerspricht der Anforderung,
  Microsoft-Tokens serverseitig zu halten.
- **Jede MCP-Client-Redirect-URI einzeln in der Azure App Registration whitelisten:** würde
  nur für vorab bekannte Clients (z. B. exakt Claude.ai) funktionieren, nicht generisch für
  "jeden MCP-Client" wie in Abschnitt 1 des Plans gefordert, und erfordert manuelle Pflege.
- **Kompletter Passthrough des Microsoft-Tokens ohne eigene AS-Rolle:** widerspricht der
  MCP-Spec-Empfehlung und birgt ein "confused deputy"-Risiko (der MCP-Client hätte ein Token
  mit vollem Microsoft-Graph-Zugriff in der Hand).

## Konsequenzen

- Mehr Code als ein reiner Config-Wrapper um `ProxyOAuthServerProvider` (eigene SQLite-Tabellen
  für Transaktionen, Codes und Tokens - siehe [[0002-sqlite-token-storage]]).
- Sauberere Sicherheitsgrenze: Widerruf eines MCP-Client-Tokens (`revokeToken`) trennt den
  Zugriff, ohne das zugrunde liegende Microsoft-Token anzufassen.
- Erfordert eine einzige, feste Redirect-URI in der Azure App Registration
  (`<MCP_BASE_URL>/oauth/microsoft/callback`) - unabhängig davon, wie viele/welche MCP-Clients
  sich registrieren.
