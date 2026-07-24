# CLAUDE.md

Remote MCP server that lets Claude (or any MCP client) read/write a Microsoft 365 / Outlook
calendar - including shared calendars like a Family group calendar - via the Microsoft Graph API.

**Status:** All of Phases 0-6 from the original implementation plan are done. `v0.1.0` is
tagged. Not yet deployed to a production VPS (that's on the user, see README "Deployment").

## Tech stack

TypeScript (Node >=22.13.0, ESM), Express 5, `@modelcontextprotocol/sdk` (Streamable HTTP +
custom OAuth provider), `node:sqlite` (built-in, see
[docs/adr/0002-sqlite-token-storage.md](docs/adr/0002-sqlite-token-storage.md)), Zod, Vitest,
ESLint/Prettier, Docker + Caddy. Full rationale: [docs/adr/](docs/adr/).

## How to run locally

```bash
npm install
cp .env.example .env   # fill in MS_CLIENT_ID/MS_CLIENT_SECRET/TOKEN_ENCRYPTION_KEY
npm run dev             # tsx watch, http://localhost:3000
npm test                 # vitest
npm run lint && npm run typecheck && npm run format:check
npx @modelcontextprotocol/inspector   # point it at http://localhost:3000/mcp to test manually
```

`TOKEN_ENCRYPTION_KEY`: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`

## Architecture in one paragraph

This server is its own OAuth Authorization Server towards MCP clients (DCR, PKCE, its own opaque
access/refresh tokens) and a plain OAuth client towards Microsoft, bridged by a custom
"double-hop" provider - see [docs/adr/0001-oauth-third-party-proxy.md](docs/adr/0001-oauth-third-party-proxy.md)
for why the SDK's stock `ProxyOAuthServerProvider` doesn't work here (Azure needs one fixed,
pre-registered redirect URI; the plan requires Microsoft tokens to stay server-side). The MCP
client never sees a Microsoft token, only ours (`src/auth/provider.ts`).

## Conventions (do not break without a new ADR)

- Never log tokens (Microsoft or MCP-issued), plaintext or otherwise.
- All Microsoft Graph calls go through `src/graph/client.ts` (`GraphClient`) - never call
  `fetch('https://graph.microsoft.com/...')` directly elsewhere.
- All Microsoft token reads go through `src/auth/msAccounts.ts` (`getValidMsAccessToken`) - it
  transparently refreshes; nothing else should read `ms_accounts` rows directly.
- SQLite named parameters use the `$name` syntax (`node:sqlite` convention), not `@name`
  (`better-sqlite3`'s convention - we don't use that library, see ADR 0002).
- New MCP tools go in `src/tools/`, one file per tool, registered in `src/tools/index.ts`, using
  the `withToolErrorHandling`/`getGraphClient` helpers from `src/tools/helpers.ts`.
- Any deviation from an existing ADR, or a new non-trivial architectural/library choice, gets its
  own `docs/adr/NNNN-*.md` in the same change, not as a follow-up.

## Known open points (intentionally deferred)

- `DCR_BOOTSTRAP_TOKEN` is optional; if unset, client registration is open. Fine for local
  testing, not recommended for a public deployment. See
  [docs/adr/0004-dcr-access-protection.md](docs/adr/0004-dcr-access-protection.md).
- No free/busy or multi-account aggregation (out of scope for v1, see README non-goals).
- `node:sqlite` is still Node's "experimental" API; if a future Node release breaks it, only
  `src/db.ts` and the SQL call-sites in `src/auth/*` need to change.
