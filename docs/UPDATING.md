# Updating & rolling back

**Short version:** install the new version and restart.
- The shop takes a backup automatically before it changes the database.
- If anything goes wrong, go back to the previous version and restore that backup.

## Before you update

1. Read the release notes in [CHANGELOG.md](../CHANGELOG.md).
   - **PATCH** and **MINOR** releases need no manual steps.
   - **MAJOR** releases list their manual steps under *Upgrade notes*.
2. Optional: **Admin › System › Backup jetzt erstellen**, then download it for an off-site copy.

## Update

| Installation | Steps |
|---|---|
| **Docker / Compose** | Pull the new image (or `git pull`), then `docker compose up -d --build`. Data stays in the `shop-data` volume |
| **Release archive** (Hostpoint, VPS, Passenger) | Unpack the new release over the old folder, then `./deploy/install.sh`. `data/` and `.env` are kept |
| **Elestio / Render / Railway** | Push to the connected branch (or click *Redeploy*) |
| **Vercel** | Push to the production branch. Use PostgreSQL (`DATABASE_URL`) for persistent data |

On the first start of the new version, the shop:
1. writes a backup named `pre-update-<migration>` into `data/backups/` (PostgreSQL: via `pg_dump`);
2. applies the database migrations;
3. starts normally. **Admin › System** shows the new version.

If the automatic backup fails, the update stops before any change is made. With managed PostgreSQL that has its own snapshots, set `MIGRATE_WITHOUT_BACKUP=1` to rely on those.

## Roll back

1. Start the **previous version** again (previous image tag or release archive).
2. It refuses to start against the already upgraded database and names the problem. Restore the pre-update backup:
   - **Embedded database:** `npm run restore -- <pre-update-backup-file>`, then start. On Docker: `docker compose run --rm shop npm run restore -- <file>`. The replaced database is kept as `data/db.replaced-<timestamp>`.
   - **PostgreSQL:** `npm run restore -- <file>` (uses `pg_restore --clean`), or restore your provider's snapshot.
3. Start the shop.

`npm run restore` without arguments lists the available backups.

## Backups in normal operation

- **Daily automatic backup.** Change the interval with `BACKUP_INTERVAL_HOURS`; `0` turns it off.
- **Retention.** The newest 14 backups are kept (`BACKUP_KEEP`); pre-update backups are kept for at least 30 days.
- **Location.** Backups go to `data/backups/`, or to `BACKUP_DIR`. Copy them off the server regularly, for example by downloading from Admin › System.
- **Restore from the admin** (embedded database only): **Admin › System › Wiederherstellen** schedules the restore; it is applied at the next restart.

## Versioning & releases (for maintainers)

Semantic versioning (see the top of [CHANGELOG.md](../CHANGELOG.md)). Every change goes into `## [Unreleased]` with its PR; CI checks the changelog and the translations.

1. `npm run version:bump -- minor` (or `patch` / `major`). This moves the *Unreleased* entries into `## [x.y.z] - date`, updates `package.json` and commits "Release vx.y.z".
2. Merge or push to `main`. The **Release** workflow then:
   - tags `vx.y.z`;
   - publishes the GitHub release with the changelog section and `shop-x.y.z.tar.gz`;
   - pushes the Docker image `ghcr.io/<org>/<repo>:x.y.z` and `:latest`.

   Already-released versions are skipped. Pushing a tag by hand works too.
3. Vercel deploys `main` to production automatically. Installations show the new version under **Admin › System**.
