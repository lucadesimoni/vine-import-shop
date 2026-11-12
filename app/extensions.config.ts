import type { Extension } from "~/.server/extensions";
import orderWebhook from "~/extensions/order-webhook";

/**
 * Enabled extensions (order = load order). Add your own folder under app/extensions/ and list it here.
 * Each extension reads its own configuration from environment variables or its settings.
 */
const extensions: Extension[] = [orderWebhook];
export default extensions;
