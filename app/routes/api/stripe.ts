import type { Route } from "./+types/stripe";
import { handleStripeWebhook } from "~/.server/payments";

export const action = ({ request }: Route.ActionArgs) => handleStripeWebhook(request);
