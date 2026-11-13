/**
 * The software product and its owner (copyright holder / licensor). One place for the name shown in the admin,
 * the System page, the build banner and the licence documents. The merchant's brand (storefront) is separate:
 * shops are white-label and show only the licensee's brand to their customers.
 */
export const PRODUCT = {
  name: "Vine Import Shop",
  owner: "Luca De Simoni",
  ownerUrl: "https://github.com/lucadesimoni",
  /** first year of publication (copyright notice: "© 2026–<current year>") */
  since: 2026,
} as const;

export const copyright = (year = new Date().getFullYear()) =>
  `© ${PRODUCT.since}${year > PRODUCT.since ? `–${year}` : ""} ${PRODUCT.owner}`;
