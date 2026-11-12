import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import pkg from "../../package.json";
import { dbInfo } from "./db";
import { knownMigrations } from "./db/migrate";

/**
 * Operations: version, backups, restore, update check.
 *
 * Backups
 *  - embedded DB (PGlite): consistent snapshot via dumpDataDir() → data/backups/<ts>-<reason>.db.tar.gz
 *  - PostgreSQL: pg_dump --format=custom → <ts>-<reason>.pgdump   (needs pg_dump; managed DBs also have provider snapshots)
 *  - taken automatically before every database migration, daily by the scheduler, and on demand (admin / npm run backup)
 *  - rotation: newest BACKUP_KEEP (default 14) are kept; pre-update backups are kept at least 30 days
 * Restore
 *  - embedded: scheduled from admin or `npm run restore -- <file>`, applied at the next start (old DB kept as db.replaced-<ts>)
 *  - PostgreSQL: `npm run restore -- <file>` (pg_restore --clean)
 */
export const APP_VERSION: string = pkg.version;

export const dataDir = () => (process.env.VERCEL ? "/tmp" : join(process.cwd(), "data"));
export const backupDir = () => process.env.BACKUP_DIR ?? join(dataDir(), "backups");
const RESTORE_REQUEST = () => join(dataDir(), "restore-request.json");

export type Backup = { name: string; size: number; createdAt: string; reason: string; kind: "embedded" | "postgres"; version: string };

const stamp = () => new Date().toISOString().replace(/[:.]/g, "-").replace("Z", "");
const safe = (s: string) => s.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").slice(0, 60);

export async function createBackup(reason = "manual"): Promise<Backup> {
  const info = dbInfo();
  if (!info) throw new Error("database not connected");
  mkdirSync(backupDir(), { recursive: true });
  const base = `${stamp()}-${safe(reason)}`;
  let name: string;
  if (info.kind === "embedded") {
    name = `${base}.db.tar.gz`;
    const blob = await info.client.dumpDataDir("gzip");
    writeFileSync(join(backupDir(), name), Buffer.from(await blob.arrayBuffer()), { mode: 0o600 });
  } else {
    name = `${base}.pgdump`;
    await run("pg_dump", ["--format=custom", "--no-owner", `--file=${join(backupDir(), name)}`, info.url]);
  }
  const meta: Backup = { name, size: statSync(join(backupDir(), name)).size, createdAt: new Date().toISOString(), reason, kind: info.kind, version: APP_VERSION };
  writeFileSync(join(backupDir(), `${name}.json`), JSON.stringify({ ...meta, migrations: knownMigrations }, null, 2));
  rotate();
  return meta;
}

export function listBackups(): Backup[] {
  if (!existsSync(backupDir())) return [];
  return readdirSync(backupDir())
    .filter((f) => f.endsWith(".json"))
    .map((f) => { try { return JSON.parse(readFileSync(join(backupDir(), f), "utf8")) as Backup; } catch { return null; } })
    .filter((b): b is Backup => !!b && existsSync(join(backupDir(), b.name)))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export const backupPath = (name: string) => {
  if (!/^[\w.-]+\.(db\.tar\.gz|pgdump)$/.test(name)) throw new Error("invalid backup name");
  const p = join(backupDir(), name);
  if (!existsSync(p)) throw new Error("backup not found");
  return p;
};

function rotate() {
  const keep = Number(process.env.BACKUP_KEEP ?? 14);
  const monthAgo = Date.now() - 30 * 864e5;
  listBackups().slice(keep).forEach((b) => {
    if (b.reason.startsWith("pre-update") && Date.parse(b.createdAt) > monthAgo) return;
    rmSync(join(backupDir(), b.name), { force: true });
    rmSync(join(backupDir(), `${b.name}.json`), { force: true });
  });
}

/** Daily safety net (scheduler job "backup"). */
export async function backupIfDue() {
  const hours = Number(process.env.BACKUP_INTERVAL_HOURS ?? 24);
  const last = listBackups()[0];
  if (hours <= 0 || process.env.VERCEL) return { ok: true, message: "automatic backups off" };
  if (last && Date.now() - Date.parse(last.createdAt) < hours * 3600e3) return { ok: true, message: `last backup ${last.name}` };
  const b = await createBackup("daily");
  return { ok: true, message: `backup ${b.name} (${Math.round(b.size / 1024)} KB)` };
}

/* ── Restore ─────────────────────────────────────────────────────────── */

/** Embedded DB: schedule a restore that is applied before the database opens at the next start. */
export function requestRestore(name: string) {
  backupPath(name);
  if (!name.endsWith(".db.tar.gz")) throw new Error("only embedded-database backups can be restored from the admin — use `npm run restore` for PostgreSQL");
  writeFileSync(RESTORE_REQUEST(), JSON.stringify({ name, requestedAt: new Date().toISOString() }));
}
export const pendingRestore = (): { name: string } | null => (existsSync(RESTORE_REQUEST()) ? JSON.parse(readFileSync(RESTORE_REQUEST(), "utf8")) : null);
export const cancelRestore = () => rmSync(RESTORE_REQUEST(), { force: true });

/** Called by the DB layer before PGlite opens its directory. */
export async function applyPendingRestore(dir: string) {
  const req = pendingRestore();
  if (!req) return;
  const file = backupPath(req.name);
  const aside = `${dir}.replaced-${stamp()}`;
  if (existsSync(dir)) renameSync(dir, aside);
  const { PGlite } = await import("@electric-sql/pglite");
  const client = new PGlite(dir, { loadDataDir: new Blob([readFileSync(file)]) });
  await client.query("select 1");
  await client.close();
  cancelRestore();
  console.log(`[restore] database restored from ${req.name} (previous database kept at ${aside})`);
}

/** CLI restore for PostgreSQL (pg_restore). */
export async function restorePostgres(url: string, name: string) {
  await run("pg_restore", ["--clean", "--if-exists", "--no-owner", `--dbname=${url}`, backupPath(name)]);
}

/* ── Update check ────────────────────────────────────────────────────── */

let updateCache: { at: number; value: { latest: string; url: string } | null } | null = null;
/** Latest published release (GitHub). UPDATE_REPO=owner/repo · UPDATE_REPO=off to disable. Cached 12 h, never throws. */
export async function latestRelease() {
  const repo = process.env.UPDATE_REPO ?? "lucadesimoni/vine-import-shop";
  if (repo === "off") return null;
  if (updateCache && Date.now() - updateCache.at < 12 * 3600e3) return updateCache.value;
  let value: { latest: string; url: string } | null = null;
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, { headers: { Accept: "application/vnd.github+json" }, signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      const r = (await res.json()) as { tag_name: string; html_url: string };
      value = { latest: r.tag_name.replace(/^v/, ""), url: r.html_url };
    }
  } catch { /* offline / private repo → no notice */ }
  updateCache = { at: Date.now(), value };
  return value;
}

/** semver a > b */
export function newer(a: string, b: string) {
  const pa = a.split(/[.-]/).map(Number), pb = b.split(/[.-]/).map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  return false;
}

function run(cmd: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => (err += d));
    p.on("error", (e) => reject(new Error(`${cmd} not available (${e.message})`)));
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} failed: ${err.trim().slice(0, 300)}`))));
  });
}
