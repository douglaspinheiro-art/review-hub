import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Test connectivity for each platform
async function testShopify(config: Record<string, string>): Promise<{ ok: boolean; detail: string }> {
  const shop = config.shop_url?.replace(/\/$/, "");
  const token = config.access_token;
  if (!shop || !token) return { ok: false, detail: "URL da loja e Access Token são obrigatórios" };

  try {
    const res = await fetch(`https://${shop}/admin/api/2024-01/shop.json`, {
      headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" },
    });
    if (!res.ok) return { ok: false, detail: `Shopify retornou ${res.status}. Verifique o token.` };
    const data = await res.json();
    return { ok: true, detail: `Loja "${data.shop?.name}" conectada com sucesso` };
  } catch (e: any) {
    return { ok: false, detail: `Erro ao conectar: ${e.message}` };
  }
}

async function testNuvemshop(config: Record<string, string>): Promise<{ ok: boolean; detail: string }> {
  const userId = config.user_id;
  const token = config.access_token;
  if (!userId || !token) return { ok: false, detail: "User ID e Access Token são obrigatórios" };

  try {
    const res = await fetch(`https://api.tiendanube.com/v1/${userId}/store`, {
      headers: {
        "Authentication": `bearer ${token}`,
        "User-Agent": "LTV Boost (suporte@ltvboost.com.br)",
      },
    });
    if (!res.ok) return { ok: false, detail: `Nuvemshop retornou ${res.status}. Verifique as credenciais.` };
    const data = await res.json();
    return { ok: true, detail: `Loja "${data.name?.pt || data.name?.es || 'OK'}" conectada` };
  } catch (e: any) {
    return { ok: false, detail: `Erro ao conectar: ${e.message}` };
  }
}

async function testWooCommerce(config: Record<string, string>): Promise<{ ok: boolean; detail: string }> {
  const siteUrl = config.site_url?.replace(/\/$/, "");
  const ck = config.consumer_key;
  const cs = config.consumer_secret;
  if (!siteUrl || !ck || !cs) return { ok: false, detail: "URL, Consumer Key e Consumer Secret são obrigatórios" };

  try {
    const auth = btoa(`${ck}:${cs}`);
    const res = await fetch(`${siteUrl}/wp-json/wc/v3/system_status`, {
      headers: { Authorization: `Basic ${auth}` },
    });
    if (!res.ok) return { ok: false, detail: `WooCommerce retornou ${res.status}. Verifique as credenciais.` };
    return { ok: true, detail: "WooCommerce conectado com sucesso" };
  } catch (e: any) {
    return { ok: false, detail: `Erro ao conectar: ${e.message}` };
  }
}

async function testTray(config: Record<string, string>): Promise<{ ok: boolean; detail: string }> {
  const apiAddress = config.api_address?.replace(/\/$/, "");
  const token = config.access_token;
  if (!apiAddress || !token) return { ok: false, detail: "API Address e Access Token são obrigatórios" };

  try {
    const res = await fetch(`https://${apiAddress}/web_api/auth?access_token=${encodeURIComponent(token)}`);
    if (!res.ok) return { ok: false, detail: `Tray retornou ${res.status}. Verifique as credenciais.` };
    return { ok: true, detail: "Tray conectada com sucesso" };
  } catch (e: any) {
    return { ok: false, detail: `Erro ao conectar: ${e.message}` };
  }
}

async function testVTEX(config: Record<string, string>): Promise<{ ok: boolean; detail: string }> {
  const account = config.account_name;
  const appKey = config.app_key;
  const appToken = config.app_token;
  if (!account || !appKey || !appToken) return { ok: false, detail: "Account, App Key e App Token são obrigatórios" };

  try {
    const res = await fetch(`https://${account}.vtexcommercestable.com.br/api/catalog_system/pvt/category/tree/1`, {
      headers: { "X-VTEX-API-AppKey": appKey, "X-VTEX-API-AppToken": appToken },
    });
    if (!res.ok) return { ok: false, detail: `VTEX retornou ${res.status}. Verifique as credenciais.` };
    return { ok: true, detail: "VTEX conectada com sucesso" };
  } catch (e: any) {
    return { ok: false, detail: `Erro ao conectar: ${e.message}` };
  }
}

async function testHubSpot(config: Record<string, string>): Promise<{ ok: boolean; detail: string }> {
  const token = config.access_token;
  if (!token) return { ok: false, detail: "Access Token é obrigatório" };

  try {
    const res = await fetch("https://api.hubapi.com/crm/v3/objects/contacts?limit=1", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return { ok: false, detail: `HubSpot retornou ${res.status}. Verifique o token.` };
    return { ok: true, detail: "HubSpot conectado com sucesso" };
  } catch (e: any) {
    return { ok: false, detail: `Erro ao conectar: ${e.message}` };
  }
}

async function testRDStation(config: Record<string, string>): Promise<{ ok: boolean; detail: string }> {
  const apiKey = config.api_key;
  if (!apiKey) return { ok: false, detail: "API Key é obrigatória" };

  try {
    const res = await fetch(`https://api.rd.services/platform/contacts?token=${encodeURIComponent(apiKey)}&page=1&page_size=1`);
    if (!res.ok) return { ok: false, detail: `RD Station retornou ${res.status}. Verifique a API Key.` };
    return { ok: true, detail: "RD Station conectado com sucesso" };
  } catch (e: any) {
    return { ok: false, detail: `Erro ao conectar: ${e.message}` };
  }
}

async function testMailchimp(config: Record<string, string>): Promise<{ ok: boolean; detail: string }> {
  const apiKey = config.api_key;
  if (!apiKey) return { ok: false, detail: "API Key é obrigatória" };

  const dc = apiKey.split("-").pop() || "us1";
  try {
    const res = await fetch(`https://${dc}.api.mailchimp.com/3.0/ping`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return { ok: false, detail: `Mailchimp retornou ${res.status}. Verifique a API Key.` };
    return { ok: true, detail: "Mailchimp conectado com sucesso" };
  } catch (e: any) {
    return { ok: false, detail: `Erro ao conectar: ${e.message}` };
  }
}

async function testZenvia(config: Record<string, string>): Promise<{ ok: boolean; detail: string }> {
  const token = config.token;
  if (!token) return { ok: false, detail: "Token é obrigatório" };
  return { ok: true, detail: "Zenvia configurada (validação via envio de teste)" };
}

async function testTwilio(config: Record<string, string>): Promise<{ ok: boolean; detail: string }> {
  const sid = config.account_sid;
  const authToken = config.auth_token;
  if (!sid || !authToken) return { ok: false, detail: "Account SID e Auth Token são obrigatórios" };

  try {
    const auth = btoa(`${sid}:${authToken}`);
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}.json`, {
      headers: { Authorization: `Basic ${auth}` },
    });
    if (!res.ok) return { ok: false, detail: `Twilio retornou ${res.status}. Verifique as credenciais.` };
    return { ok: true, detail: "Twilio conectado com sucesso" };
  } catch (e: any) {
    return { ok: false, detail: `Erro ao conectar: ${e.message}` };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { type, config } = await req.json();

    if (!type || !config) {
      return new Response(JSON.stringify({ ok: false, detail: "type e config são obrigatórios" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    let result: { ok: boolean; detail: string };

    switch (type) {
      case "shopify": result = await testShopify(config); break;
      case "nuvemshop": result = await testNuvemshop(config); break;
      case "woocommerce": result = await testWooCommerce(config); break;
      case "tray": result = await testTray(config); break;
      case "vtex": result = await testVTEX(config); break;
      case "hubspot": result = await testHubSpot(config); break;
      case "rdstation": result = await testRDStation(config); break;
      case "mailchimp": result = await testMailchimp(config); break;
      case "zenvia": result = await testZenvia(config); break;
      case "twilio": result = await testTwilio(config); break;
      case "dizy": result = { ok: true, detail: "Dizy Commerce configurado" }; break;
      case "google_my_business": result = { ok: true, detail: "Place ID salvo" }; break;
      case "reclame_aqui": result = { ok: true, detail: "ID da empresa salvo" }; break;
      default:
        result = { ok: false, detail: `Plataforma "${type}" não suportada para validação` };
    }

    return new Response(JSON.stringify(result), {
      status: result.ok ? 200 : 422,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    return new Response(JSON.stringify({ ok: false, detail: (err as Error).message }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
