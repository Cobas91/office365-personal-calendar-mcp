# outlook-calendar-mcp

A self-hostable, open-source **remote MCP server** that connects Claude (or any
[MCP](https://modelcontextprotocol.io)-compatible client) to a **Microsoft 365 / Outlook
calendar** over OAuth, using the Microsoft Graph API - including personal Microsoft accounts and
shared calendars such as a Microsoft 365 Family group calendar.

## Features

- `list_calendars`, `list_events`, `get_event`, `create_event`, `update_event`, `delete_event`
- Works with personal Microsoft accounts (MSA) as well as Microsoft Entra / work accounts
  (`MS_TENANT=common` by default)
- You host it: your Microsoft tokens never leave your own server (see
  [docs/adr/0001-oauth-third-party-proxy.md](docs/adr/0001-oauth-third-party-proxy.md))
- Ships as a small Docker Compose stack (this server + Caddy for automatic HTTPS)

### Non-goals (v1)

- No email, Teams, or file access - calendar only
- No aggregation across multiple Microsoft accounts in a single tool call
- No free/busy lookups against external attendees

## Quick start (Azure App Registration)

1. Go to [portal.azure.com](https://portal.azure.com) -> **App registrations** -> **New
   registration**.
2. Name it anything. Under **Supported account types**, choose **"Accounts in any organizational
   directory and personal Microsoft accounts"**.
3. Under **Authentication** -> **Add a platform** -> **Web**, add the redirect URI:
   `https://<your-domain>/oauth/microsoft/callback`.
4. Under **Certificates & secrets**, create a new client secret.
5. Copy the **Application (client) ID** and the client secret value - you'll need them below.

## Running it

```bash
git clone https://github.com/<your-account>/outlook-calendar-mcp.git
cd outlook-calendar-mcp
cp .env.example .env
```

Fill in `.env`:

- `MCP_BASE_URL` / `MCP_DOMAIN` - the public URL/domain this server will be reachable at
- `MS_CLIENT_ID` / `MS_CLIENT_SECRET` - from the Azure App Registration above
- `TOKEN_ENCRYPTION_KEY` - generate with:
  `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
- `DCR_BOOTSTRAP_TOKEN` - optional, see
  [docs/adr/0004-dcr-access-protection.md](docs/adr/0004-dcr-access-protection.md)

### With Docker Compose (recommended for a real deployment)

```bash
docker compose up -d --build
```

Caddy will automatically obtain a TLS certificate for `MCP_DOMAIN` and reverse-proxy to the
server. Make sure the domain's DNS already points at this host before starting.

### Locally, without Docker

```bash
npm install
npm run build
npm start        # or: npm run dev
```

Requires Node.js **>= 22.13.0**.

## Connecting Claude

In Claude, go to **Settings -> Connectors -> Add custom connector** and enter your server's URL
(`https://<your-domain>/mcp`). Claude will register itself (Dynamic Client Registration), open a
Microsoft sign-in popup, and once you've signed in and consented, the calendar tools become
available - including on mobile, without needing your computer running.

Try: _"What's on the family calendar this weekend?"_

## Development

```bash
npm install
npm run dev            # tsx watch
npm test                # vitest
npm run lint
npm run typecheck
npm run format:check
npx @modelcontextprotocol/inspector   # manual protocol-level testing against a running server
```

See [CLAUDE.md](CLAUDE.md) for architecture notes and conventions, and
[docs/adr/](docs/adr/) for the reasoning behind every non-obvious decision.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
