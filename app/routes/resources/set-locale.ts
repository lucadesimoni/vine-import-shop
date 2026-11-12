import { redirect } from "react-router";
import type { Route } from "./+types/set-locale";
import { commit, getSession, safeRedirect } from "~/.server/auth";
import { isLocale } from "~/lib/localized";

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const locale = form.get("locale");
  const session = await getSession(request);
  if (isLocale(locale)) session.set("locale", locale);
  return redirect(safeRedirect(form.get("redirectTo")), { headers: { "Set-Cookie": await commit(session) } });
}
export const loader = () => redirect("/");
