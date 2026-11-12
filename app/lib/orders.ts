export const ORDER_STATUSES = ["new", "confirmed", "processing", "shipped", "completed", "cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
