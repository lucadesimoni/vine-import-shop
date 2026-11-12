// npm run backup                → consistent backup into data/backups (or BACKUP_DIR)
// npm run backup -- --list      → list backups
import { getDb } from "../app/.server/db";
import { createBackup, listBackups } from "../app/.server/maintenance";

await getDb();
if (process.argv.includes("--list")) {
  for (const b of listBackups()) console.log(`${b.createdAt}  ${b.name}  ${Math.round(b.size / 1024)} KB  v${b.version}  (${b.reason})`);
} else {
  const b = await createBackup("manual");
  console.log(`✓ ${b.name} (${Math.round(b.size / 1024)} KB)`);
}
process.exit(0);
