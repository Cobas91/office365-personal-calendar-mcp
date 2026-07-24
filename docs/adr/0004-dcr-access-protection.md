# 0004. Optional bootstrap token gate on Dynamic Client Registration

Status: Accepted
Date: 2026-07-24

## Kontext

RFC 7591 Dynamic Client Registration (`POST /register`) ist per Design offen: jeder Client, der
die URL des MCP-Servers kennt, kann sich selbst registrieren. Für einen öffentlich erreichbaren
Server bedeutet das, dass fremde MCP-Clients kostenlos die eigene Instanz (und damit potenziell
Microsoft-Graph-Quota / Consent-Screens) mitnutzen könnten. Dieser Punkt war im Plan
(Abschnitt 5.1) explizit als offene, in der Session zu entscheidende Sicherheitsfrage markiert.

## Entscheidung

`POST /register` wird optional durch ein Bootstrap-Token geschützt: ist die Env-Var
`DCR_BOOTSTRAP_TOKEN` gesetzt, muss jede Registrierungs-Anfrage einen
`Authorization: Bearer <DCR_BOOTSTRAP_TOKEN>`-Header mitschicken (geprüft in `src/server.ts`,
vor dem Mount von `mcpAuthRouter`). Ist die Variable leer/nicht gesetzt, bleibt die Registrierung
offen (praktisch für lokale Entwicklung/Tests, im README als "nicht empfohlen für öffentliche
Deployments" markiert).

Der Bootstrap-Token schützt nur die Registrierung selbst; er wird nicht in den ausgestellten
MCP-Client-Credentials verwendet und muss nicht dauerhaft im MCP-Client hinterlegt werden -
einmal registriert, authentifiziert sich der Client über sein eigenes `client_id`/`client_secret`.

## Alternativen (verworfen)

- **DCR komplett deaktivieren** (`registerClient` nicht implementieren): würde MCP-Clients wie
  Claude zwingen, mit einer manuell verteilten `client_id` zu arbeiten - widerspricht dem
  "Deposit-and-run"-Ziel und der MCP-Spec-Empfehlung, DCR zu unterstützen.
- **IP-Allowlist statt Bootstrap-Token:** unpraktikabel für mobile Clients mit wechselnden IPs.
- **Rate-Limiting allein:** ist bereits durch die SDK-Registrierungs-Route aktiv (siehe
  `clientRegistrationHandler`-Default), verhindert aber keine gezielte Nutzung durch einen
  einzelnen unautorisierten Client, nur Massen-Abuse.

## Konsequenzen

- Self-Hoster, die die Instanz nur selbst nutzen wollen, sollten `DCR_BOOTSTRAP_TOKEN` setzen und
  ihn einmalig manuell an den MCP-Client übergeben (z. B. beim Einrichten des Custom Connectors
  in Claude, falls der Client das Mitschicken eines Headers beim initialen Registrierungsschritt
  erlaubt) oder die Registrierung nur temporär öffnen.
- Dieser Schutz verhindert keinen Missbrauch, wenn der Token geleakt wird - er ist ein einfacher
  Deposit-and-run-Kompromiss, kein vollständiges Zugriffsmanagement.

## Update (2026-07-24): Claude-Connector-UI unterstützt den Header nicht

Beim ersten realen Verbindungsversuch mit Claude ("Add custom connector") schlug die
DCR-Registrierung mit `invalid_client` fehl: Claudes UI bietet beim automatischen
Registrieren keine Möglichkeit, einen `Authorization`-Header mitzugeben (nur einen
optionalen, separaten "OAuth Client ID"-Fallback für bereits existierende Clients). Wer Claude
als MCP-Client verwendet, muss `DCR_BOOTSTRAP_TOKEN` daher aktuell leer lassen (offene
Registrierung, wie oben als Kompromiss beschrieben) - relevant vor allem, wenn die eigene
Instanz-URL nicht öffentlich bekannt/verlinkt ist. Self-Hoster mit MCP-Clients, die einen
Registrierungs-Header unterstützen, können den Bootstrap-Token weiterhin nutzen.
