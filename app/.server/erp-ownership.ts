import { getSetting } from "./settings";

/**
 * Field ownership between the shop and a connected ERP (vinX or any driver).
 *
 *  ERP → shop (pulled on every sync, read-only in the admin): the fields listed in vinx.ownedFields
 *            (default: price, stock, vintage, size, active, taxClass, packSize)
 *  shop → ERP (pushed through the outbox): orders, new customers and customer changes (vinX OnlineAddress)
 *  shop only: texts, images, logos, categories, visibility flags, producer portraits
 *
 * The vinX Shop API v2.0 accepts writes only for orders and addresses (Online/Basket, Online/OnlineAddress),
 * so article master data is ERP-led; an admin edit to an ERP-owned field would be overwritten by the next sync
 * and is therefore locked in the UI and rejected by the actions.
 */
export async function erpOwnedFields(): Promise<string[]> {
  const vinx = await getSetting("vinx");
  return vinx.enabled ? vinx.ownedFields : [];
}

export async function erpConnected() {
  return (await getSetting("vinx")).enabled;
}
