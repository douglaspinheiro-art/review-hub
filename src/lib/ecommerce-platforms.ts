/**
 * Lista canônica para cadastro e diagnóstico. "Outra" sempre por último.
 * NOTA: Tray temporariamente oculta por problemas técnicos.
 */
export const ECOMMERCE_PLATFORMAS = [
  "Shopify",
  "Nuvemshop",
  "VTEX",
  "WooCommerce",
  "Yampi",
  "Shopee",
  "Magento",
  "Dizy Commerce",
  "Outra",
] as const;

/**
 * Funil / ConvertIQ usam rótulo "Outro" e conjunto enxuto.
 */
export const ECOMMERCE_PLATFORMAS_FUNIL = [
  "Shopify",
  "VTEX",
  "WooCommerce",
  "Nuvemshop",
  "Shopee",
  "Magento",
  "Dizy Commerce",
  "Outro",
] as const;

/** Chips de e-commerce (landing / dashboard) */
export const ECOMMERCE_PLATFORM_CHIPS = [
  "Shopify",
  "Nuvemshop",
  "WooCommerce",
  "VTEX",
  "Yampi",
  "Shopee",
  "Magento",
  "Dizy Commerce",
] as const;
