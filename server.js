// Production Node server (any Node host, VPS, Docker, PaaS).
// `npm run build && npm start`
import compression from "compression";
import express from "express";
import { createRequestHandler } from "@react-router/express";

const port = Number(process.env.PORT ?? 3000);
const build = await import("./build/server/index.js");

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", true);
app.use(compression());
app.use((_, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  next();
});
app.use("/assets", express.static("build/client/assets", { immutable: true, maxAge: "1y" }));
app.use(express.static("build/client", { maxAge: "1h" }));
app.use(createRequestHandler({ build }));

app.listen(port, () => console.log(`Shop listening on http://localhost:${port}`));
