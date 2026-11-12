/**
 * In-process domain events. Core listeners live in app/.server/listeners.ts; extensions subscribe via api.on().
 * Listener failures are logged and never break the request.
 * Extensions add their own events with declaration merging:
 *   declare module "~/.server/events" { interface EventMap { "acme.synced": { count: number } } }
 */
export interface EventMap {
  "order.placed": { orderId: number };
  "order.paid": { orderId: number };
  "order.status": { orderId: number; status: string };
  "customer.registered": { userId: number };
  "trade.applied": { userId: number | null; email: string };
  "trade.approved": { userId: number };
}

type Listener<K extends keyof EventMap> = (payload: EventMap[K]) => Promise<void> | void;
const listeners: { [K in keyof EventMap]?: Listener<K>[] } = {};

export function on<K extends keyof EventMap>(event: K, fn: Listener<K>) {
  ((listeners[event] ??= []) as Listener<K>[]).push(fn);
}

export async function emit<K extends keyof EventMap>(event: K, payload: EventMap[K]) {
  await import("./listeners");
  await (await import("./extensions")).bootExtensions();
  for (const fn of listeners[event] ?? []) {
    try {
      await fn(payload);
    } catch (e) {
      console.error(`[event:${event}]`, e);
    }
  }
}
