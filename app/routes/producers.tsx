import { Link } from "react-router";
import { ArrowUpRight } from "lucide-react";
import type { Route } from "./+types/producers";
import { producersList } from "~/.server/catalog";
import { useI18n } from "~/lib/i18n";
import { Eyebrow } from "~/components/ui";

export async function loader() {
  const producers = await producersList();
  return { producers: producers.filter((p) => p.count > 0) };
}

export default function Producers({ loaderData }: Route.ComponentProps) {
  const { t } = useI18n();
  const groups = new Map<string, typeof loaderData.producers>();
  for (const p of loaderData.producers) {
    const k = p.name.charAt(0).toUpperCase();
    groups.set(k, [...(groups.get(k) ?? []), p]);
  }
  return (
    <div className="container-page pb-24 pt-12 md:pt-16">
      <header className="mb-14 grid gap-3">
        <Eyebrow line>{t("shop.allProducers", { count: loaderData.producers.length })}</Eyebrow>
        <h1 className="text-h1">{t("nav.producers")}</h1>
      </header>
      <div className="grid gap-12">
        {[...groups].sort(([a], [b]) => a.localeCompare(b)).map(([letter, list]) => (
          <section key={letter} className="grid gap-4 border-t border-border pt-6 md:grid-cols-[80px_1fr]">
            <h2 className="font-display text-4xl text-primary">{letter}</h2>
            <ul className="grid gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((p) => (
                <li key={p.id}>
                  <Link to={`/shop?producer=${p.slug}`} className="group flex items-baseline justify-between gap-3 border-b border-border py-3.5">
                    <span className="font-display text-lg leading-tight group-hover:text-primary">{p.name}</span>
                    <span className="flex shrink-0 items-center gap-1 text-[12px] text-muted-fg tabular-nums">{p.count} <ArrowUpRight size={12} /></span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
