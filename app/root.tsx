import { useMemo } from "react";
import { data, redirect, isRouteErrorResponse, Links, Meta, Outlet, Scripts, ScrollRestoration, useRouteLoaderData } from "react-router";
import type { Route } from "./+types/root";
import "./app.css";
import { buildShopContext, shopContext } from "./.server/context";
import { getSession, commit } from "./.server/auth";
import { getCart } from "./.server/cart";
import { getDb, schema } from "./.server/db";
import { I18nContext, makeT, messagesFor } from "./lib/i18n";
import { tl, type Locale } from "./lib/localized";
import { fontsHref, themeCss } from "./lib/theme";
import { ButtonLink } from "./components/ui";
import { channelPath } from "./lib/channel";
import type { ShopContext } from "./.server/context";

/** Routes requests to the right sales channel and domain (see lib/channel.ts). */
function channelRedirect(request: Request, ctx: ShopContext) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (/^\/(api|admin|cart|logout|set-locale|uploads|assets|demo)\b|\.\w+$/.test(path)) return;
  const { mode, portal, canUsePortal } = ctx.channel;
  const { portalHost, shopHost } = ctx.shop.channels;
  const host = (request.headers.get("X-Forwarded-Host") ?? url.host).split(":")[0];
  const proto = request.headers.get("X-Forwarded-Proto") ?? url.protocol.replace(":", "");
  const go = (p: string, toHost?: string): never => {
    const target = p + (p.includes("?") ? "" : url.search);
    throw redirect(toHost && toHost !== host ? `${proto}://${toHost}${target}` : target);
  };

  if (portal) {
    if (mode === "shop-only") go("/", shopHost || undefined);
    // Portal requested on the shop domain → move to the portal domain.
    if (portalHost && host !== portalHost && (host === shopHost || mode === "separate")) go(path, portalHost);
    return;
  }
  const toPortal = channelPath(path, true);
  const mapped = toPortal !== path;
  // Portal domain: every shop page leads into the portal (legal/content pages stay reachable).
  if (portalHost && host === portalHost && mode !== "shop-only" && (mapped || path === "/")) go(toPortal);
  if (mode === "portal-only" && mapped) go(toPortal, portalHost || undefined);
  // Dedicated B2C domain: shop pages requested elsewhere (e.g. the portal domain) are handled above;
  // in "separate" mode trade customers keep their own area in the portal.
  if (mode === "separate" && canUsePortal && /^\/account(\/|$)/.test(path)) go(toPortal, portalHost || undefined);
}

/** Absolute origin for a configured channel domain, or "" to stay on the current one. */
function hostUrl(request: Request, host: string) {
  if (!host) return "";
  const url = new URL(request.url);
  const current = (request.headers.get("X-Forwarded-Host") ?? url.host).split(":")[0];
  if (current === host) return "";
  return `${request.headers.get("X-Forwarded-Proto") ?? url.protocol.replace(":", "")}://${host}`;
}

/** Root middleware: builds the request context once; rejects cross-site form posts. */
export const middleware: Route.MiddlewareFunction[] = [
  async ({ request, context }) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      const origin = request.headers.get("Origin");
      const url = new URL(request.url);
      const isApi = url.pathname.startsWith("/api/");
      if (!isApi && origin && new URL(origin).host !== (request.headers.get("X-Forwarded-Host") ?? url.host)) {
        throw new Response("Cross-site request blocked", { status: 403 });
      }
    }
    const ctx = await buildShopContext(request);
    context.set(shopContext, ctx);
    if (request.method === "GET") channelRedirect(request, ctx);
  },
];

export async function loader({ request, context }: Route.LoaderArgs) {
  const ctx = context.get(shopContext);
  const session = await getSession(request);
  const toast = session.get("toast") ?? null;
  const cart = await getCart(request, ctx);
  const db = await getDb();
  const pages = await db.select({ slug: schema.pages.slug, title: schema.pages.title, showInFooter: schema.pages.showInFooter }).from(schema.pages);
  const headers = new Headers();
  if (toast) headers.append("Set-Cookie", await commit(session));
  else if (cart.setCookie) headers.append("Set-Cookie", cart.setCookie);

  return data(
    {
      brand: ctx.brand,
      shop: {
        locales: ctx.shop.locales,
        currency: ctx.shop.currency,
        priceVisibility: ctx.shop.priceVisibility,
        ageGate: ctx.shop.ageGate,
        minAge: ctx.shop.minAge,
      },
      locale: ctx.locale,
      messages: messagesFor(ctx.locale),
      user: ctx.user
        ? { name: ctx.user.name, email: ctx.user.email, role: ctx.user.role, company: ctx.user.company, tradeStatus: ctx.user.tradeStatus, isTrade: ctx.isTrade, groupName: ctx.user.group?.name ?? null }
        : null,
      showPrices: ctx.showPrices,
      channel: { mode: ctx.channel.mode, portalEnabled: ctx.channel.portalEnabled, canUsePortal: ctx.channel.canUsePortal, shopUrl: hostUrl(request, ctx.shop.channels.shopHost), portalUrl: hostUrl(request, ctx.shop.channels.portalHost) },
      cartCount: cart.items.reduce((a, i) => a + i.qty, 0),
      footerPages: pages.filter((p) => p.showInFooter).map((p) => ({ slug: p.slug, title: tl(p.title, ctx.locale) })),
      toast,
      origin: new URL(request.url).origin,
    },
    { headers },
  );
}

export type RootData = Awaited<ReturnType<typeof loader>>["data"];

export const meta: Route.MetaFunction = ({ loaderData: data }) => [
  { title: data ? `${data.brand.name}${tl(data.brand.tagline, data.locale) ? ` — ${tl(data.brand.tagline, data.locale)}` : ""}` : "Shop" },
  { name: "description", content: data ? tl(data.brand.tagline, data.locale) : "" },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const root = useRouteLoaderData("root") as RootData | undefined;
  return (
    <html lang={root?.locale ?? "de"}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {root && (
          <>
            <link rel="preconnect" href="https://fonts.bunny.net" />
            <link rel="stylesheet" href={fontsHref(root.brand)} />
            <style dangerouslySetInnerHTML={{ __html: themeCss(root.brand) }} />
            <meta name="theme-color" content={root.brand.colors.background} />
            {root.brand.faviconUrl && <link rel="icon" href={root.brand.faviconUrl} />}
            {root.shop.locales.map((l) => <link key={l} rel="alternate" hrefLang={l} href={`?lang=${l}`} />)}
          </>
        )}
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App({ loaderData }: Route.ComponentProps) {
  const i18n = useMemo(
    () => ({ locale: loaderData.locale as Locale, locales: loaderData.shop.locales as Locale[], t: makeT(loaderData.messages) }),
    [loaderData.locale, loaderData.messages, loaderData.shop.locales],
  );
  return (
    <I18nContext.Provider value={i18n}>
      <Outlet />
    </I18nContext.Provider>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const root = useRouteLoaderData("root") as RootData | undefined;
  const t = makeT(root?.messages ?? messagesFor("de"));
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  return (
    <main className="container-page grid min-h-[70vh] place-content-center justify-items-center gap-4 py-24 text-center">
      <p className="text-display text-primary">{isRouteErrorResponse(error) ? error.status : 500}</p>
      <h1 className="text-h2">{notFound ? t("common.notFound") : t("common.error")}</h1>
      {notFound && <p className="text-muted-fg">{t("common.notFoundText")}</p>}
      {import.meta.env.DEV && error instanceof Error && <pre className="max-w-3xl overflow-auto rounded-control bg-muted p-4 text-left text-xs">{error.stack}</pre>}
      <ButtonLink to="/" variant="secondary">{t("common.toHome")}</ButtonLink>
    </main>
  );
}
