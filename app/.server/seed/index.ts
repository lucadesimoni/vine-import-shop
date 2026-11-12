import { sql } from "drizzle-orm";
import { hashPassword } from "../auth";
import type { DB } from "../db";
import { schema } from "../db";

/**
 * First start of an empty database:
 *  - base: customer groups, admin user, legal page stubs (brand-neutral)
 *  - demo (DEMO_DATA=true): the De Simoni demo profile (brand, content, catalog)
 */
export async function ensureSeeded(db: DB) {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.customerGroups);
  if (n > 0) return;

  await db.transaction(async (tx) => {
    await tx.insert(schema.customerGroups).values([
      { code: "consumer", name: "Privatkunden", isTrade: false, showNet: false, discountPct: 0, minOrderCents: 0, erpCode: "1" },
      { code: "trade", name: "Fachhandel", isTrade: true, showNet: true, discountPct: 15, minOrderCents: 30000, erpCode: "2" },
      { code: "gastro", name: "Gastronomie", isTrade: true, showNet: true, discountPct: 20, minOrderCents: 25000, erpCode: "3" },
    ]);
    await tx.insert(schema.users).values({
      email: process.env.ADMIN_EMAIL ?? "admin@example.com",
      passwordHash: await hashPassword(process.env.ADMIN_PASSWORD ?? "admin-demo-1234"),
      name: "Administrator",
      role: "admin",
    });
  });

  if ((process.env.DEMO_DATA ?? "true") !== "false") {
    const { seedDeSimoniDemo } = await import("./desimoni");
    await seedDeSimoniDemo(db);
  } else {
    const { seedLegalStubs } = await import("./desimoni");
    await seedLegalStubs(db, "Your Company");
  }
}
