import { Link } from "react-router";
import { ArrowRight, ArrowUpRight, Award, Clock, Grape, Heart, Leaf, MapPin, Plus, Shield, Sprout, Star, Truck, Users, Wine, type LucideIcon } from "lucide-react";
import type { Block, BlockData, CustomBlock } from "~/lib/blocks";
import { tl, type Localized } from "~/lib/localized";
import { useI18n } from "~/lib/i18n";
import { cn } from "~/lib/cn";
import type { RegionMapData } from "~/lib/maps/regions";
import type { ProductCard as Card } from "~/.server/catalog";
import { ButtonLink, Eyebrow, Lines, SectionHeading } from "./ui";
import { ProductCard, ProductImage } from "./shop";
import { ProducerLogo } from "./producer";
import { RegionMap, WorldDotMap } from "./origin-map";

/**
 * Storefront renderers for page-builder blocks (definitions: lib/blocks.ts, data: .server/blocks.ts).
 * Everything is drawn from design tokens, so blocks follow any brand, radius and dark mode.
 */

/** Customer blocks: custom/blocks/<name>/index.tsx (default export = defineBlock({...})). */
export const CUSTOM_BLOCKS: CustomBlock[] = (import.meta.env
  ? Object.values(import.meta.glob<CustomBlock>("../../custom/blocks/*/index.tsx", { eager: true, import: "default" }))
  : []
).filter((b) => b?.type && b.Component);

export const VALUE_ICONS: Record<string, LucideIcon> = { sprout: Sprout, award: Award, heart: Heart, truck: Truck, grape: Grape, wine: Wine, leaf: Leaf, shield: Shield, clock: Clock, star: Star, users: Users, "map-pin": MapPin };

type R = Block & { res?: Record<string, unknown> };
type P = { b: R; L: (v: unknown) => string; first: boolean };

export function Blocks({ blocks }: { blocks: R[] }) {
  const { locale } = useI18n();
  const L = (v: unknown) => tl(v as Localized, locale);
  return (
    <>
      {blocks.map((b, i) => {
        const Comp = RENDERERS[b.type];
        if (Comp) return <Comp key={b.id} b={b} L={L} first={i === 0} />;
        const custom = CUSTOM_BLOCKS.find((c) => c.type === b.type);
        return custom ? <custom.Component key={b.id} data={b.data} locale={locale} /> : null;
      })}
    </>
  );
}

const d = <T,>(b: R, k: string) => b.data[k] as T;

const RENDERERS: Record<string, (p: P) => React.ReactNode> = {
  hero: ({ b, L, first }) => {
    const stats = d<{ value: string; label: Localized }[]>(b, "stats") ?? [];
    const h = d<string>(b, "height");
    const Title = first ? "h1" : "h2";
    return (
      <section className="relative isolate -mt-px overflow-hidden bg-inverse text-on-inverse">
        {d<string>(b, "image") && <img src={d<string>(b, "image")} alt="" className="absolute inset-0 -z-10 h-full w-full object-cover" fetchPriority={first ? "high" : undefined} loading={first ? undefined : "lazy"} />}
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-scrim/70 via-scrim/35 to-scrim/10" />
        <div className={cn("container-page grid content-center gap-6 md:gap-8", h === "compact" ? "min-h-[min(44vh,420px)] py-14" : h === "medium" ? "min-h-[min(60vh,560px)] py-16" : "min-h-[min(78vh,760px)] py-16 md:py-20")}>
          {L(b.data.eyebrow) && <Eyebrow line className="animate-fade-up text-on-inverse/85">{L(b.data.eyebrow)}</Eyebrow>}
          <Title className="text-display animate-fade-up max-w-3xl [animation-delay:80ms]"><Lines text={L(b.data.title)} /></Title>
          {L(b.data.text) && <p className="text-lead animate-fade-up max-w-xl text-on-inverse/85 [animation-delay:160ms]">{L(b.data.text)}</p>}
          {(L(b.data.primaryLabel) || L(b.data.secondaryLabel)) && (
            <div className="animate-fade-up flex flex-wrap gap-3 [animation-delay:240ms]">
              {L(b.data.primaryLabel) && d<string>(b, "primaryHref") && <ButtonLink to={d<string>(b, "primaryHref")} variant="inverse" size="lg">{L(b.data.primaryLabel)} <ArrowRight size={16} /></ButtonLink>}
              {L(b.data.secondaryLabel) && d<string>(b, "secondaryHref") && <ButtonLink to={d<string>(b, "secondaryHref")} variant="outlineInverse" size="lg">{L(b.data.secondaryLabel)}</ButtonLink>}
            </div>
          )}
          {stats.length > 0 && (
            <dl className="flex gap-8 pt-2 md:hidden">
              {stats.map((s, i) => <div key={i} className="grid"><dd className="font-display text-3xl leading-none">{s.value}</dd><dt className="text-eyebrow mt-1.5 text-[9px] text-on-inverse/75">{L(s.label)}</dt></div>)}
            </dl>
          )}
        </div>
        {stats.length > 0 && (
          <dl className="container-page absolute inset-x-0 bottom-0 hidden justify-end gap-10 pb-8 md:flex">
            {stats.map((s, i) => (
              <div key={i} className="flex flex-col-reverse items-end border-l border-on-inverse/30 pl-10 first:border-0">
                <dt className="text-eyebrow mt-2 text-[10px] text-on-inverse/75">{L(s.label)}</dt>
                <dd className="font-display text-5xl leading-none">{s.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>
    );
  },

  categories: ({ b, L }) => {
    const { t } = useI18n();
    const cats = (b.res?.categories as { id: number; slug: string; name: string; image: string | null }[]) ?? [];
    if (!cats.length) return null;
    return (
      <section className="container-page py-16 md:py-28">
        <SectionHeading center title={L(b.data.title) || t("shop.title")} action={<Link to="/shop" className="text-eyebrow inline-flex items-center gap-2 text-[11px] text-fg/80 hover:text-fg">{t("common.showAll")} <ArrowUpRight size={14} /></Link>} />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {cats.map((c) => (
            <Link key={c.id} to={`/shop?category=${c.slug}`} className="group grid gap-3 text-center">
              <div className="aspect-[3/4] overflow-hidden rounded-surface bg-muted">
                {c.image && <img src={c.image} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105" />}
              </div>
              <span className="font-display text-lg leading-tight">{c.name}</span>
              <span aria-hidden className="mx-auto h-px w-8 bg-border-strong transition-all duration-300 group-hover:w-14 group-hover:bg-primary" />
            </Link>
          ))}
        </div>
      </section>
    );
  },

  products: ({ b, L }) => {
    const { t } = useI18n();
    const items = (b.res?.items as Card[]) ?? [];
    if (!items.length) return null;
    const grid = d<string>(b, "layout") === "grid";
    return (
      <section className={cn("py-16 md:py-24", d<string>(b, "source") === "promo" && "border-y border-border bg-surface")}>
        <div className="container-page">
          <SectionHeading eyebrow={L(b.data.eyebrow)} title={L(b.data.title)} action={<ButtonLink to={String(b.res?.more ?? "/shop")} size="sm" variant="secondary">{t("common.showAll")} <ArrowRight size={14} /></ButtonLink>} />
          {L(b.data.text) && <p className="-mt-6 mb-10 max-w-2xl text-muted-fg">{L(b.data.text)}</p>}
          {grid ? (
            <div className="grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3 lg:grid-cols-4">{items.map((p) => <ProductCard key={p.id} product={p} />)}</div>
          ) : (
            <div className="scrollbar-none -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 md:gap-6">
              {items.map((p) => <div key={p.id} className="w-[min(64vw,260px)] shrink-0 snap-start"><ProductCard product={p} /></div>)}
            </div>
          )}
        </div>
      </section>
    );
  },

  spotlight: ({ b, L }) => {
    const { t } = useI18n();
    const card = b.res?.card as Card | undefined;
    if (!card) return null;
    return (
      <section className="container-page py-16 md:py-28">
        <div className="mx-auto grid max-w-5xl overflow-hidden rounded-surface border border-border bg-surface md:grid-cols-2">
          <div className="relative min-h-72 bg-media md:min-h-96"><div className="absolute inset-[10%]"><ProductImage product={card} /></div></div>
          <div className="grid content-center gap-5 p-6 md:p-12">
            {L(b.data.eyebrow) && <Eyebrow>{L(b.data.eyebrow)}</Eyebrow>}
            <div>
              <h2 className="text-h2">{card.name}</h2>
              {card.producer && <p className="mt-2 text-muted-fg">{card.producer.name}</p>}
            </div>
            <ul className="grid gap-2.5 text-sm">
              {(d<{ text: Localized }[]>(b, "bullets") ?? []).map((x, i) => <li key={i} className="flex gap-3"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary" />{L(x.text)}</li>)}
            </ul>
            {L(b.data.note) && <p className="font-display text-lg italic text-muted-fg">{L(b.data.note)}</p>}
            <ButtonLink to={`/product/${card.slug}`} className="w-fit">{t("common.more")} <ArrowRight size={14} /></ButtonLink>
          </div>
        </div>
      </section>
    );
  },

  imageText: ({ b, L }) => {
    const tone = d<string>(b, "tone");
    const right = d<string>(b, "imageSide") === "right";
    return (
      <section className={cn("py-16 md:py-28", tone === "surface" && "border-y border-border bg-surface", tone === "muted" && "bg-muted/50")}>
        <div className="container-page grid items-center gap-10 md:grid-cols-2 md:gap-16">
          {d<string>(b, "image") && <img src={d<string>(b, "image")} alt="" loading="lazy" className={cn("aspect-[4/3] w-full rounded-surface object-cover", right && "md:order-2")} />}
          <div className="grid content-center gap-6">
            {L(b.data.eyebrow) && <Eyebrow>{L(b.data.eyebrow)}</Eyebrow>}
            {L(b.data.title) && <h2 className="text-h1"><Lines text={L(b.data.title)} /></h2>}
            {b.res?.html ? <div className="prose-shop text-lead text-muted-fg" dangerouslySetInnerHTML={{ __html: String(b.res.html) }} /> : null}
            {L(b.data.linkLabel) && d<string>(b, "linkHref") && <Link to={d<string>(b, "linkHref")} className="text-eyebrow inline-flex w-fit items-center gap-2 border-b border-fg pb-1 text-[11px]">{L(b.data.linkLabel)} <ArrowRight size={13} /></Link>}
          </div>
        </div>
      </section>
    );
  },

  text: ({ b, L }) => (
    <section className={cn("container-page py-14 md:py-20", d<string>(b, "width") !== "wide" && "max-w-3xl", d<string>(b, "align") === "center" && "text-center")}>
      {L(b.data.title) && <h2 className="text-h2 mb-6">{L(b.data.title)}</h2>}
      <div className="prose-shop" dangerouslySetInnerHTML={{ __html: String(b.res?.html ?? "") }} />
    </section>
  ),

  cta: ({ b, L }) => {
    const tone = d<string>(b, "tone");
    return (
      <section className="container-page py-10 md:py-16">
        <div className={cn("grid items-center gap-6 rounded-surface px-6 py-10 md:grid-cols-[1fr_auto] md:px-12 md:py-14", tone === "inverse" ? "bg-inverse text-on-inverse" : tone === "muted" ? "border border-border bg-muted" : "bg-primary text-on-primary")}>
          <div className="grid gap-3">
            {L(b.data.eyebrow) && <Eyebrow className={tone === "muted" ? "" : "text-current opacity-80"}>{L(b.data.eyebrow)}</Eyebrow>}
            <h2 className="text-h2">{L(b.data.title)}</h2>
            {L(b.data.text) && <p className={cn("max-w-xl", tone === "muted" ? "text-muted-fg" : "opacity-85")}>{L(b.data.text)}</p>}
          </div>
          {L(b.data.buttonLabel) && d<string>(b, "buttonHref") && (
            <ButtonLink to={d<string>(b, "buttonHref")} variant={tone === "muted" ? "primary" : "inverse"} size="lg" className="w-full md:w-auto">{L(b.data.buttonLabel)} <ArrowRight size={16} /></ButtonLink>
          )}
        </div>
      </section>
    );
  },

  brands: ({ b, L }) => {
    const brands = (b.res?.brands as { slug: string; name: string; logo: string | null }[]) ?? [];
    if (!brands.length) return null;
    return (
      <section className="container-page py-16 md:py-20">
        <p className="text-eyebrow mb-10 text-center text-muted-fg">{L(b.data.title)}</p>
        <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-6">
          {brands.map((x) =>
            x.logo ? (
              <Link key={x.slug} to={`/producers/${x.slug}`} aria-label={x.name}><ProducerLogo name={x.name} logo={x.logo} size="md" className="border-0 bg-transparent opacity-75 grayscale transition hover:opacity-100 hover:grayscale-0" /></Link>
            ) : (
              <Link key={x.slug} to={`/producers/${x.slug}`} className="font-display text-xl text-fg/55 transition-colors hover:text-primary">{x.name.replace(/\b(S\.r\.l\.?|S\.p\.A\.?|srl|GmbH|S\.a\.S\.)\b.*$/i, "").trim()}</Link>
            ),
          )}
        </div>
      </section>
    );
  },

  origin: ({ b, L }) => {
    const res = b.res as { map: RegionMapData | null; regions: { id: string; name: string; count: number }[]; countries: { id: string; count: number }[]; producers: number } | undefined;
    const { locale } = useI18n();
    if (!res) return null;
    return (
      <section className="border-y border-border bg-surface py-16 md:py-24">
        <div className="container-page grid items-center gap-10 md:grid-cols-[1fr_1.1fr] md:gap-16">
          <div className="grid content-center gap-5">
            {L(b.data.eyebrow) && <Eyebrow line>{L(b.data.eyebrow)}</Eyebrow>}
            <h2 className="text-h1">{L(b.data.title)}</h2>
            {L(b.data.text) && <p className="text-lead text-muted-fg">{L(b.data.text)}</p>}
            {res.map && (
              <ul className="flex flex-wrap gap-2">
                {res.regions.slice(0, 6).map((r) => <li key={r.id}><Link to={`/producers?region=${r.id}`} className="inline-flex h-8 items-center rounded-badge border border-border px-3 text-[13px] hover:border-fg">{r.name} <span className="ml-2 text-muted-fg tabular-nums">{r.count}</span></Link></li>)}
              </ul>
            )}
            <ButtonLink to="/producers" variant="secondary" className="w-fit">{L(b.data.buttonLabel)} <ArrowRight size={14} /></ButtonLink>
          </div>
          <Link to="/producers" className="block" aria-label={L(b.data.title)}>
            {res.map ? (
              <RegionMap map={res.map} data={res.regions} href={(id) => `/producers?region=${id}`} locale={locale} label={L(b.data.title)} markers={false} className="mx-auto h-auto max-h-[480px] w-full" />
            ) : (
              <WorldDotMap data={res.countries} href={(iso) => `/producers?view=world&origin=${iso}`} locale={locale} label={L(b.data.title)} compact />
            )}
          </Link>
        </div>
      </section>
    );
  },

  values: ({ b, L }) => {
    const items = d<{ icon: string; title: Localized; text: Localized }[]>(b, "items") ?? [];
    if (!items.length) return null;
    return (
      <section className="border-t border-border bg-muted/50 py-16 md:py-24">
        <div className="container-page">
          {L(b.data.title) && <p className="text-eyebrow mb-12 text-center text-muted-fg md:mb-14">{L(b.data.title)}</p>}
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-12">
            {items.map((v, i) => {
              const Icon = VALUE_ICONS[v.icon] ?? Sprout;
              return (
                <div key={i} className="grid justify-items-center gap-3 text-center">
                  <Icon size={22} strokeWidth={1.4} className="text-primary" />
                  <h3 className="text-h3">{L(v.title)}</h3>
                  <p className="max-w-60 text-sm text-muted-fg">{L(v.text)}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    );
  },

  quote: ({ b, L }) => (
    <section className="container-page max-w-4xl py-16 text-center md:py-24">
      <blockquote className="grid gap-6">
        <p className="font-display text-[clamp(1.5rem,3.5vw,2.5rem)] italic leading-snug">{L(b.data.text)}</p>
        {d<string>(b, "author") && <footer className="text-eyebrow text-[11px] text-muted-fg">— {d<string>(b, "author")}</footer>}
      </blockquote>
    </section>
  ),

  image: ({ b, L }) => {
    const src = d<string>(b, "image");
    if (!src) return null;
    const ratio = d<string>(b, "ratio");
    const img = <img src={src} alt={L(b.data.caption)} loading="lazy" className={cn("w-full rounded-surface object-cover", ratio === "square" ? "aspect-square md:aspect-[4/3]" : ratio === "cinema" ? "aspect-[16/9] md:aspect-[21/9]" : "aspect-[4/3] md:aspect-video")} />;
    return (
      <figure className="container-page grid gap-3 py-10 md:py-16">
        {d<string>(b, "href") ? <Link to={d<string>(b, "href")}>{img}</Link> : img}
        {L(b.data.caption) && <figcaption className="text-center text-[13px] text-muted-fg">{L(b.data.caption)}</figcaption>}
      </figure>
    );
  },

  faq: ({ b, L }) => {
    const items = d<{ q: Localized }[]>(b, "items") ?? [];
    const answers = (b.res?.answers as string[]) ?? [];
    if (!items.length) return null;
    return (
      <section className="container-page max-w-3xl py-14 md:py-20">
        {L(b.data.title) && <h2 className="text-h2 mb-8">{L(b.data.title)}</h2>}
        <div className="divide-y divide-border border-y border-border">
          {items.map((x, i) => (
            <details key={i} className="group py-1">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 font-display text-lg [&::-webkit-details-marker]:hidden">
                {L(x.q)} <Plus size={18} className="shrink-0 text-muted-fg transition-transform group-open:rotate-45" />
              </summary>
              <div className="prose-shop pb-5 text-muted-fg" dangerouslySetInnerHTML={{ __html: answers[i] ?? "" }} />
            </details>
          ))}
        </div>
      </section>
    );
  },
};

export type { BlockData };
