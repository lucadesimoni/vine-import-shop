// Apply migrations (and seed an empty DB). Runs automatically on first request too.
import { getDb } from "../app/.server/db";

await getDb();
console.log("Database ready.");
process.exit(0);
