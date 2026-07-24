# 0003. MS_TENANT default `common`, not `consumers`

Status: Accepted
Date: 2026-07-24

## Kontext

Microsoft's `/oauth2/v2.0/authorize` und `/token` Endpunkte akzeptieren einen Tenant-Pfad-Teil:

- `consumers` - nur persönliche Microsoft-Konten (MSA)
- `organizations` - nur Microsoft-Entra-(Azure-AD-)Konten
- `common` - beide Kontotypen
- eine konkrete Tenant-ID - nur dieser eine Tenant

Der primäre Use Case (privater Family-Kalender) benötigt nur `consumers`. Der Plan soll aber
generisch genug sein, dass auch Business-/Entra-Nutzer ihre eigene Instanz betreiben können
(Sekundärziel, Abschnitt 1 des Plans).

## Entscheidung

`MS_TENANT` defaultet auf `common` (konfigurierbar via `.env`). Jeder Self-Hoster kann dies bei
Bedarf auf `consumers`, `organizations` oder eine feste Tenant-ID einschränken.

## Alternativen (verworfen)

- **Fest `consumers`:** würde Business-/Entra-Nutzer von vornherein ausschließen, obwohl der
  restliche Code (Graph-Calendar-Endpunkte, OAuth-Flow) identisch funktioniert.
- **Fest `organizations`:** würde den primären, privaten Use Case dieses Projekts ausschließen.

## Konsequenzen

- Azure App Registration muss mit "Accounts in any organizational directory and personal
  Microsoft accounts" angelegt werden (im README für Self-Hoster dokumentiert), sonst lehnt
  Microsoft `common` mit einem Konfigurationsfehler ab.
- Keine funktionale Auswirkung auf den Code - der Tenant ist nur Teil der Authorize-/Token-URL
  (`src/config.ts`).
