import type { Route } from "./+types/payments";
import { handleWebhook } from "~/.server/payments";

/** Provider webhooks: POST /api/payments/stripe | mollie | datatrans | payrexx */
export const action = ({ request, params }: Route.ActionArgs) => handleWebhook(params.provider, request);
export const loader = () => Response.json({ error: "POST only" }, { status: 405 });
