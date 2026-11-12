import { PGlite } from "@electric-sql/pglite";
const db = new PGlite(process.argv[2]);
console.log((await db.query(process.argv[3])).rows);
