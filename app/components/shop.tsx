import { useEffect, useRef, useState, type ReactNode } from "react";
import { Form, Link, NavLink, useFetcher, useLocation } from "react-router";
import { Building2, Check, Leaf, Menu, Moon, Search, ShoppingBag, Sun, User, X } from "lucide-react";
import { useI18n, type MessageKey } from "~/lib/i18n";
import { formatMoney } from "~/lib/money";
import { cn } from "~/lib/cn";
import { tl } from "~/lib/localized";
import type { PriceInfo, StockLevel } from "~/lib/pricing";
import { useRootData } from "~/lib/root-data";
import { usePath } from "~/lib/channel";
import type { ProductCard as Card } from "~/.server/catalog";
import { Badge, Button, buttonClass, Stepper } from "./ui";

/* ── Brand ─────────────────────────────────────────────────────────────── */

export function Logo({ inverse = false, compact = false, to = "/", sub }: { inverse?: boolean; compact?: boolean; to?: string; sub?: string }) {
  const { brand } = useRootData();
  const src = inverse ? brand.logoInverseUrl || brand.logoUrl : brand.logoUrl;
  // In dark mode the regular logo swaps to the inverse (light) artwork when one is configured.
  const darkSrc = !inverse && brand.darkMode !== "off" && brand.logoInverseUrl ? brand.logoInverseUrl : null;
  return (
    <Link to={to} className="group flex shrink-0 items-center gap-3" aria-label={brand.name}>
      {src ? (
        <>
          <img src={src} alt="" className={cn("w-auto", compact ? "h-9" : "h-10 md:h-12", darkSrc && "dark:hidden")} />
          {darkSrc && <img src={darkSrc} alt="" className={cn("hidden w-auto dark:block", compact ? "h-9" : "h-10 md:h-12")} />}
        </>
      ) : (
        <span className={cn("grid h-10 w-10 place-items-center rounded-full font-display text-xl italic", inverse ? "bg-on-inverse text-inverse" : "bg-primary text-on-primary")}>{brand.name.slice(0, 1)}</span>
      )}
      <span className="flex flex-col leading-none">
        <span className={cn("font-display text-[1.45rem] md:text-[1.7rem]", brand.name === brand.name.toUpperCase() ? "tracking-[0.06em]" : "tracking-tight")}>{brand.name}</span>
        {(sub ?? brand.claim) && <span className={cn("text-eyebrow mt-1.5 text-[0.62rem]", inverse ? "text-on-inverse/70" : "text-muted-fg")}>{sub ?? brand.claim}</span>}
      </span>
    </Link>
  );
}

/* ── Header ────────────────────────────────────────────────────────────── */

const NAV: { to: string; key: MessageKey; end?: boolean }[] = [
  { to: "/", key: "nav.home", end: true },
  { to: "/shop", key: "nav.shop" },
  { to: "/producers", key: "nav.producers" },
  { to: "/trade", key: "nav.trade" },
  { to: "/story", key: "nav.story" },
  { to: "/contact", key: "nav.contact" },
];

export function Header() {
  const { t, locale, locales } = useI18n();
  const { brand, user, cartCount, channel } = useRootData();
  const [open, setOpen] = useState(false);
  const showPortal = channel.portalEnabled && (!user || user.role !== "customer" || channel.canUsePortal);
  const [search, setSearch] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();
  const announcement = tl(brand.announcement, locale);

  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={cn("sticky top-0 z-40 border-b bg-bg/90 backdrop-blur-md transition-[border-color,box-shadow] duration-300", scrolled ? "border-border shadow-bar" : "border-transparent")}>
      {announcement && (
        <div className="bg-primary px-4 py-1.5 text-center text-[11px] tracking-wide text-on-primary">{announcement}</div>
      )}
      <div className="container-page flex h-[var(--header-h)] items-center gap-6">
        <button className={buttonClass({ variant: "ghost", size: "icon" }, "-ml-2 lg:hidden")} onClick={() => setOpen(true)} aria-label={t("nav.menu")}>
          <Menu size={20} strokeWidth={1.5} />
        </button>
        <Logo />
        <nav className="mx-auto hidden items-center gap-1 lg:flex" aria-label="Main">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                cn(
                  "relative px-3.5 py-2 text-[14px] text-fg/80 transition-colors hover:text-fg",
                  "after:absolute after:inset-x-3.5 after:-bottom-0.5 after:h-px after:origin-left after:scale-x-0 after:bg-primary after:transition-transform after:duration-300 hover:after:scale-x-100",
                  isActive && "text-fg after:scale-x-100",
                )
              }
            >
              {t(n.key)}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1 lg:ml-0">
          {locales.length > 1 && (
            <div className="mr-2 hidden items-center gap-1 text-[12px] font-medium tracking-wider sm:flex">
              {locales.map((l, i) => (
                <span key={l} className="flex items-center gap-1">
                  {i > 0 && <span className="text-border-strong">|</span>}
                  <Form method="post" action="/set-locale" className="contents">
                    <input type="hidden" name="locale" value={l} />
                    <input type="hidden" name="redirectTo" value={location.pathname + location.search} />
                    <button className={cn("px-1 uppercase transition-colors", l === locale ? "text-fg" : "text-muted-fg hover:text-fg")} aria-current={l === locale}>{l}</button>
                  </Form>
                </span>
              ))}
            </div>
          )}
          {showPortal && (
            <a href={`${channel.portalUrl}/portal`} className={buttonClass({ variant: "secondary", size: "sm" }, "mr-2 hidden md:inline-flex")}>
              <Building2 size={15} strokeWidth={1.6} /> {t("portal.title")}
            </a>
          )}
          <ThemeToggle className="hidden sm:inline-flex" />
          <button className={buttonClass({ variant: "ghost", size: "icon" })} onClick={() => setSearch((s) => !s)} aria-label={t("nav.search")}>
            <Search size={19} strokeWidth={1.5} />
          </button>
          <Link to={user ? (user.role === "customer" ? "/account" : "/admin") : "/login"} className={buttonClass({ variant: "ghost", size: "icon" })} aria-label={user ? t("nav.account") : t("nav.login")}>
            <User size={19} strokeWidth={1.5} />
          </Link>
          <Link to="/order-list" className={buttonClass({ variant: "ghost", size: "sm" }, "relative gap-2 pr-2.5")} aria-label={t("nav.orderList")}>
            <ShoppingBag size={19} strokeWidth={1.5} />
            <span className="hidden md:inline">{t("nav.orderList")}</span>
            {cartCount > 0 && (
              <span key={cartCount} className="animate-fade-up grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1.5 text-[10px] font-semibold tabular-nums text-on-primary">{cartCount}</span>
            )}
          </Link>
        </div>
      </div>

      {search && (
        <Form action="/shop" className="border-t border-border bg-surface" role="search" onSubmit={() => setSearch(false)}>
          <div className="container-page flex h-16 items-center gap-3">
            <Search size={18} className="text-muted-fg" />
            <input autoFocus name="q" placeholder={t("shop.search")} aria-label={t("nav.search")} className="flex-1 bg-transparent font-display text-xl outline-none placeholder:text-muted-fg/60" />
            <Button variant="ghost" size="icon" onClick={() => setSearch(false)} aria-label={t("nav.close")}><X size={18} /></Button>
          </div>
        </Form>
      )}

      {/* Mobile navigation */}
      <div className={cn("fixed inset-0 z-50 lg:hidden", open ? "visible" : "invisible delay-300")} aria-hidden={!open}>
        <div className={cn("absolute inset-0 bg-fg/40 transition-opacity duration-300", open ? "opacity-100" : "opacity-0")} onClick={() => setOpen(false)} />
        <nav className={cn("absolute inset-y-0 left-0 flex w-[min(360px,88vw)] flex-col bg-bg px-6 pb-8 pt-5 shadow-pop transition-transform duration-300 ease-out", open ? "translate-x-0" : "-translate-x-full")}>
          <div className="mb-6 flex items-center justify-between">
            <Logo compact />
            <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label={t("nav.close")}><X size={20} /></Button>
          </div>
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => cn("border-b border-border py-4 font-display text-2xl", isActive && "text-primary")}>
              {t(n.key)}
            </NavLink>
          ))}
          {showPortal && (
            <a href={`${channel.portalUrl}/portal`} className={buttonClass({ variant: "secondary" }, "mt-8")}>
              <Building2 size={16} strokeWidth={1.6} /> {t("portal.title")}
            </a>
          )}
          <div className="mt-auto flex items-center gap-4 pt-6 text-sm uppercase tracking-wider">
            <ThemeToggle className="-ml-2.5" />
            {locales.map((l) => (
              <Form key={l} method="post" action="/set-locale">
                <input type="hidden" name="locale" value={l} />
                <input type="hidden" name="redirectTo" value={location.pathname} />
                <button className={l === locale ? "font-semibold text-fg" : "text-muted-fg"}>{l}</button>
              </Form>
            ))}
          </div>
        </nav>
      </div>
    </header>
  );
}

/** Light/dark switch (only when the brand allows a visitor toggle). Pure client-side + cookie; SSR reads the cookie. */
export function ThemeToggle({ className }: { className?: string }) {
  const { brand } = useRootData();
  const { t } = useI18n();
  if (brand.darkMode !== "toggle") return null;
  const toggle = () => {
    const d = document.documentElement;
    const next = d.dataset.theme === "dark" ? "light" : "dark";
    d.dataset.theme = next;
    document.cookie = `theme=${next}; path=/; max-age=31536000; samesite=lax`;
  };
  return (
    <button type="button" onClick={toggle} className={cn(buttonClass({ variant: "ghost", size: "icon" }), className)} aria-label={t("nav.theme")} title={t("nav.theme")}>
      <Moon size={18} strokeWidth={1.5} className="dark:hidden" />
      <Sun size={18} strokeWidth={1.5} className="hidden dark:block" />
    </button>
  );
}

/* ── Footer ────────────────────────────────────────────────────────────── */

export function Footer() {
  const { t, locale } = useI18n();
  const { brand, footerPages } = useRootData();
  const c = brand.contact;
  const quote = tl(brand.footerQuote, locale);
  return (
    <footer className="bg-inverse text-on-inverse">
      <div className="container-page grid gap-12 py-16 md:grid-cols-[1.4fr_1fr_1fr] md:py-20">
        <div className="grid content-start gap-6">
          <Logo inverse />
          {quote && <p className="max-w-sm font-display text-lg italic leading-snug text-on-inverse/85">«{quote}»</p>}
        </div>
        <div className="grid content-start gap-3 text-sm">
          <p className="text-eyebrow text-on-inverse/60">{t("footer.contact")}</p>
          <address className="not-italic leading-relaxed text-on-inverse/85">
            {c.street}<br />{c.zip} {c.city}<br />{c.country}
          </address>
          {c.phone && <a href={`tel:${c.phone.replace(/\s/g, "")}`} className="text-on-inverse/85 hover:text-on-inverse">{c.phone}</a>}
          {c.email && <a href={`mailto:${c.email}`} className="text-on-inverse/85 hover:text-on-inverse">{c.email}</a>}
        </div>
        {c.hours.length > 0 && (
          <div className="grid content-start gap-3 text-sm">
            <p className="text-eyebrow text-on-inverse/60">{t("footer.hours")}</p>
            {c.hours.map((h, i) => (
              <p key={i} className="leading-relaxed text-on-inverse/85">
                {tl(h.label, locale)}
                <br />
                <span className="tabular-nums">{h.value}</span>
              </p>
            ))}
          </div>
        )}
      </div>
      <div className="border-t border-on-inverse/15">
        <div className="container-page flex flex-wrap items-center justify-between gap-4 py-6 text-[12px] text-on-inverse/65">
          <span>© {new Date().getFullYear()} {brand.legalName || brand.name} · {t("footer.rights")}</span>
          <nav className="flex flex-wrap gap-5">
            {footerPages.map((p) => (
              <Link key={p.slug} to={`/page/${p.slug}`} className="hover:text-on-inverse">{p.title}</Link>
            ))}
          </nav>
        </div>
      </div>
    </footer>
  );
}

/* ── Product presentation ──────────────────────────────────────────────── */

/** Placeholder art is drawn from brand tokens only (adapts to every palette & dark mode). */
const ART_TONES: Record<string, string> = {
  red: "var(--t-primary)",
  white: "color-mix(in oklab, var(--t-accent) 70%, var(--t-card))",
  rose: "color-mix(in oklab, var(--t-primary) 45%, var(--t-card))",
  sparkling: "color-mix(in oklab, var(--t-accent) 55%, var(--t-card))",
  sweet: "color-mix(in oklab, var(--t-accent) 80%, var(--t-fg))",
  spirit: "color-mix(in oklab, var(--t-muted-fg) 55%, var(--t-card))",
  food: "color-mix(in oklab, var(--t-muted-fg) 70%, var(--t-card))",
  beverage: "color-mix(in oklab, var(--t-muted-fg) 45%, var(--t-card))",
};

/** Product image with an on-brand fallback silhouette when no packshot exists. */
export function ProductImage({ product, className }: { product: Pick<Card, "image" | "name" | "kind" | "color">; className?: string }) {
  if (product.image)
    return (
      <span className="relative block h-full w-full">
        <img src={product.image} alt={product.name} loading="lazy" decoding="async" className={cn("absolute inset-0 h-full w-full object-contain", className)} />
      </span>
    );
  const tone = ART_TONES[product.color ?? product.kind] ?? ART_TONES.food;
  const bottle = product.kind === "wine" || product.kind === "spirit" || product.kind === "beverage";
  return (
    <svg viewBox="0 0 200 300" role="img" aria-label={product.name} preserveAspectRatio="xMidYMid meet" className={cn("block h-full w-full", className)}>
      {bottle ? (
        <>
          <path d="M90 22h20v60c0 10 26 22 26 52v146c0 6-4 10-10 10H74c-6 0-10-4-10-10V134c0-30 26-42 26-52z" style={{ fill: tone }} />
          <rect x="88" y="16" width="24" height="24" rx="3" style={{ fill: "var(--t-fg)" }} opacity=".85" />
          <rect x="72" y="172" width="56" height="66" rx="2" style={{ fill: "var(--t-media)" }} opacity=".92" />
        </>
      ) : (
        <>
          <rect x="62" y="72" width="76" height="16" rx="4" style={{ fill: "var(--t-fg)" }} opacity=".8" />
          <rect x="56" y="88" width="88" height="160" rx="14" style={{ fill: tone }} />
          <rect x="68" y="140" width="64" height="56" rx="3" style={{ fill: "var(--t-media)" }} opacity=".92" />
        </>
      )}
    </svg>
  );
}

export function PriceTag({ price, size = "md", className }: { price: PriceInfo | null; size?: "md" | "lg"; className?: string }) {
  const { t, locale } = useI18n();
  const { shop } = useRootData();
  if (!price) {
    return <p className={cn("text-eyebrow whitespace-nowrap text-[10px] text-fg", size === "lg" && "text-[12px]", className)}>{t("price.onRequest")}</p>;
  }
  return (
    <div className={cn("flex flex-wrap items-baseline gap-x-2", className)}>
      <span className={cn("font-semibold tabular-nums", size === "lg" ? "font-display text-3xl font-normal" : "text-[15px]")}>{formatMoney(price.display, shop.currency, locale)}</span>
      {price.reduced && <s className="text-[13px] text-muted-fg tabular-nums">{formatMoney(price.displayMode === "net" ? price.listNet : price.listGross, shop.currency, locale)}</s>}
      <span className="w-full text-[11px] text-muted-fg">{price.displayMode === "net" ? t("price.exclVat") : t("price.inclVat")}</span>
      {price.applied && price.applied.length > 0 && (
        <span className="mt-1 flex w-full flex-wrap gap-1">
          {price.applied.map((a) => <Badge key={a.id} tone="soft">{a.label}</Badge>)}
        </span>
      )}
    </div>
  );
}

const STOCK_STYLE: Record<StockLevel, { dots: number; tone: string; key: MessageKey }> = {
  plenty: { dots: 3, tone: "bg-success", key: "stock.plenty" },
  available: { dots: 2, tone: "bg-success", key: "stock.available" },
  few: { dots: 1, tone: "bg-warning", key: "stock.few" },
  out: { dots: 0, tone: "bg-danger", key: "stock.out" },
};

export function StockLabel({ level, qty }: { level: StockLevel; qty?: number | null }) {
  const { t } = useI18n();
  const s = STOCK_STYLE[level];
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap text-[12px] text-muted-fg">
      <span className="flex gap-0.5" aria-hidden>
        {[0, 1, 2].map((i) => <span key={i} className={cn("h-1.5 w-3 rounded-full", i < s.dots ? s.tone : "bg-border")} />)}
      </span>
      {qty != null && level !== "out" ? t("stock.exact", { n: qty }) : t(s.key)}
    </span>
  );
}

export function ProductCard({ product, priority = false }: { product: Card; priority?: boolean }) {
  const { t } = useI18n();
  const v = product.variants[0];
  const label = product.category?.name ?? (product.color ? t(`color.${product.color}` as MessageKey) : "");
  const to = usePath();
  return (
    <article className="group relative flex flex-col">
      <Link to={to(`/product/${product.slug}`)} className="relative block aspect-[4/5] overflow-hidden rounded-surface bg-media transition-shadow duration-300 group-hover:shadow-card" tabIndex={-1}>
        <div className="absolute inset-[9%] transition-transform duration-500 ease-out group-hover:scale-[1.04]">
          <ProductImage product={product} className={priority ? "" : undefined} />
        </div>
        <div className="absolute left-3 top-3 flex flex-col items-start gap-1.5">
          {product.promo && <Badge tone="primary">{t("shop.promo")}</Badge>}
          {product.isNew && <Badge tone="inverse">{t("shop.new")}</Badge>}
          {product.organic && <Badge tone="success"><Leaf size={10} /> {t("shop.organic")}</Badge>}
        </div>
      </Link>
      <div className="flex flex-1 flex-col pt-4">
        {label && <p className="text-eyebrow mb-1.5 text-[10px] text-muted-fg">{label}</p>}
        <h3 className="text-[15px] font-medium leading-snug">
          <Link to={to(`/product/${product.slug}`)} className="after:absolute after:inset-0">{product.name}</Link>
        </h3>
        <p className="mt-1 text-[13px] text-muted-fg">
          {[product.producer?.name, v?.vintage, v?.size].filter(Boolean).join(" · ")}
        </p>
        {product.variants.length > 1 && (
          <p className="mt-0.5 text-[12px] text-muted-fg">+ {product.variants.slice(1).map((x) => [x.vintage, x.size].filter(Boolean).join(" · ")).join(", ")}</p>
        )}
        {v && <p className="mt-1 text-[11px] text-muted-fg tabular-nums">{t("product.art")} {v.sku}</p>}
        <div className="mt-auto flex flex-wrap items-end justify-between gap-x-3 gap-y-2 pt-4">
          <PriceTag price={v?.price ?? null} />
          {v && <StockLabel level={v.stock} qty={v.stockQty} />}
        </div>
      </div>
    </article>
  );
}

export function ProductGrid({ products, className }: { products: Card[]; className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-6 md:grid-cols-3 xl:grid-cols-4", className)}>
      {products.map((p, i) => <ProductCard key={p.id} product={p} priority={i < 4} />)}
    </div>
  );
}

/* ── Add to order list ─────────────────────────────────────────────────── */

export function AddToList({ variantId, packSize = 1, compact = false, iconOnly = false, disabled = false }: { variantId: number; packSize?: number; compact?: boolean; iconOnly?: boolean; disabled?: boolean }) {
  const { t } = useI18n();
  const fetcher = useFetcher<{ ok: boolean }>();
  const busy = fetcher.state !== "idle";
  const [done, setDone] = useState(false);
  const prevState = useRef(fetcher.state);
  useEffect(() => {
    if (prevState.current !== "idle" && fetcher.state === "idle" && fetcher.data?.ok) {
      setDone(true);
      const id = setTimeout(() => setDone(false), 1800);
      return () => clearTimeout(id);
    }
    prevState.current = fetcher.state;
  }, [fetcher.state, fetcher.data]);

  return (
    <fetcher.Form method="post" action="/cart" className="flex items-center gap-2">
      <input type="hidden" name="intent" value="add" />
      <input type="hidden" name="variantId" value={variantId} />
      <Stepper name="qty" defaultValue={packSize > 1 && !compact ? packSize : 1} step={1} size={compact ? "sm" : "md"} label={t("product.qty")} />
      {iconOnly ? (
        <Button type="submit" size="iconSm" disabled={busy || disabled} aria-label={t("product.add")} title={t("product.add")} className={cn(done && "bg-success!")}>
          {done ? <Check size={16} /> : <ShoppingBag size={16} strokeWidth={1.6} />}
        </Button>
      ) : (
      <Button type="submit" size={compact ? "sm" : "md"} disabled={busy || disabled} className={cn(compact ? "" : "min-w-[13rem]", done && "bg-success!")}>
        {done ? <><Check size={16} /> {t("product.added")}</> : <>{!compact && <ShoppingBag size={16} strokeWidth={1.6} />} {t("product.add")}</>}
      </Button>
      )}
    </fetcher.Form>
  );
}

export function Toast({ children }: { children: ReactNode }) {
  return <div role="status" className="animate-fade-up fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-btn bg-fg px-5 py-3 text-sm text-bg shadow-pop">{children}</div>;
}
