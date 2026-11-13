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
  /** BaseData/Classification of the wine, e.g. DOCG */
  classification?: string;
  /** BaseData/ProductCycle, e.g. "Auslaufartikel", "Neuheit" */
  cycle?: string;
  /** Wine.acidity / Wine.residualSugar (g/l) */
  acidity?: number;
  residualSugar?: number;
  /** BaseData/Ingredients: food labelling */
  ingredients?: string;
  nutrition?: string;
  allergens?: string;
  /** BaseData/SellingSet: contents of a set article (vinX article ids, resolved to products on the page) */
  set?: { articleId: string; amount: number }[];
  /** Article.substituteArticleId / substituteArticleText */
  substitute?: { articleId?: string; text?: string };
  /** BaseData/Condition (Rarities add-in): bottle condition of the stock, e.g. label, capsule, fill level */
  condition?: { id: number; designation: string; quality?: string; level?: string; label?: string; capsule?: string };
};
