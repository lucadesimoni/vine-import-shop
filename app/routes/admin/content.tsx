import { useState } from "react";
import { asc, eq } from "drizzle-orm";
import { data, Form, Link, redirect, useActionData, useSearchParams } from "react-router";
import { ExternalLink, FileText, Plus, Trash2 } from "lucide-react";
import type { Route } from "./+types/content";
import { getDb, schema } from "~/.server/db";
import { getSettings, saveSetting } from "~/.server/settings";
import { homeBlocks, sanitizeBlocks } from "~/.server/blocks";
import { SETTINGS } from "~/lib/settings";
import { slugify } from "~/lib/slug";
import { cn } from "~/lib/cn";
import { newBlockId, type Block } from "~/lib/blocks";
import type { Localized } from "~/lib/localized";
import { Button, ButtonLink, Field, Input, Notice, Textarea } from "~/components/ui";
import { formToObject, LocalizedInput, PageHeader, Panel, SaveBar, Toggle } from "~/components/admin";
import { BlockEditor } from "~/components/block-editor";

const SECTIONS = [
  { key: "home", label: "Startseite", href: "/" },
  { key: "pages", label: "Seiten", href: null },
  { key: "trade", label: "Gastronomie / B2B", href: "/trade" },
  { key: "story", label: "Geschichte", href: "/story" },
] as const;

export async function loader({ request }: Route.LoaderArgs) {
  const tab = new URL(request.url).searchParams.get("tab") ?? "home";
  const db = await getDb();
  const [settings, pages, products, categories, producers] = await Promise.all([
    getSettings("home", "trade", "story", "shop"),
    db.select().from(schema.pages).orderBy(asc(schema.pages.id)),
    db.select({ slug: schema.products.slug, name: schema.products.name }).from(schema.products).where(eq(schema.products.active, true)).orderBy(asc(schema.products.slug)),
    db.select({ slug: schema.categories.slug, name: schema.categories.name }).from(schema.categories).orderBy(asc(schema.categories.sort)),
    db.select({ slug: schema.producers.slug, name: schema.producers.name }).from(schema.producers).orderBy(asc(schema.producers.name)),
  ]);
  return {
    tab,
    homeBlocks: homeBlocks(settings.home),
    trade: settings.trade,
    story: settings.story,
    locales: settings.shop.locales,
    pages,
    options: {
      products: products.map((p) => [p.slug, p.name.de ?? Object.values(p.name)[0] ?? p.slug] as [string, string]).sort((a, b) => a[1].localeCompare(b[1])),
      categories: categories.map((c) => [c.slug, c.name.de ?? c.slug] as [string, string]),
      producers: producers.map((p) => [p.slug, p.name] as [string, string]),
    },
  };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const intent = String(form.get("intent"));
  const db = await getDb();
  const blocks = () => sanitizeBlocks(String(form.get("blocks") ?? "[]"));

  try {
    if (intent === "blocks") {
      const key = String(form.get("key"));
      const s = await getSettings("home", "trade", "story");
      if (key === "home") await saveSetting("home", { ...s.home, blocks: blocks() });
      else if (key === "trade") await saveSetting("trade", { ...s.trade, blocks: blocks() });
      else if (key === "story") await saveSetting("story", { ...s.story, blocks: blocks() });
      return { ok: "Gespeichert." };
    }
    if (intent === "home-reset") {
      const { home } = await getSettings("home");
      await saveSetting("home", { ...home, blocks: undefined });
      return { ok: "Startseite auf die Standard-Bausteine zurückgesetzt." };
    }
    if (intent === "json") {
      const key = String(form.get("key")) as "trade" | "story";
      const parsed = SETTINGS[key].safeParse(JSON.parse(String(form.get("json"))));
      if (!parsed.success) return data({ error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).slice(0, 5).join(" · ") }, { status: 400 });
      const cur = await getSettings("trade", "story");
      await saveSetting(key, { ...parsed.data, blocks: cur[key].blocks }); // blocks are edited in the block editor
      return { ok: "Gespeichert." };
    }
    if (intent === "page") {
      const o = formToObject(form) as Record<string, any>;
      const id = Number(form.get("id"));
      const clean = (v: Record<string, string>) => Object.fromEntries(Object.entries(v ?? {}).filter(([, x]) => String(x).trim())) as Localized;
      const mode = form.get("mode") === "blocks" ? "blocks" : "text";
      const values = { title: clean(o.title), body: clean(o.body), blocks: mode === "blocks" ? blocks() : null, showInFooter: form.has("showInFooter"), updatedAt: new Date() };
      if (!values.title.de && !Object.values(values.title)[0]) return data({ error: "Titel ist erforderlich" }, { status: 400 });
      if (id) {
        await db.update(schema.pages).set(values).where(eq(schema.pages.id, id));
        return { ok: "Gespeichert." };
      }
      const slug = slugify(String(o.slug || values.title.de || Object.values(values.title)[0]));
      if (await db.query.pages.findFirst({ where: eq(schema.pages.slug, slug) })) return data({ error: `Die Adresse /page/${slug} ist schon vergeben` }, { status: 400 });
      const [row] = await db.insert(schema.pages).values({ ...values, slug }).returning();
      return redirect(`/admin/content?tab=pages&page=${row.id}`);
    }
    if (intent === "page-delete") {
      await db.delete(schema.pages).where(eq(schema.pages.id, Number(form.get("id"))));
      return redirect("/admin/content?tab=pages");
    }
  } catch (e) {
    return data({ error: e instanceof SyntaxError ? `JSON ungültig: ${e.message}` : (e as Error).message }, { status: 400 });
  }
  return data({ error: "unknown" }, { status: 400 });
}

export default function Content({ loaderData }: Route.ComponentProps) {
  const { tab, homeBlocks: home, trade, story, locales, pages, options } = loaderData;
  const result = useActionData<typeof action>();
  const [params] = useSearchParams();
  const current = SECTIONS.find((s) => s.key === tab) ?? SECTIONS[0];
  const editPage = params.get("page");

  return (
    <>
      <PageHeader title="Inhalte" subtitle="Seiten aus Bausteinen zusammenstellen — ziehen, ein- und ausblenden, mehrsprachig bearbeiten." actions={current.href && <ButtonLink to={current.href} target="_blank" variant="secondary" size="sm"><ExternalLink size={14} /> Ansehen</ButtonLink>} />
      <nav className="scrollbar-none -mx-4 mb-6 flex gap-1 overflow-x-auto border-b border-border px-4 sm:mx-0 sm:px-0">
        {SECTIONS.map((s) => (
          <Link key={s.key} to={`?tab=${s.key}`} className={cn("-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm transition-colors", tab === s.key ? "border-primary font-medium text-fg" : "border-transparent text-muted-fg hover:text-fg")}>{s.label}</Link>
        ))}
      </nav>
      {result && "error" in result && <Notice tone="danger" className="mb-6">{result.error}</Notice>}
      {result && "ok" in result && <Notice tone="success" className="mb-6">{result.ok}</Notice>}

      {tab === "home" && (
        <>
          <Form method="post" key={JSON.stringify(home)}>
            <input type="hidden" name="intent" value="blocks" />
            <input type="hidden" name="key" value="home" />
            <BlockEditor name="blocks" initial={home} locales={locales} options={options} />
            <SaveBar saved={false} />
          </Form>
          <Form method="post" className="mt-2" onSubmit={(e) => !confirm("Startseite auf die Standard-Bausteine zurücksetzen?") && e.preventDefault()}>
            <input type="hidden" name="intent" value="home-reset" />
            <button className="text-[12px] text-muted-fg underline underline-offset-4 hover:text-fg">Auf Standard zurücksetzen</button>
          </Form>
        </>
      )}

      {(tab === "trade" || tab === "story") && (
        <div className="grid gap-6">
          <Panel title="Zusätzliche Bausteine" description="Erscheinen unterhalb der Seite — z. B. Fragen & Antworten, Produkte, Call-to-Action.">
            <Form method="post">
              <input type="hidden" name="intent" value="blocks" />
              <input type="hidden" name="key" value={tab} />
              <BlockEditor name="blocks" initial={(tab === "trade" ? trade : story).blocks} locales={locales} options={options} only={["text", "imageText", "products", "cta", "faq", "quote", "image", "values", "brands", "origin", "spotlight"]} />
              <Button type="submit" className="mt-4">Bausteine speichern</Button>
            </Form>
          </Panel>
          <JsonEditor settingKey={tab} value={{ ...(tab === "trade" ? trade : story), blocks: undefined }} />
        </div>
      )}

      {tab === "pages" && (
        <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
          <Panel className="self-start">
            <ul className="grid gap-1 text-sm">
              {pages.map((p) => (
                <li key={p.id}>
                  <Link to={`?tab=pages&page=${p.id}`} className={cn("flex items-start gap-2 rounded-control px-3 py-2 hover:bg-muted", editPage === String(p.id) && "bg-primary-soft font-medium text-primary")}>
                    <FileText size={14} className="mt-0.5 shrink-0" />
                    <span className="grid">{p.title.de ?? p.slug}<span className="text-[12px] font-normal text-muted-fg">/page/{p.slug}{p.blocks?.length ? " · Bausteine" : ""}</span></span>
                  </Link>
                </li>
              ))}
              <li><Link to="?tab=pages&page=new" className="flex items-center gap-2 rounded-control px-3 py-2 text-primary hover:bg-muted"><Plus size={14} /> Neue Seite</Link></li>
            </ul>
          </Panel>
          {editPage ? <PageEditor key={editPage} page={pages.find((p) => String(p.id) === editPage)} locales={locales} options={options} /> : <p className="text-sm text-muted-fg">Seite wählen oder neu anlegen. Seiten bestehen aus Bausteinen (z. B. Aktionen, Events, Über uns) oder aus einfachem Text (Impressum, AGB).</p>}
        </div>
      )}
    </>
  );
}

function PageEditor({ page, locales, options }: { page?: Route.ComponentProps["loaderData"]["pages"][number]; locales: string[]; options: Route.ComponentProps["loaderData"]["options"] }) {
  const initialBlocks: Block[] = page?.blocks?.length ? page.blocks : page ? [{ id: newBlockId(), type: "text", enabled: true, data: { title: {}, body: page.body, width: "narrow", align: "left" } }] : [];
  const [mode, setMode] = useState<"blocks" | "text">(page?.blocks?.length ? "blocks" : page ? "text" : "blocks");
  return (
    <div className="grid content-start gap-4">
      <Form method="post" className="grid gap-6">
        <input type="hidden" name="intent" value="page" />
        <input type="hidden" name="id" value={page?.id ?? ""} />
        <input type="hidden" name="mode" value={mode} />
        <Panel title={page ? page.title.de ?? page.slug : "Neue Seite"} actions={page && <ButtonLink to={`/page/${page.slug}`} target="_blank" variant="secondary" size="sm"><ExternalLink size={14} /> Ansehen</ButtonLink>}>
          <div className="grid gap-5">
            {!page && <Field label="Adresse (URL)" hint="z. B. aktionen → /page/aktionen">{(id) => <Input id={id} name="slug" size="sm" />}</Field>}
            <LocalizedInput label="Titel" name="title" value={page?.title} locales={locales} />
            <Toggle name="showInFooter" label="Im Footer verlinken" defaultChecked={page?.showInFooter ?? false} />
            <div className="flex w-fit rounded-control bg-muted p-0.5 text-[13px]" role="tablist" aria-label="Inhalt">
              {(["blocks", "text"] as const).map((m) => (
                <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)} className={cn("rounded-badge px-3 py-1.5", mode === m ? "bg-surface font-medium shadow-sm" : "text-muted-fg")}>{m === "blocks" ? "Bausteine" : "Einfacher Text"}</button>
              ))}
            </div>
          </div>
        </Panel>
        {mode === "blocks" ? (
          <BlockEditor name="blocks" initial={initialBlocks} locales={locales} options={options} />
        ) : (
          <Panel description="Markdown: ## Titel, **fett**, *kursiv*, - Liste, [Link](https://…)">
            <LocalizedInput label="Inhalt" name="body" value={page?.body} locales={locales} multiline rows={14} />
          </Panel>
        )}
        <SaveBar saved={false} />
      </Form>
      {page && (
        <Form method="post" onSubmit={(e) => !confirm(`Seite „${page.title.de ?? page.slug}“ löschen?`) && e.preventDefault()}>
          <input type="hidden" name="intent" value="page-delete" />
          <input type="hidden" name="id" value={page.id} />
          <button className="flex items-center gap-1.5 text-[12px] text-muted-fg hover:text-danger"><Trash2 size={13} /> Seite löschen</button>
        </Form>
      )}
    </div>
  );
}

function JsonEditor({ settingKey, value }: { settingKey: "trade" | "story"; value: unknown }) {
  return (
    <details className="group rounded-surface border border-border bg-surface">
      <summary className="cursor-pointer list-none px-6 py-4 text-[15px] font-semibold">
        Texte & Listen der Seite <span className="text-[13px] font-normal text-muted-fg">— strukturiert (JSON), wird vor dem Speichern geprüft</span>
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
