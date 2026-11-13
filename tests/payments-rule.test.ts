import { describe, expect, it } from "vitest";
import { customerPaymentRule } from "~/.server/payments";

const enabled = ["invoice", "prepayment", "stripe"];
const vinx = { enabled: true, paymentConditionMap: { invoice: 2, prepayment: 1, stripe: 7 }, paymentConditionMethods: {} as Record<string, string[]> };
const user = (u: object) => ({ paymentMethods: null, erpPaymentConditionId: null, group: null, ...u }) as never;

describe("payment methods per customer", () => {
  it("customer setting wins over everything", () => {
    expect(customerPaymentRule(user({ paymentMethods: ["invoice"], erpPaymentConditionId: 1, group: { paymentMethods: ["stripe"] } }), vinx, enabled)).toEqual({ methods: ["invoice"], source: "customer" });
  });
  it("vinX payment terms: invoice only with the invoice condition", () => {
    expect(customerPaymentRule(user({ erpPaymentConditionId: 2 }), vinx, enabled)).toEqual({ methods: ["invoice", "prepayment", "stripe"], source: "vinx" });
    expect(customerPaymentRule(user({ erpPaymentConditionId: 1 }), vinx, enabled)).toEqual({ methods: ["prepayment", "stripe"], source: "vinx" });
  });
  it("explicit vinX mapping per condition", () => {
    expect(customerPaymentRule(user({ erpPaymentConditionId: 9 }), { ...vinx, paymentConditionMethods: { "9": ["stripe"] } }, enabled)).toEqual({ methods: ["stripe"], source: "vinx" });
  });
  it("group, then everything; vinX ignored when the ERP is off", () => {
    expect(customerPaymentRule(user({ erpPaymentConditionId: 1, group: { paymentMethods: ["invoice", "stripe"] } }), { ...vinx, enabled: false }, enabled)).toEqual({ methods: ["invoice", "stripe"], source: "group" });
    expect(customerPaymentRule(null as never, vinx, enabled)).toEqual({ methods: null, source: null });
  });
});
