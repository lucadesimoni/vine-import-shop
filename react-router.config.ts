import type { Config } from "@react-router/dev/config";

// SSR for SEO + fast first paint. Deploy targets: see docs/DEPLOY.md
// (Node/Docker via server.js, Vercel preset, Netlify, Cloudflare adapter).
export default {
  ssr: true,
} satisfies Config;
