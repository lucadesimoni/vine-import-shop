/**
 * Product details maintained in the ERP (vinX BaseData/Wine, WineRating, Article): read-only in the shop,
 * refreshed on every article sync. Shop texts (description, pairing) stay shop-owned.
 */
export type ErpRating = { source: string; points: number | null; max: number | null; unit: string | null; text: string | null; vintage: string | null };
export type ErpDetails = {
  characteristic?: string;
  vinification?: string;
  terroir?: string;
  advice?: string;
  history?: string;
  drinkTemp?: string;
  storage?: string;
  ratings?: ErpRating[];
  ean?: string;
  rarity?: boolean;
  brand?: string;
};
