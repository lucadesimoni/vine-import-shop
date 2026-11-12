import { Link } from "react-router";
import type { schema } from "~/.server/db";
import { formatMoney } from "~/lib/money";
import { Badge } from "./ui";
import { DataTable, label, RowCheck } from "./admin";
import type { ListMeta } from "~/lib/list";
import { STATUS_TONE } from "./status";

type Bulk = { value: string; label: string; tone?: "danger" }[];

export function OrdersTable({ orders, currency, meta, bulk }: { orders: (typeof schema.orders.$inferSelect)[]; currency: string; meta?: ListMeta; bulk?: Bulk }) {
  return (
    <DataTable
      meta={meta}
      bulk={bulk}
      empty={orders.length === 0}
      head={[{ label: "Nummer", sort: "number" }, { label: "Datum", sort: "date" }, { label: "Kunde", sort: "customer" }, { label: "Status", sort: "status" }, "Zahlung", "vinX", { label: "Total", sort: "total", className: "text-right" }]}
    >
      {orders.map((o) => (
        <tr key={o.id}>
          {bulk && <RowCheck id={o.id} label={o.number} />}
          <td><Link to={`/admin/orders/${o.id}`} className="font-medium hover:underline">{o.number}</Link>{o.isTrade && <Badge tone="primary" className="ml-2">B2B</Badge>}{o.kind === "request" && <Badge className="ml-1">Anfrage</Badge>}</td>
          <td className="whitespace-nowrap tabular-nums text-muted-fg">{new Date(o.createdAt).toLocaleString("de-CH", { dateStyle: "short", timeStyle: "short" })}</td>
          <td>{o.billing.company || o.billing.name}<span className="block text-[12px] text-muted-fg">{o.email}</span></td>
          <td><Badge tone={STATUS_TONE[o.status]}>{label(o.status)}</Badge></td>
          <td><Badge tone={o.paymentStatus === "paid" ? "success" : "neutral"}>{label(o.paymentMethod)}</Badge></td>
          <td><Badge tone={o.erpStatus === "transferred" ? "success" : o.erpStatus === "failed" ? "danger" : "warning"}>{label(o.erpStatus)}</Badge></td>
          <td className="whitespace-nowrap text-right tabular-nums">{o.kind === "request" ? "—" : formatMoney(o.totalGross, currency, "de")}</td>
        </tr>
      ))}
    </DataTable>
  );
}
