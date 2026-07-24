# 0002. SQLite via Node's built-in `node:sqlite`, not `better-sqlite3`

Status: Accepted
Date: 2026-07-24

## Kontext

Der Plan sah `better-sqlite3` als Token-Storage vor (embedded, kein separater DB-Container).
Beim Implementieren scheiterte `npm install` auf der Entwicklungsmaschine, weil
`better-sqlite3` ein natives Addon ist und für die dort installierte Node-Version kein
vorgebautes Binary verfügbar war - `node-gyp` versucht daraufhin, aus dem Quellcode zu bauen,
was eine funktionierende Python-Toolchain voraussetzt (auf vielen Windows-Maschinen, gerade bei
Nutzern ohne Entwickler-Setup, nicht gegeben).

Node.js bringt seit v22.5.0 ein eingebautes `node:sqlite`-Modul mit (API: `DatabaseSync`,
`StatementSync`), das seit v22.13.0 ohne `--experimental-sqlite`-Flag nutzbar ist (weiterhin als
"experimental" markiert, siehe Node-Changelog). Es wurde lokal getestet: Named Parameters
(`$name`), `PRAGMA`-Statements und synchrone `get`/`all`/`run`-Aufrufe funktionieren wie benötigt.

## Entscheidung

Es wird `node:sqlite` (`DatabaseSync`) statt `better-sqlite3` verwendet. `package.json` verlangt
`"engines": { "node": ">=22.13.0" }`, damit kein Nutzer das `--experimental-sqlite`-Flag setzen
muss.

## Alternativen (verworfen)

- **`better-sqlite3` wie im Plan:** Für die meisten Deployments (Docker mit `node:22-alpine`)
  gibt es vermutlich passende Prebuilds, aber nicht garantiert für jede Architektur/Node-Version
  jedes Self-Hosters, der eventuell ohne Docker direkt auf einem Host läuft. Ein zusätzlicher
  natives-Modul-Build-Schritt (inkl. Python/`node-gyp`) erhöht die Einstiegshürde für ein
  Open-Source-Projekt spürbar.
- **Separater Datenbank-Container (Postgres/MySQL):** widerspricht explizit dem Ziel "embedded,
  kein separater DB-Container" aus dem Plan.

## Konsequenzen

- `node:sqlite` ist als "experimental" markiert; die API kann sich in einer zukünftigen
  Node-Minor-Version noch ändern. Sollte das passieren, ist die Datenzugriffsschicht auf
  `src/db.ts` und die Call-Sites in `src/auth/*` und `src/graph/client.ts` konzentriert - ein
  Wechsel zurück zu `better-sqlite3` oder einer anderen Bibliothek betrifft nur diese Dateien.
- Kein `node-gyp`/Python/Build-Toolchain-Requirement für Self-Hoster oder im Docker-Image -
  kleineres Image, einfacheres `npm install`.
- Named Parameters müssen mit `$name` (nicht `@name` wie bei `better-sqlite3`) prefixed werden -
  reine Stilkonvention innerhalb dieses Projekts, siehe CLAUDE.md.
