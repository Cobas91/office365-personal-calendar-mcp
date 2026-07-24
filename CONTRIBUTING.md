# Contributing

Thanks for considering a contribution!

## Local setup

```bash
npm install
cp .env.example .env   # fill in a test Azure App Registration's values
npm run dev
```

Node.js **>= 22.13.0** is required (this project uses the built-in `node:sqlite` module).

## Before opening a PR

```bash
npm run lint
npm run typecheck
npm run format:check
npm test
npm run build
```

CI runs the same checks on every push/PR (`.github/workflows/ci.yml`).

## Branching & commits

- `main` is the protected default branch; work on a feature branch and open a PR (CI must pass
  before merging, even as a solo maintainer).
- Use [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`,
  `chore:`, ...) so changelogs can eventually be generated automatically.

## Architecture Decision Records (ADRs)

Any non-trivial architectural choice, library swap, or deviation from an existing decision gets
a new file in `docs/adr/`, numbered sequentially (never renumber or delete an old one - if a
decision is superseded, add a new ADR that says so and references the old one). Copy the
structure of an existing ADR (Kontext / Entscheidung / Alternativen / Konsequenzen). Update
[CLAUDE.md](CLAUDE.md) in the same PR if the change affects conventions or the current status.

## Adding a new MCP tool

1. Add a file in `src/tools/`, following the pattern in `src/tools/listEvents.ts` (Zod
   `inputSchema`, `withToolErrorHandling`, `getGraphClient(extra)`).
2. Register it in `src/tools/index.ts`.
3. If it needs a new Graph endpoint, add a method to `src/graph/client.ts` - don't call `fetch`
   against Graph anywhere else.
4. Add/extend a test under `test/`.
