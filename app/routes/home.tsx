import { Link } from "react-router";
import { ArrowRight, ArrowUpRight, Award, Heart, Sprout, Truck, type LucideIcon } from "lucide-react";
import type { Route } from "./+types/home";
import { shopContext } from "~/.server/context";
import { categoryTree, homeCollections, productDetail, producersList } from "~/.server/catalog";
import { getSetting } from "~/.server/settings";
import { tl } from "~/lib/localized";
import { useI18n } from "~/lib/i18n";
import { ButtonLink, Eyebrow, Lines, SectionHeading } from "~/components/ui";
import { ProductCard, ProductImage } from "~/components/shop";

export async function loader({ context }: Route.LoaderArgs) {
  const ctx = context.get(shopContext);
  const home = await getSetting("home");
  const [collections, cats, producers, spotlight] = await Promise.all([
    homeCollections(ctx),
    categoryTree(ctx),
    producersList(),
    home.spotlight.show && home.spotlight.productSlug ? productDetail(ctx, home.spotlight.productSlug) : null,
  ]);
  return {
    home,
    promo: collections.promo,
    featured: collections.featured,
    categories: cats.filter((c) => c.showOnHome),
    brands: producers.filter((p) => p.featured).slice(0, 12),
    spotlight: spotlight ? { card: spotlight.card, short: spotlight.short } : null,
  };
}

const ICONS: Record<string, LucideIcon> = { sprout: Sprout, award: Award, heart: Heart, truck: Truck };

export default function Home({ loaderData }: Route.ComponentProps) {
  const { home, promo, categories, brands, spotlight } = loaderData;
  const { locale, t } = useI18n();
  const L = (v: Parameters<typeof tl>[0]) => tl(v, locale);
  const hero = home.hero;

  return (
    <>
      {/* Hero */}
      <section className="relative isolate -mt-px overflow-hidden bg-inverse text-on-inverse">
        {hero.imageUrl && <img src={hero.imageUrl} alt="" className="absolute inset-0 -z-10 h-full w-full object-cover" fetchPriority="high" />}
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-black/70 via-black/35 to-black/10" />
        <div className="container-page grid min-h-[min(78vh,760px)] content-center gap-8 py-20">
          {L(hero.eyebrow) && <Eyebrow line className="animate-fade-up text-on-inverse/85">{L(hero.eyebrow)}</Eyebrow>}
          <h1 className="text-display animate-fade-up max-w-3xl [animation-delay:80ms]"><Lines text={L(hero.title)} /></h1>
          {L(hero.text) && <p className="text-lead animate-fade-up max-w-xl text-on-inverse/85 [animation-delay:160ms]">{L(hero.text)}</p>}
          <div className="animate-fade-up flex flex-wrap gap-3 [animation-delay:240ms]">
            <ButtonLink to={hero.primary.href} variant="inverse" size="lg">{L(hero.primary.label)} <ArrowRight size={16} /></ButtonLink>
            {hero.secondary && <ButtonLink to={hero.secondary.href} variant="outlineInverse" size="lg">{L(hero.secondary.label)}</ButtonLink>}
          </div>
        </div>
        {home.stats.length > 0 && (
          <dl className="container-page absolute inset-x-0 bottom-0 hidden justify-end gap-10 pb-8 md:flex">
            {home.stats.map((s, i) => (
              <div key={i} className="flex flex-col-reverse items-end border-l border-on-inverse/30 pl-10 first:border-0">
                <dt className="text-eyebrow mt-2 text-[10px] text-on-inverse/75">{L(s.label)}</dt>
                <dd className="font-display text-5xl leading-none">{s.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      {/* Categories */}
      {home.categories.show && categories.length > 0 && (
        <section className="container-page py-20 md:py-28">
          <SectionHeading center title={L(home.categories.title) || t("shop.title")} action={<Link to="/shop" className="text-eyebrow inline-flex items-center gap-2 text-[11px] text-fg/80 hover:text-fg">{t("common.showAll")} <ArrowUpRight size={14} /></Link>} />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {categories.map((c) => (
              <Link key={c.id} to={`/shop?category=${c.slug}`} className="group grid gap-3 text-center">
                <div className="aspect-[3/4] overflow-hidden rounded-md bg-muted">
                  {c.image && <img src={c.image} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105" />}
                </div>
                <span className="font-display text-lg leading-tight">{c.name}</span>
                <span aria-hidden className="mx-auto h-px w-8 bg-border-strong transition-all duration-300 group-hover:w-14 group-hover:bg-primary" />
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Promotions */}
      {home.promo.show && promo.length > 0 && (
        <section className="border-y border-border bg-surface py-20 md:py-24">
          <div className="container-page">
            <SectionHeading
              eyebrow={L(home.promo.eyebrow)}
              title={L(home.promo.title)}
              action={
                <div className="flex flex-wrap gap-2">
                  <ButtonLink to="/shop?promo=1" size="sm">{t("common.showAll")} <ArrowRight size={14} /></ButtonLink>
                  <ButtonLink to="/trade#apply" size="sm" variant="secondary">{t("trade.apply")}</ButtonLink>
                </div>
              }
            />
            {L(home.promo.text) && <p className="-mt-6 mb-10 text-muted-fg">{L(home.promo.text)}</p>}
            <div className="scrollbar-none -mx-4 flex snap-x snap-mandatory gap-6 overflow-x-auto px-4 pb-2">
              {promo.map((p) => (
                <div key={p.id} className="w-[min(72vw,260px)] shrink-0 snap-start">
                  <ProductCard product={p} />
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Spotlight */}
      {spotlight && (
        <section className="container-page py-20 md:py-28">
          <div className="mx-auto grid max-w-5xl overflow-hidden rounded-lg border border-border bg-surface md:grid-cols-2">
            <div className="relative min-h-96 bg-muted"><div className="absolute inset-[10%]"><ProductImage product={spotlight.card} /></div></div>
            <div className="grid content-center gap-5 p-8 md:p-12">
              <Eyebrow>{L(home.spotlight.eyebrow)}</Eyebrow>
              <div>
                <h2 className="text-h2">{spotlight.card.name}</h2>
                {spotlight.card.producer && <p className="mt-2 text-muted-fg">{spotlight.card.producer.name}</p>}
              </div>
              <ul className="grid gap-2.5 text-sm">
                {home.spotlight.bullets.map((b, i) => (
                  <li key={i} className="flex gap-3"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary" />{L(b)}</li>
                ))}
              </ul>
              {L(home.spotlight.note) && <p className="font-display text-lg italic text-muted-fg">{L(home.spotlight.note)}</p>}
              <div className="flex flex-wrap gap-2 pt-2">
                <ButtonLink to={`/product/${spotlight.card.slug}`}>{t("common.more")} <ArrowRight size={14} /></ButtonLink>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Story */}
      {home.story.show && (
        <section className="border-t border-border bg-surface py-20 md:py-28">
          <div className="container-page grid items-center gap-12 md:grid-cols-2">
            {home.story.imageUrl && <img src={home.story.imageUrl} alt="" loading="lazy" className="aspect-[4/3] w-full rounded-md object-cover" />}
            <div className="grid content-center gap-6">
              <Eyebrow>{L(home.story.eyebrow)}</Eyebrow>
              <h2 className="text-h1"><Lines text={L(home.story.title)} /></h2>
              <p className="text-lead text-muted-fg">{L(home.story.text)}</p>
              {home.story.link && <Link to={home.story.link.href} className="text-eyebrow inline-flex w-fit items-center gap-2 border-b border-fg pb-1 text-[11px]">{L(home.story.link.label)} <ArrowRight size={13} /></Link>}
            </div>
          </div>
        </section>
      )}

      {/* Brands */}
      {home.brands.show && brands.length > 0 && (
        <section className="container-page py-20">
          <p className="text-eyebrow mb-10 text-center text-muted-fg">{L(home.brands.title)}</p>
          <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-6">
            {brands.map((b) =>
              b.logo ? (
                <Link key={b.id} to={`/shop?producer=${b.slug}`}><img src={b.logo} alt={b.name} className="h-12 w-auto opacity-70 grayscale transition hover:opacity-100 hover:grayscale-0" /></Link>
              ) : (
                <Link key={b.id} to={`/shop?producer=${b.slug}`} className="font-display text-xl text-fg/55 transition-colors hover:text-primary">{b.name.replace(/\b(S\.r\.l\.?|S\.p\.A\.?|srl|GmbH|S\.a\.S\.)\b.*$/i, "").trim()}</Link>
              ),
            )}
          </div>
        </section>
      )}

      {/* Values */}
      {home.values.items.length > 0 && (
        <section className="border-t border-border bg-muted/50 py-20 md:py-24">
          <div className="container-page">
            <p className="text-eyebrow mb-14 text-center text-muted-fg">{L(home.values.title)}</p>
            <div className="grid gap-12 sm:grid-cols-2 lg:grid-cols-4">
              {home.values.items.map((v, i) => {
                const Icon = ICONS[v.icon] ?? Sprout;
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
      )}
    </>
  );
}
