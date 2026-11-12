import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { randomBytes } from "node:crypto";

/**
 * Uploads: STORAGE_DRIVER=local (./data/uploads, served by /uploads/*) or
 * s3 (any S3-compatible bucket: AWS, Cloudflare R2, Exoscale SOS, Infomaniak …).
 */
// Serverless filesystems are read-only except /tmp → use STORAGE_DRIVER=s3 for persistent uploads there.
const LOCAL_DIR = process.env.UPLOAD_DIR ?? (process.env.VERCEL ? "/tmp/uploads" : join(process.cwd(), "data/uploads"));
const TYPES: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".avif": "image/avif", ".svg": "image/svg+xml", ".gif": "image/gif" };
const MAX = 8 * 1024 * 1024;

export async function saveUpload(file: File, folder = "media"): Promise<string> {
  const ext = extname(file.name).toLowerCase();
  if (!TYPES[ext] || ext === ".svg") throw new Error("Unsupported file type");
  if (file.size > MAX) throw new Error("File too large (max 8 MB)");
  const key = `${folder}/${Date.now().toString(36)}-${randomBytes(4).toString("hex")}${ext}`;
  const body = new Uint8Array(await file.arrayBuffer());

  if (process.env.STORAGE_DRIVER === "s3") {
    const { AwsClient } = await import("aws4fetch");
    const aws = new AwsClient({ accessKeyId: process.env.S3_ACCESS_KEY_ID!, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!, region: process.env.S3_REGION ?? "auto", service: "s3" });
    const res = await aws.fetch(`${process.env.S3_ENDPOINT}/${process.env.S3_BUCKET}/${key}`, { method: "PUT", body, headers: { "Content-Type": TYPES[ext] } });
    if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
    return `${process.env.S3_PUBLIC_URL?.replace(/\/$/, "")}/${key}`;
  }
  const path = join(LOCAL_DIR, key);
  await mkdir(join(LOCAL_DIR, folder), { recursive: true });
  await writeFile(path, body);
  return `/uploads/${key}`;
}

export async function readUpload(key: string): Promise<{ body: Uint8Array; type: string } | null> {
  const safe = normalize(key).replace(/^(\.\.(\/|\\|$))+/, "");
  if (safe.includes("..")) return null;
  try {
    const body = await readFile(join(LOCAL_DIR, safe));
    return { body: new Uint8Array(body), type: TYPES[extname(safe).toLowerCase()] ?? "application/octet-stream" };
  } catch {
    return null;
  }
}
