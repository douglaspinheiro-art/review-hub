/**
 * Meta Embedded Signup — client-side helper.
 *
 * Loads the Facebook SDK and launches the Embedded Signup flow.
 * On success, sends the OAuth code to `meta-wa-oauth` edge function.
 *
 * Requires `META_EMBEDDED_SIGNUP_CONFIG_ID` set in Supabase secrets, otherwise
 * the popup falls back to a generic Facebook Login (will not auto-onboard WhatsApp).
 */

import { supabase } from "@/lib/supabase";

const META_SDK_URL = "https://connect.facebook.net/en_US/sdk.js";

let sdkLoaded = false;
let sdkLoadingPromise: Promise<void> | null = null;

/** Load the Facebook JS SDK (idempotent, handles concurrent calls). */
export function loadFacebookSdk(appId: string, version = "v21.0"): Promise<void> {
  if (sdkLoaded) return Promise.resolve();
  if (sdkLoadingPromise) return sdkLoadingPromise;

  sdkLoadingPromise = new Promise((resolve, reject) => {
    if ((window as unknown as { FB?: unknown }).FB) {
      sdkLoaded = true;
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = META_SDK_URL;
    script.async = true;
    script.defer = true;
    script.crossOrigin = "anonymous";

    (window as unknown as { fbAsyncInit?: () => void }).fbAsyncInit = () => {
      const FB = (window as unknown as { FB: { init: (cfg: object) => void } }).FB;
      FB.init({
        appId,
        cookie: true,
        xfbml: false,
        version,
      });
      sdkLoaded = true;
      resolve();
    };

    script.onerror = () => {
      sdkLoadingPromise = null;
      reject(new Error("Falha ao carregar o SDK do Facebook (verifique bloqueadores ou conexão)."));
    };
    document.head.appendChild(script);

    setTimeout(() => {
      if (!sdkLoaded) {
        sdkLoadingPromise = null;
        reject(new Error("Tempo esgotado ao carregar o SDK do Facebook."));
      }
    }, 15000);
  });

  return sdkLoadingPromise;
}

interface EmbeddedSignupResult {
  ok: boolean;
  connection?: { id: string; instance_name: string; status: string };
  display_phone_number?: string;
  waba_id?: string;
  error?: string;
  code?: "missing_config_id" | "user_cancelled" | "not_authorized" | "exchange_failed";
}

export async function launchEmbeddedSignup(params: {
  appId: string;
  configId: string | null;
  storeId: string;
  instanceName?: string;
  graphVersion?: string;
}): Promise<EmbeddedSignupResult> {
  await loadFacebookSdk(params.appId, params.graphVersion ?? "v21.0");

  const FB = (window as unknown as {
    FB: {
      login: (
        cb: (response: {
          authResponse?: { code?: string; accessToken?: string };
          status: string;
        }) => void,
        opts: object,
      ) => void;
    };
  }).FB;

  return new Promise((resolve) => {
    const loginOpts: Record<string, unknown> = {
      response_type: "code",
      override_default_response_type: true,
      scope: "whatsapp_business_messaging,whatsapp_business_management",
    };

    if (params.configId) {
      loginOpts.config_id = params.configId;
      loginOpts.extras = {
        feature: "whatsapp_embedded_signup",
        sessionInfoVersion: "3",
      };
    } else {
      // Fallback — sem config_id, mostra Facebook Login genérico (apenas dev/teste).
      console.warn(
        "[meta-embedded-signup] META_EMBEDDED_SIGNUP_CONFIG_ID not set; using fallback login.",
      );
    }

    FB.login((response) => {
      const code = response.authResponse?.code;
      if (!code) {
        const reason = response.status === "not_authorized"
          ? { code: "not_authorized" as const, error: "Autorização negada. Permita o acesso ao WhatsApp Business." }
          : { code: "user_cancelled" as const, error: "Login cancelado." };
        resolve({ ok: false, ...reason });
        return;
      }

      supabase.functions
        .invoke<EmbeddedSignupResult>("meta-wa-oauth", {
          body: {
            code,
            store_id: params.storeId,
            instance_name: params.instanceName,
          },
        })
        .then(({ data, error }) => {
          // Edge function now always returns HTTP 200 with { ok, error?, code? }.
          // `error` from the SDK only fires on transport/network failures.
          if (error) {
            resolve({
              ok: false,
              code: "exchange_failed",
              error: `Falha de rede ao chamar meta-wa-oauth: ${error.message}`,
            });
            return;
          }
          if (!data) {
            resolve({ ok: false, code: "exchange_failed", error: "Resposta vazia do servidor." });
            return;
          }
          if (data.ok === false) {
            resolve({
              ok: false,
              code: data.code ?? "exchange_failed",
              error: data.error ?? "Falha desconhecida ao trocar o código com a Meta.",
            });
            return;
          }
          resolve(data);
        });
    }, loginOpts);
  });
}
