import { asc, eq } from "drizzle-orm";
import { data, Form, Link, useActionData, useSearchParams } from "react-router";
import { ExternalLink, Plus } from "lucide-react";
import type { Route } from "./+types/content";
import { getDb, schema } from "~/.server/db";
import { getSettings, saveSetting } from "~/.server/settings";
import { saveUpload } from "~/.server/storage";
import { SETTINGS } from "~/lib/settings";
import { slugify } from "~/lib/slug";
import { cn } from "~/lib/cn";
import type { Localized } from "~/lib/localized";
import { Button, ButtonLink, Field, Input, Notice, Textarea } from "~/components/ui";
import { formToObject, LocalizedInput, PageHeader, Panel, SaveBar, Toggle } from "~/components/admin";

const SECTIONS = [
  { key: "home", label: "Startseite", href: "/" },
  { key: "trade", label: "Gastronomie / B2B", href: "/trade" },
  { key: "story", label: "Geschichte", href: "/story" },
  { key: "pages", label: "Seiten (Impressum, AGB …)", href: null },
] as const;

export async function loader({ request }: Route.LoaderArgs) {
  const tab = new URL(request.url).searchParams.get("tab") ?? "home";
  const db = await getDb();
  const [settings, pages] = await Promise.all([getSettings("home", "trade", "story", "shop"), db.select().from(schema.pages).orderBy(asc(schema.pages.id))]);
  return { tab, home: settings.home, trade: settings.trade, story: settings.story, locales: settings.shop.locales, pages };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const intent = String(form.get("intent"));
  const db = await getDb();

  if (intent === "home-hero") {
    const o = formToObject(form) as Record<string, any>;
    const { home } = await getSettings("home");
    const file = form.get("heroFile");
    const imageUrl = file instanceof File && file.size ? await saveUpload(file, "content") : String(o.hero.imageUrl ?? "");
    await saveSetting("home", {
      ...home,
      hero: { ...home.hero, eyebrow: o.hero.eyebrow, title: o.hero.title, text: o.hero.text, imageUrl, primary: { label: o.hero.primary.label, href: o.hero.primary.href || "/shop" } },
      categories: { ...home.categories, show: form.has("show.categories") },
      promo: { ...home.promo, show: form.has("show.promo") },
      spotlight: { ...home.spotlight, show: form.has("show.spotlight"), productSlug: String(o.spotlightSlug ?? home.spotlight.productSlug) },
      story: { ...home.story, show: form.has("show.story") },
      brands: { ...home.brands, show: form.has("show.brands") },
    });
    return { ok: true };
  }
  if (intent === "json") {
    const key = String(form.get("key")) as "home" | "trade" | "story";
    try {
      const parsed = SETTINGS[key].safeParse(JSON.parse(String(form.get("json"))));
      if (!parsed.success) return data({ error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).slice(0, 5).join(" · ") }, { status: 400 });
      await saveSetting(key, parsed.data);
      return { ok: true };
    } catch (e) {
      return data({ error: `JSON ungültig: ${(e as Error).message}` }, { status: 400 });
    }
  }
  if (intent === "page") {
    const o = formToObject(form) as Record<string, any>;
    const id = Number(form.get("id"));
    const clean = (v: Record<string, string>) => Object.fromEntries(Object.entries(v ?? {}).filter(([, x]) => String(x).trim())) as Localized;
    const values = { title: clean(o.title), body: clean(o.body), showInFooter: form.has("showInFooter"), updatedAt: new Date() };
    if (id) await db.update(schema.pages).set(values).where(eq(schema.pages.id, id));
    else await db.insert(schema.pages).values({ ...values, slug: slugify(String(o.slug || values.title.de || "seite")) });
    return { ok: true };
  }
  return data({ error: "unknown" }, { status: 400 });
}

export default function Content({ loaderData }: Route.ComponentProps) {
  const { tab, home, trade, story, locales, pages } = loaderData;
  const result = useActionData<typeof action>();
  const [params] = useSearchParams();
  const editPage = params.get("page");
  const current = SECTIONS.find((s) => s.key === tab) ?? SECTIONS[0];

  return (
    <>
      <PageHeader title="Inhalte" subtitle="Texte und Bilder aller Seiten — mehrsprachig." actions={current.href && <ButtonLink to={current.href} target="_blank" variant="secondary" size="sm"><ExternalLink size={14} /> Ansehen</ButtonLink>} />
      <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-border">
        {SECTIONS.map((s) => (
          <Link key={s.key} to={`?tab=${s.key}`} className={cn("-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm transition-colors", tab === s.key ? "border-primary font-medium text-fg" : "border-transparent text-muted-fg hover:text-fg")}>{s.label}</Link>
        ))}
      </nav>
      {result && "error" in result && <Notice tone="danger" className="mb-6">{result.error}</Notice>}

      {tab === "home" && (
        <>
          <Form method="post" encType="multipart/form-data" className="grid gap-6">
            <input type="hidden" name="intent" value="home-hero" />
            <Panel title="Hero">
              <div className="grid gap-5 lg:grid-cols-2">
                <LocalizedInput label="Eyebrow" name="hero.eyebrow" value={home.hero.eyebrow} locales={locales} />
                <LocalizedInput label="Titel (Zeilenumbruch mit Enter)" name="hero.title" value={home.hero.title} locales={locales} multiline rows={2} />
                <LocalizedInput label="Text" name="hero.text" value={home.hero.text} locales={locales} multiline rows={3} />
                <div className="grid content-start gap-4">
                  <LocalizedInput label="Button" name="hero.primary.label" value={home.hero.primary.label} locales={locales} />
                  <Field label="Button-Link">{(id) => <Input id={id} name="hero.primary.href" defaultValue={home.hero.primary.href} size="sm" />}</Field>
                  <Field label="Hintergrundbild">{(id) => <Input id={id} name="heroFile" type="file" accept="image/jpeg,image/webp,image/png" className="h-auto py-1.5 text-[12px]" />}</Field>
                  <input type="hidden" name="hero.imageUrl" value={home.hero.imageUrl} />
                  {home.hero.imageUrl && <img src={home.hero.imageUrl} alt="" className="aspect-[21/9] w-full rounded-surface object-cover" />}
                </div>
              </div>
            </Panel>
            <Panel title="Sektionen">
              <div className="grid divide-y divide-border sm:grid-cols-2 sm:gap-x-10 sm:divide-y-0">
                <Toggle name="show.categories" label="Kategorien" defaultChecked={home.categories.show} />
                <Toggle name="show.promo" label="Aktionen-Karussell" defaultChecked={home.promo.show} />
                <Toggle name="show.spotlight" label="Produkt im Fokus" defaultChecked={home.spotlight.show} />
                <Toggle name="show.story" label="Geschichte" defaultChecked={home.story.show} />
                <Toggle name="show.brands" label="Marken" defaultChecked={home.brands.show} />
              </div>
              <Field label="Produkt im Fokus (Slug)" className="mt-4 max-w-md">{(id) => <Input id={id} name="spotlightSlug" defaultValue={home.spotlight.productSlug} size="sm" />}</Field>
            </Panel>
            <SaveBar saved={!!result && "ok" in result} />
          </Form>
          <JsonEditor settingKey="home" value={home} />
        </>
      )}
      {tab === "trade" && <JsonEditor settingKey="trade" value={trade} open />}
      {tab === "story" && <JsonEditor settingKey="story" value={story} open />}

      {tab === "pages" && (
        <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
          <Panel>
            <ul className="grid gap-1 text-sm">
              {pages.map((p) => (
                <li key={p.id}><Link to={`?tab=pages&page=${p.id}`} className={cn("block rounded-control px-3 py-2 hover:bg-muted", editPage === String(p.id) && "bg-primary-soft font-medium text-primary")}>{p.title.de ?? p.slug}<span className="block text-[12px] font-normal text-muted-fg">/page/{p.slug}</span></Link></li>
              ))}
              <li><Link to="?tab=pages&page=new" className="flex items-center gap-2 rounded-control px-3 py-2 text-primary hover:bg-muted"><Plus size={14} /> Neue Seite</Link></li>
            </ul>
          </Panel>
          {editPage && (() => {
            const page = pages.find((p) => String(p.id) === editPage);
            return (
              <Form method="post" key={editPage}>
                <input type="hidden" name="intent" value="page" />
                <input type="hidden" name="id" value={page?.id ?? ""} />
                <Panel title={page ? page.title.de ?? page.slug : "Neue Seite"} description="Markdown: ## Titel, **fett**, *kursiv*, - Liste, [Link](https://…)">
                  <div className="grid gap-5">
                    {!page && <Field label="URL-Slug">{(id) => <Input id={id} name="slug" size="sm" />}</Field>}
                    <LocalizedInput label="Titel" name="title" value={page?.title} locales={locales} />
                    <LocalizedInput label="Inhalt" name="body" value={page?.body} locales={locales} multiline rows={10} />
                    <Toggle name="showInFooter" label="Im Footer verlinken" defaultChecked={page?.showInFooter ?? true} />
                  </div>
                </Panel>
                <SaveBar saved={!!result && "ok" in result} />
              </Form>
            );
          })()}
        </div>
      )}
    </>
  );
}

function JsonEditor({ settingKey, value, open = false }: { settingKey: "home" | "trade" | "story"; value: unknown; open?: boolean }) {
  return (
    <details open={open} className="group mt-6 rounded-surface border border-border bg-surface">
      <summary className="cursor-pointer list-none px-6 py-4 text-[15px] font-semibold">
        Alle Texte & Listen bearbeiten <span className="text-[13px] font-normal text-muted-fg">— strukturiert (JSON), wird vor dem Speichern validiert</span>
      </summary>
      <Form method="post" className="grid gap-4 px-6 pb-6">
        <input type="hidden" name="intent" value="json" />
        <input type="hidden" name="key" value={settingKey} />
        <Textarea name="json" defaultValue={JSON.stringify(value, null, 2)} rows={24} spellCheck={false} className="font-mono text-[12.5px] leading-relaxed" />
        <Button type="submit" className="w-fit">Speichern</Button>
      </Form>
    </details>
  );
}
