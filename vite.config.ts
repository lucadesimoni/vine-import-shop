import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss(), reactRouter()],
  resolve: { tsconfigPaths: true },
  ssr: {
    // Native / WASM packages stay external on the server.
    external: ["@electric-sql/pglite", "postgres", "nodemailer"],
  },
});
