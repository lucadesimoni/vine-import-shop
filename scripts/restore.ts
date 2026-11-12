// npm run restore -- <backup-file-name>
//   embedded DB: stop the shop first; the restore is applied now (previous DB kept as data/db.replaced-<timestamp>)
//   PostgreSQL:  pg_restore --clean into DATABASE_URL
import { applyPendingRestore, listBackups, requestRestore, restorePostgres } from "../app/.server/maintenance";

const name = process.argv[2];
if (!name) {
  console.log("Usage: npm run restore -- <name>\n\nAvailable backups:");
  for (const b of listBackups()) console.log(`  ${b.name}  (v${b.version}, ${b.reason}, ${b.createdAt})`);
  process.exit(1);
}
const url = process.env.DATABASE_URL?.trim();
if (url && /^postgres/.test(url)) await restorePostgres(url, name);
else {
  requestRestore(name);
  await applyPendingRestore(url?.replace(/^pglite:/, "") || `${process.cwd()}/data/db`);
}
console.log(`✓ restored ${name} — start the shop (or the matching version) again`);
process.exit(0);
