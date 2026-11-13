import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { rmSync } from "node:fs";
import { defineConfig, type Plugin } from "vite";

/** SHOP_DIST=customer → the licensed customer distribution: no De Simoni demo content in the bundle (see docs/LICENSING.md). */
const customer = process.env.SHOP_DIST === "customer";

/** customer build: drop the demo assets (De Simoni logos, photos, producer marks) that Vite copies from public/demo */
const stripDemo: Plugin = { name: "strip-demo-assets", apply: "build", closeBundle() { if (customer) rmSync("build/client/demo", { recursive: true, force: true }); } };

export default defineConfig({
  define: { __DEMO__: JSON.stringify(!customer) },
  plugins: [tailwindcss(), reactRouter(), stripDemo],
  resolve: { tsconfigPaths: true },
  ssr: {
    // Native / WASM packages stay external on the server.
    external: ["@electric-sql/pglite", "postgres", "nodemailer", "sharp"],
  },
});
