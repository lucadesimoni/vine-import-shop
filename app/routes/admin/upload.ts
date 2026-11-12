import type { Route } from "./+types/upload";
import { requireStaff } from "~/.server/auth";
import { saveUpload } from "~/.server/storage";

/** Image upload for the page builder: POST multipart "file" → { url }. Staff only. */
export async function action({ request }: Route.ActionArgs) {
  await requireStaff(request);
  const file = (await request.formData()).get("file");
  if (!(file instanceof File) || !file.size) return Response.json({ error: "Keine Datei" }, { status: 400 });
  try {
    return Response.json({ url: await saveUpload(file, "content") });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
