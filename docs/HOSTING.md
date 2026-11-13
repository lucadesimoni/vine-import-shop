# Kundenshops betreiben (Shop-Host)

Viele Kundenshops auf **einem Server**, schlank und ohne Monitoring-Stack:

| Baustein | Aufgabe | RAM |
|---|---|---|
| Caddy | HTTPS für alle Kundendomains (Let's Encrypt, automatisch erneuert), HTTP/3, Komprimierung | ~15 MB |
| PostgreSQL 17 | eine Datenbank und ein Datenbankbenutzer pro Shop, nur im internen Docker-Netz | ~100 MB |
| ein Container pro Shop | das Shop-Image in der jeweils gepinnten Version | ~50–150 MB |
| `shopctl` (Bash) + systemd-Timer | neuer Kunde, Updates mit Rollback, Backups, Monitoring, Statusseite | — |

Faustregel: 2 vCPU / 4 GB RAM für 10–20 Shops, z. B. Infomaniak VPS Cloud, cloudscale, Exoscale oder Hostpoint VPS (Daten in der Schweiz).

## Einrichtung (einmal)

```bash
# Debian 12 / Ubuntu 22.04+, als root
git clone https://github.com/lucadesimoni/vine-import-shop && cd vine-import-shop
./deploy/host/bootstrap.sh          # Docker, Firewall, rclone, Timer, Caddy + PostgreSQL
nano /srv/shophost/shopctl.env      # E-Mail, Statusseite, SMTP für Alarme, Off-site-Speicher, Passphrase
shopctl init                        # übernimmt die Einstellungen, zeigt einmalig das Statusseiten-Passwort
docker login ghcr.io                # GitHub-Token mit nur «read:packages» (das Image ist privat)
```

DNS: `status.<deine-domain>` (A/AAAA) auf den Server zeigen lassen.

## Neuer Kunde: ein Befehl

Auf deinem Rechner (der private Lizenzschlüssel verlässt ihn nie):

```bash
npm run customer:new -- --host root@shops.example.ch --name muster \
  --domains shop.muster.ch,b2b.muster.ch --admin info@muster.ch \
  --licensee "Weinhandel Muster AG" --plan business --expires 2027-12-31
```

Ablauf:
1. Lizenzschlüssel für die Domains ausstellen.
2. Per SSH auf dem Server `shopctl new`: Datenbank anlegen, Secrets erzeugen, Container starten und Gesundheit prüfen.
3. HTTPS für alle Domains einrichten.
4. Admin-Login ausgeben. Das Passwort muss beim ersten Login geändert werden.

Der Kunde setzt die DNS-Einträge seiner Domains auf den Server. Das Zertifikat entsteht dann automatisch.

Danach Mail (SMTP) und Zahlungsanbieter des Kunden eintragen: `shopctl env muster`, anschliessend `shopctl restart muster`.

Direkt auf dem Server geht es auch ohne Lizenzschlüssel: `shopctl new muster --domains shop.muster.ch --admin info@muster.ch --licence <KEY>`.

## Alltag

| Befehl | Wirkung |
|---|---|
| `shopctl list` | Shops, Version, Zustand, Domains |
| `shopctl domains muster shop.muster.ch,www.muster.ch` | Domains ändern (HTTPS folgt; Lizenz ggf. neu ausstellen) |
| `shopctl update muster --to v1.11.0` / `shopctl update --all` | Update einzelner/aller Shops |
| `shopctl backup muster` · `shopctl restore muster <datei>` | Backup / Wiederherstellung (auch `.enc` aus dem Off-site-Speicher) |
| `shopctl logs muster` · `shopctl restart muster` · `shopctl env muster` | Betrieb |
| `shopctl rm muster [--purge]` | Abschlussbackup, entfernen (ohne `--purge` bleiben Daten und Datenbank) |

## Was automatisch läuft

| Wann | Was |
|---|---|
| alle 2 Minuten | **Monitoring**: `https://<domain>/api/health` jedes Shops. Nach 2 Fehlversuchen kommt eine Mail «DOWN» mit Fehler und letzten Logzeilen, bei Erholung «UP» (nur beim Wechsel, kein Dauerfeuer). Zusätzliche Warnungen: Zertifikat < 14 Tage, Disk ≥ 85 %, kein Backup seit 30 h. Die **Statusseite** `https://status.<domain>` (passwortgeschützt, statisches HTML) wird neu geschrieben. |
| 02:30 | **Backups** pro Shop: Datenbank (`pg_dump`), Uploads und Bilder, `.env`. Lokal 14 Tage, Backups vor Updates 60 Tage. Bei gesetztem `OFFSITE` zusätzlich **AES-256-verschlüsselt** auf S3 / R2 / Swiss Backup, dort 60 Tage. Unverschlüsselt wird nie hochgeladen. |
| 04:15 | **Updates** nach `UPDATE_POLICY`: `minor` = Funktionen und Fixes, `patch` = nur Fixes, `off` = manuell. Major-Versionen kommen nie automatisch. Ablauf pro Shop: Backup → neue Version → Gesundheitsprüfung. Schlägt sie fehl: Datenbank aus dem Backup zurück, alte Version starten, Mail. |
| laufend | Docker startet abgestürzte Shops neu; Caddy erneuert Zertifikate; das Betriebssystem installiert Sicherheitsupdates (`unattended-upgrades`). |

**Fällt der ganze Server aus, kann er selbst keine Mail senden.** Dafür `HEARTBEAT_URL` setzen: Ein kostenloser «Dead man's switch» (z. B. healthchecks.io, Prüfintervall 2 min, Karenz 10 min) meldet sich, wenn die Pings ausbleiben.

## Wiederherstellung im Notfall

- **Einzelner Shop:** `shopctl restore muster /srv/shophost/backups/muster/<datei>.tar.gz`. Vorher wird automatisch ein Sicherheitsbackup des aktuellen Stands angelegt.
- **Server verloren:**
  1. neuen Server mit `bootstrap.sh` aufsetzen;
  2. `shopctl.env` mit derselben `BACKUP_PASSPHRASE` einrichten;
  3. je Shop `shopctl new` mit denselben Domains;
  4. je Shop `shopctl restore` mit der `.enc`-Datei aus dem Off-site-Speicher;
  5. DNS auf den neuen Server umstellen.

Die Passphrase gehört in den Passwortmanager: Ohne sie lassen sich die Off-site-Backups nicht entschlüsseln.

## Sicherheit

- Die Firewall lässt nur 22, 80 und 443 durch. PostgreSQL ist nur im internen Docker-Netz erreichbar, jeder Shop hat einen eigenen Datenbankbenutzer ohne Zugriff auf andere Datenbanken.
- Shops laufen als Benutzer `node` (nicht root) mit RAM- und CPU-Limit (`SHOP_MEMORY`, `SHOP_CPUS`).
- Secrets liegen nur auf dem Server (`/srv/shophost`, Rechte 600/700).
