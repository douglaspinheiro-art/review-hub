/**
 * Shared pagination constants — keeps page sizes consistent and discoverable.
 * Values differ intentionally: contacts rows are lightweight; cart rows carry
 * richer payload (line items, recovery context) so a smaller page avoids large
 * payloads on slow connections.
 */

/** Rows per page in the Contacts table. */
export const PAGE_SIZE_CONTACTS = 50;

/** Rows per page in the Abandoned Carts view. */
export const PAGE_SIZE_CARTS = 20;
