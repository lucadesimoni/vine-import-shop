// Production server — runs on any Node host: Hostpoint Managed Flex (CSC), cPanel/Plesk (Passenger),
// VPS (systemd), Docker/Kubernetes, PaaS (Infomaniak, Exoscale, Deploio, Heroku-style buildpacks …).
//   npm run setup   → .env with secrets      npm run build && npm start
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

// 1) Config from .env (no extra tooling needed; real env vars always win)
if (existsSync(".env")) process.loadEnvFile(".env");

// 2) Zero-config secrets: generated once and kept in ./data/secrets.json next to the embedded database,
//    so `node server.js` / `docker run` needs no configuration and one folder (data/) is the whole shop.
{
  const file = "data/secrets.json";
  const keys = ["SESSION_SECRET", "CRON_SECRET", "VINX_WEBHOOK_SECRET"];
  if (keys.some((k) => !process.env[k])) {
    mkdirSync("data", { recursive: true });
    const stored = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
    let changed = false;
    for (const k of keys) if (!stored[k]) { stored[k] = randomBytes(32).toString("base64url"); changed = true; }
    if (changed) writeFileSync(file, JSON.stringify(stored, null, 2), { mode: 0o600 });
    for (const k of keys) process.env[k] ||= stored[k];
  }
}
process.env.NODE_ENV ||= "production";

const { default: express } = await import("express");
const { default: compression } = await import("compression");
const { createRequestHandler } = await import("@react-router/express");

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0"; // Hostpoint/nginx proxy: HOST=127.0.0.1

const build = await import("./build/server/index.js");
const app = express();
app.disable("x-powered-by");
app.set("trust proxy", true);
app.use(compression());
app.use((_, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  if (process.env.NODE_ENV === "production") res.setHeader("Strict-Transport-Security", "max-age=31536000");
  next();
});
app.use("/assets", express.static("build/client/assets", { immutable: true, maxAge: "1y" }));
app.use(express.static("build/client", { maxAge: "1h" }));
app.use(createRequestHandler({ build }));

// Passenger (cPanel/Plesk) hooks the first listen() call and ignores port/host.
const server = app.listen(port, host, () => console.log(`Shop listening on http://${host === "0.0.0.0" ? "localhost" : host}:${port}`));

// 3) Built-in scheduler: ERP sync + outbox without any external cron.
//    JOBS_INTERVAL_MINUTES=0 disables it (e.g. when a platform cron calls POST /api/cron, or with several instances).
const every = Number(process.env.JOBS_INTERVAL_MINUTES ?? 10);
let timer;
if (every > 0) {
  const target = () => { const a = server.address(); return a && typeof a === "object" ? `http://127.0.0.1:${a.port}` : process.env.PUBLIC_URL; };
  const run = () =>
    target() &&
    fetch(`${target()}/api/cron`, { method: "POST", headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } })
      .then((r) => r.ok || console.warn(`[scheduler] HTTP ${r.status}`))
      .catch((e) => console.warn("[scheduler]", e.message));
  setTimeout(run, 30_000);
  timer = setInterval(run, every * 60_000);
}

// 4) Graceful shutdown (supervisord, systemd, Docker, Kubernetes)
for (const sig of ["SIGTERM", "SIGINT"]) {
  process.on(sig, () => {
    clearInterval(timer);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 8_000).unref();
  });
}
