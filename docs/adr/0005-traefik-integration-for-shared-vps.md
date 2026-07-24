# 0005. Optional Traefik-integrated compose file for hosts with an existing reverse proxy

Status: Accepted
Date: 2026-07-24

## Kontext

Abschnitt 12 des ursprünglichen Plans nennt als angenommenen Default: "Caddy als eigenständiger
Reverse-Proxy im Compose-Stack (nicht in bestehende Infrastruktur integriert)". Beim ersten
realen Deployment auf einem Self-Hosting-VPS stellte sich heraus, dass dort bereits ein anderer
Reverse-Proxy (Traefik) auf Port 80/443 läuft und mehrere andere, unabhängige Projekte darüber
bedient. Der Standard-`docker-compose.yml`-Stack dieses Projekts würde mit seinem eigenen
Caddy-Service beim Binden von Port 80/443 fehlschlagen bzw. mit dem bestehenden Reverse-Proxy
kollidieren - ein Szenario, das für jeden Self-Hoster mit bereits laufender Infrastruktur
(Traefik, nginx-proxy-manager o. ä.) relevant sein kann, nicht nur für diesen einen Fall.

## Entscheidung

Zusätzlich zum bestehenden `docker-compose.yml` (Standard: eigener Caddy, für Self-Hoster ohne
bestehenden Reverse-Proxy) gibt es `docker-compose.traefik.yml`: derselbe `mcp`-Service, aber
ohne Caddy, stattdessen mit Traefik-Labels und Anbindung an ein externes Docker-Netzwerk, das
Traefik bereits überwacht. Netzwerkname, Entrypoint und Certresolver sind per Env-Var
konfigurierbar (`TRAEFIK_NETWORK`, `TRAEFIK_CERTRESOLVER`), mit gängigen Defaults
(`public_access` / `letsencrypt`), passend zu typischen Traefik-Docker-Provider-Setups.

## Alternativen (verworfen)

- **Eigenen Caddy trotzdem auf anderen Ports laufen lassen** (z. B. 8443/8080) und den
  bestehenden Reverse-Proxy manuell weiterleiten lassen: unnötig doppelte TLS-Terminierung,
  zusätzliche Fehlerquelle.
- **Bestehende Reverse-Proxy-Konfiguration global anpassen**, um Caddy einzubinden: deutlich
  invasiver Eingriff in eine für andere Zwecke kritische Infrastrukturkomponente, die dieses
  Projekt nicht kontrolliert.
- **Nur ein `docker-compose.yml` mit Caddy pflegen und Self-Hoster mit bestehendem Reverse-Proxy
  selbst anpassen lassen:** unpraktisch für ein häufiges Deployment-Szenario (VPS, der bereits
  andere Dienste hostet).

## Konsequenzen

- Zwei Compose-Varianten müssen gepflegt werden; beide teilen sich dasselbe `Dockerfile` und
  denselben `mcp`-Service-Kern, unterscheiden sich nur im Reverse-Proxy-Teil.
- README dokumentiert beide Pfade.
