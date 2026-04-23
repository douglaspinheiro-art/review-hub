import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { injectUtmInUrls, shouldInjectUtm } from "../inject-utm.ts";

const storeUrl = "https://minhaloja.com.br";
const utm = { source: "ltvboost", medium: "whatsapp", campaign: "abc123", content: "contact-1" };

Deno.test("injects UTM into store URL", () => {
  const out = injectUtmInUrls("Veja: https://minhaloja.com.br/produto/123", { storeUrl, utm });
  const u = new URL(out.replace(/^Veja: /, ""));
  assertEquals(u.searchParams.get("utm_source"), "ltvboost");
  assertEquals(u.searchParams.get("utm_campaign"), "abc123");
});

Deno.test("respects subdomain of store host", () => {
  const out = injectUtmInUrls("https://www.minhaloja.com.br/x", { storeUrl, utm });
  assertEquals(out.includes("utm_source=ltvboost"), true);
});

Deno.test("denylist: wa.me must not receive UTM", () => {
  const out = injectUtmInUrls("Fale: https://wa.me/5511999999999", { storeUrl, utm });
  assertEquals(out.includes("utm_source"), false);
});

Deno.test("denylist: meta.com / facebook.com / fbcdn.net", () => {
  for (const url of [
    "https://api.whatsapp.com/x",
    "https://lookaside.fbsbx.meta.com/img.jpg",
    "https://www.facebook.com/loja",
    "https://scontent.xx.fbcdn.net/img.png",
  ]) {
    const out = injectUtmInUrls(url, { storeUrl, utm });
    assertEquals(out.includes("utm_source"), false, `should not tag ${url}`);
  }
});

Deno.test("denylist: unsubscribe and tracking endpoints", () => {
  const inputs = [
    "https://app.ltvboost.com.br/unsubscribe?sid=x",
    "https://app.ltvboost.com.br/functions/v1/track-email-open?id=1",
    "https://app.ltvboost.com.br/functions/v1/track-whatsapp-click?id=1",
  ];
  for (const url of inputs) {
    const out = injectUtmInUrls(url, { storeUrl, utm });
    assertEquals(out.includes("utm_source"), false, `should not tag ${url}`);
  }
});

Deno.test("does not override pre-existing utm_source", () => {
  const out = injectUtmInUrls("https://minhaloja.com.br/?utm_source=email", { storeUrl, utm });
  assertEquals(out.includes("utm_source=email"), true);
  assertEquals(out.includes("utm_source=ltvboost"), false);
  // but other UTMs are added
  assertEquals(out.includes("utm_campaign=abc123"), true);
});

Deno.test("preserves trailing punctuation outside URL", () => {
  const out = injectUtmInUrls("Veja https://minhaloja.com.br/x.", { storeUrl, utm });
  assertEquals(out.endsWith("."), true);
  assertEquals(out.includes("utm_campaign=abc123"), true);
});

Deno.test("no storeUrl → returns input untouched", () => {
  const out = injectUtmInUrls("https://minhaloja.com.br/x", { storeUrl: null, utm });
  assertEquals(out, "https://minhaloja.com.br/x");
});

Deno.test("third-party non-store hosts are ignored", () => {
  const out = injectUtmInUrls("https://google.com/q", { storeUrl, utm });
  assertEquals(out.includes("utm_source"), false);
});

Deno.test("shouldInjectUtm: extraAllowedHosts works", () => {
  const ok = shouldInjectUtm("https://checkout.outraloja.com/x", "minhaloja.com.br", ["outraloja.com"]);
  assertEquals(ok, true);
});