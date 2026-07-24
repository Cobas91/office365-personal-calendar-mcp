# outlook-calendar-mcp

A self-hostable, open-source **remote MCP server** that connects Claude (or any
[MCP](https://modelcontextprotocol.io)-compatible client) to a **Microsoft 365 / Outlook
calendar** over OAuth, using the Microsoft Graph API - including personal Microsoft accounts and
shared calendars such as a Microsoft 365 Family group calendar.

## What is this for?

Out of the box, Claude has no way to see or change your Outlook/Microsoft 365 calendar. This
project turns your calendar into a **Claude connector**: once it's set up, Claude can read and
manage your events in plain conversation, instead of you switching to Outlook/the calendar app
yourself.

Because it's a _remote_ MCP server (you host it once, centrally), it works everywhere you use
Claude - desktop, web, and the **mobile app** - without your computer needing to be turned on or
running anything locally. You connect it once in Claude's settings, and from then on every Claude
conversation (any device) can use it.

Typical things it's useful for:

- **"What's on my calendar this week?"** - ask instead of opening the calendar app.
- **Shared/family calendars**: Microsoft 365 Family plans expose a shared family calendar as just
  another calendar in your account. Claude can read _and write_ to it like any other calendar -
  e.g. "Add swim lessons every Tuesday at 5pm to the family calendar."
- **Scheduling from conversation**: "I just agreed to meet Sarah for coffee Thursday at 10 -
  add that to my calendar" - no app-switching, no manual data entry.
- **Quick edits/cancellations**: "Move my 3pm to 4pm" or "Cancel the dentist appointment
  tomorrow" - Claude finds the event and changes/removes it.
- **Personal use, not enterprise**: this is meant for individuals and families self-hosting their
  own instance, not a multi-tenant SaaS - see "Non-goals" below.

It intentionally does **not** touch email, files, or Teams - only calendars - and every Microsoft
token stays on your own server; Claude only ever holds its own opaque token for talking to your
server, never a real Microsoft credential (see
[docs/adr/0001-oauth-third-party-proxy.md](docs/adr/0001-oauth-third-party-proxy.md)).

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

### Behind an existing reverse proxy (e.g. Traefik)

If your host already runs Traefik (or another reverse proxy) on ports 80/443, use
`docker-compose.traefik.yml` instead - it skips the bundled Caddy service and joins an existing
external Docker network with Traefik router labels:

```bash
docker compose -f docker-compose.traefik.yml --env-file .env.prod up -d --build
```

Set `TRAEFIK_NETWORK` and `TRAEFIK_CERTRESOLVER` in your env file if they differ from the
defaults (`public_access` / `letsencrypt`). See
[docs/adr/0005-traefik-integration-for-shared-vps.md](docs/adr/0005-traefik-integration-for-shared-vps.md).

### Locally, without Docker

```bash
npm install
npm run build
npm start        # or: npm run dev
```

Requires Node.js **>= 22.13.0**.

## Connecting Claude

### 1. Add the connector

1. In Claude, go to **Settings -> Connectors -> Add custom connector**.
2. Give it any name (e.g. "Outlook Calendar").
3. For the URL, enter your server's MCP endpoint: `https://<your-domain>/mcp`.
4. Click **Add** / **Connect**.

Claude registers itself against your server automatically (OAuth Dynamic Client Registration -
no manual client ID/secret needed in the normal case). If registration fails with an error like
_"Registration with the O365-Private authentication service failed"_, your server has
`DCR_BOOTSTRAP_TOKEN` set - Claude's connector UI currently has no field to send that header
during registration, so leave `DCR_BOOTSTRAP_TOKEN` empty for use with Claude (see
[docs/adr/0004-dcr-access-protection.md](docs/adr/0004-dcr-access-protection.md) for the
trade-off this implies).

### 2. Sign in to Microsoft

After adding the connector, Claude opens a Microsoft sign-in window. Sign in with the Microsoft
account whose calendar you want Claude to access, and accept the consent screen (it will list the
`Calendars.ReadWrite` permission - this is the same permission Outlook's own mobile/desktop apps
use). Your Microsoft credentials go directly to `login.microsoftonline.com`, never to this server
or to Claude - see the OAuth flow in
[docs/adr/0001-oauth-third-party-proxy.md](docs/adr/0001-oauth-third-party-proxy.md).

Once consent completes, Claude redirects back and the connector shows as connected. This is a
one-time step per Microsoft account - Claude keeps working after this without asking you to sign
in again (tokens refresh automatically server-side).

### 3. Try it

Start with a read-only prompt to confirm it's working:

> "List my calendars"

You should get back your default calendar, plus any shared calendars (e.g. a Microsoft 365 Family
calendar) that show up in your Outlook/Outlook.com account. From here, just talk to Claude
naturally - it decides which of the six underlying tools to call:

| What you want                  | Example prompt                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------ |
| See what calendars exist       | "What calendars do I have?" / "Is there a family calendar?"                          |
| Check upcoming events          | "What's on my calendar this week?" / "Anything on the family calendar this weekend?" |
| Look up one event's details    | "What time exactly is the dentist appointment tomorrow?"                             |
| Create an event                | "Add 'Parent-teacher conference' to the family calendar next Tuesday 5-5:30pm"       |
| Create an event with attendees | "Schedule a 30-minute call with sarah@example.com Friday at 2pm"                     |
| Change an event                | "Move my 3pm meeting to 4pm" / "Rename tomorrow's call to 'Budget review'"           |
| Cancel/delete an event         | "Cancel the dentist appointment on the 12th"                                         |

A few tips that make this work more reliably:

- **Name the calendar** when it matters ("on the family calendar", "on my personal calendar") -
  otherwise Claude may need to ask, or default to your primary calendar.
- **Give a date/time range** for "what's coming up" questions ("this week", "next Monday",
  "between now and the 15th") - the underlying tool needs a start and end time.
- **Mention the time zone** if you're not in the server's assumed default (`UTC`) - e.g. "5pm
  Europe/Berlin time" - Claude will pass it through to Microsoft Graph correctly.
- If Claude can't find an event by description, ask it to list events in that time range first
  so you can point at the right one.

### Troubleshooting

- **"Registration ... failed" when adding the connector**: see step 1 above -
  `DCR_BOOTSTRAP_TOKEN` must be empty for Claude specifically.
- **"Microsoft rejected this request" / asked to reconnect**: your Microsoft consent expired or
  was revoked (e.g. you changed your Microsoft password, or removed the app under
  [account.live.com/consent/Manage](https://account.live.com/consent/Manage) /
  Entra "Enterprise applications"). Remove and re-add the connector in Claude to sign in again.
- **A shared calendar doesn't show up**: it only appears if it's already visible as a calendar in
  the signed-in account's own Outlook (i.e. you've already accepted the Microsoft 365 Family
  invite, or the calendar was otherwise shared with and added by that account).
- **Disconnecting**: removing the connector in Claude's settings stops Claude from calling your
  server, but doesn't revoke the Microsoft consent by itself - do that from
  [account.live.com/consent/Manage](https://account.live.com/consent/Manage) (personal accounts)
  or your Entra admin center (work/school accounts) if you want to fully revoke access.

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
