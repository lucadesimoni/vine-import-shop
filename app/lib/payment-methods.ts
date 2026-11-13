/** Built-in payment methods (codes of the providers in .server/payments.ts). */
export const PAYMENT_METHODS = ["invoice", "prepayment", "stripe", "mollie", "datatrans", "payrexx"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
