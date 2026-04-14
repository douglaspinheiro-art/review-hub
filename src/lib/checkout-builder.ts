/**
 * Checkout Magic Link Builder (Universal Version)
 * 
 * Gera links de checkout pré-preenchidos para plataformas conhecidas 
 * ou estruturas customizadas (Plataforma Própria).
 */

export type EcommercePlatform = 'nuvemshop' | 'shopify' | 'woocommerce' | 'vtex' | 'tray' | 'mercado_livre' | 'dizy' | 'custom';

interface CheckoutParams {
  platform: EcommercePlatform;
  storeUrl: string;
  cartItems: Array<{ id: string; quantity: number }>;
  customerEmail?: string;
  customerName?: string;
  customerPhone?: string;
  couponCode?: string;
  utmSource?: string;
  isRebuy?: boolean; // Se verdadeiro, tenta pular o carrinho e ir direto ao checkout
}

export function buildMagicLink({
  platform,
  storeUrl,
  cartItems,
  customerEmail,
  customerName,
  customerPhone,
  couponCode,
  utmSource = 'ltv_boost',
  isRebuy = false
}: CheckoutParams): string {
  const baseUrl = storeUrl.endsWith('/') ? storeUrl.slice(0, -1) : storeUrl;
  
  // Create a base URL object to manage params easily
  let finalUrl: URL;
  
  try {
    // Padrões de URL base por plataforma
    const checkoutPaths: Record<string, string> = {
      'nuvemshop': isRebuy ? '/checkout' : '/cart/add',
      'shopify': isRebuy ? '/checkout' : '/cart',
      'woocommerce': '/checkout',
      'vtex': '/checkout/cart/add',
      'tray': '/carrinho/adicionar',
      'dizy': '/checkout/cart/add',
      'mercado_livre': '/checkout',
      'custom': ''
    };

    const path = checkoutPaths[platform] ?? '/checkout';
    finalUrl = new URL(`${baseUrl}${path}`);
  } catch (e) {
    return storeUrl;
  }
  
  // Adiciona UTMs padrão para rastreio de atribuição
  finalUrl.searchParams.set('utm_source', utmSource);
  finalUrl.searchParams.set('utm_medium', 'whatsapp');
  finalUrl.searchParams.set('utm_campaign', isRebuy ? 'ltv_rebuy' : 'ltv_recovery');

  if (customerEmail) finalUrl.searchParams.set('email', customerEmail);
  if (customerName)  finalUrl.searchParams.set('name', customerName);
  if (customerPhone) finalUrl.searchParams.set('phone', customerPhone);
  if (couponCode)    finalUrl.searchParams.set('coupon', couponCode);
  if (isRebuy)       finalUrl.searchParams.set('checkout_step', 'payment');

  switch (platform) {
    case 'nuvemshop': {
      if (isRebuy) return finalUrl.toString();
      const nuvemItems = cartItems.map(item => `${item.id}:${item.quantity}`).join(',');
      return `${baseUrl}/cart/add/${nuvemItems}/?${finalUrl.searchParams.toString()}`;
    }

    case 'shopify': {
      const shopifyItems = cartItems.map(item => `${item.id}:${item.quantity}`).join(',');
      const shopifyBase = isRebuy ? `${baseUrl}/checkout` : `${baseUrl}/cart/${shopifyItems}`;
      const url = new URL(shopifyBase);
      finalUrl.searchParams.forEach((v, k) => url.searchParams.set(k, v));
      return url.toString();
    }

    case 'woocommerce':
      if (cartItems.length > 0) {
        finalUrl.searchParams.set('add-to-cart', cartItems[0].id);
        finalUrl.searchParams.set('quantity', String(cartItems[0].quantity));
      }
      return finalUrl.toString();

    case 'vtex':
      if (cartItems.length > 0) {
        finalUrl.searchParams.set('sku', cartItems[0].id);
        finalUrl.searchParams.set('qty', String(cartItems[0].quantity));
        finalUrl.searchParams.set('seller', '1');
      }
      return finalUrl.toString();

    case 'tray':
      if (cartItems.length > 0) {
        finalUrl.searchParams.set('id_produto', cartItems[0].id);
        finalUrl.searchParams.set('quantidade', String(cartItems[0].quantity));
      }
      return finalUrl.toString();

    case 'dizy':
      if (cartItems.length > 0) {
        finalUrl.searchParams.set('sku', cartItems[0].id);
        finalUrl.searchParams.set('qty', String(cartItems[0].quantity));
      }
      return finalUrl.toString();

    case 'custom':
    default:
      if (cartItems.length > 0) {
        finalUrl.searchParams.set('p_id', cartItems[0].id);
        finalUrl.searchParams.set('p_qty', String(cartItems[0].quantity));
      }
      return finalUrl.toString();
  }
}
