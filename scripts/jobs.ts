// Scheduled jobs for VPS/Docker cron:  */10 * * * *  cd /app && npm run jobs
// Args: comma-separated jobs, e.g. `npm run jobs -- outbox,stock` or `articles:full`.
import { runScheduled } from "../app/.server/vinx/sync";

const jobs = process.argv[2]?.split(",");
console.log(JSON.stringify(await runScheduled(jobs), null, 2));
process.exit(0);
