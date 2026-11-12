import type { Route } from "./+types/story";
import { getSetting } from "~/.server/settings";
import { tl } from "~/lib/localized";
import { useI18n } from "~/lib/i18n";
import { Eyebrow, Lines } from "~/components/ui";

export async function loader() {
  return { story: await getSetting("story") };
}

export default function Story({ loaderData }: Route.ComponentProps) {
  const { story } = loaderData;
  const { locale } = useI18n();
  const L = (v: Parameters<typeof tl>[0]) => tl(v, locale);
  return (
    <>
      <section className="container-page grid gap-8 py-20 md:py-28">
        <Eyebrow>{L(story.eyebrow)}</Eyebrow>
        <h1 className="text-display"><Lines text={L(story.title)} /></h1>
        <p className="text-lead max-w-2xl text-muted-fg">{L(story.intro)}</p>
      </section>
      {story.imageUrl && (
        <div className="container-page"><img src={story.imageUrl} alt="" className="aspect-[21/9] w-full rounded-lg object-cover" /></div>
      )}
      <section className="container-page py-20 md:py-28">
        <ol className="relative grid gap-14 border-l border-border pl-8 md:mx-auto md:max-w-3xl md:pl-14">
          {story.timeline.map((s, i) => (
            <li key={i} className="relative grid gap-2">
              <span aria-hidden className="absolute -left-[37px] top-3 h-2.5 w-2.5 rounded-full bg-primary ring-4 ring-bg md:-left-[61px]" />
              <span className="font-display text-4xl text-primary">{s.year}</span>
              <h2 className="text-h3">{L(s.title)}</h2>
              <p className="max-w-xl text-muted-fg">{L(s.text)}</p>
            </li>
          ))}
        </ol>
      </section>
      {L(story.quote) && (
        <section className="bg-inverse py-24 text-on-inverse">
          <blockquote className="container-page max-w-4xl text-center font-display text-3xl italic leading-snug md:text-4xl">«{L(story.quote)}»</blockquote>
        </section>
      )}
    </>
  );
}
