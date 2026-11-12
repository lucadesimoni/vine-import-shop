import { data, redirect } from "react-router";
import type { Route } from "./+types/cart";
import { shopContext } from "~/.server/context";
import { addItem, findCoupon, getCart, setCoupon, updateCart } from "~/.server/cart";
import { commit, getSession } from "~/.server/auth";

/** All order-list mutations. Works with JS (fetcher) and without (form post + redirect). */
export async function action({ request, context }: Route.ActionArgs) {
  const ctx = context.get(shopContext);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const cart = await getCart(request, ctx, true);
  const headers = new Headers();
  if (cart.setCookie) headers.append("Set-Cookie", cart.setCookie);
  const id = cart.id!;

  if (intent === "add") {
    const variantId = Number(form.get("variantId"));
    const qty = Math.max(1, Number(form.get("qty") ?? 1) || 1);
    await updateCart(id, (items) => addItem(items, variantId, qty));
  } else if (intent === "set") {
    const updates = [...form.entries()].filter(([k]) => k.startsWith("qty:")).map(([k, v]) => [Number(k.slice(4)), Number(v)] as const);
    await updateCart(id, (items) => items.map((i) => ({ ...i, qty: updates.find(([vid]) => vid === i.variantId)?.[1] ?? i.qty })));
  } else if (intent === "remove") {
    const variantId = Number(form.get("variantId"));
    await updateCart(id, (items) => items.filter((i) => i.variantId !== variantId));
  } else if (intent === "coupon" && ctx.shop.modules.coupons) {
    const code = String(form.get("code") ?? "").trim();
    const coupon = code ? await findCoupon(code) : null;
    await setCoupon(id, coupon ? coupon.code : null);
    const session = await getSession(request);
    if (code) session.flash("toast", { kind: coupon ? "success" : "error", text: ctx.t(coupon ? "cart.couponApplied" : "cart.couponInvalid") });
    headers.append("Set-Cookie", await commit(session));
  } else {
    throw data("Bad intent", { status: 400 });
  }

  const back = String(form.get("redirectTo") ?? "");
  if (back.startsWith("/") && !back.startsWith("//")) return redirect(back, { headers });
  return data({ ok: true }, { headers });
}

export const loader = () => redirect("/order-list");
