/**
 * Meta Embedded Signup — client-side helper.
 *
 * Loads the Facebook SDK and launches the Embedded Signup flow.
 * On success, sends the OAuth code to `meta-wa-oauth` edge function.
 */

import { supabase } from "@/lib/supabase";

const META_SDK_URL = "https://connect.facebook.net/en_US/sdk.js";

let sdkLoaded = false;

/** Load the Facebook JS SDK (idempotent). */
export function loadFacebookSdk(appId: string): Promise<void> {
  if (sdkLoaded) return Promise.resolve();

  return new Promise((resolve, reject) => {
    // Already loaded by another script
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
        version: "v21.0",
      });
      sdkLoaded = true;
      resolve();
    };

    script.onerror = () => reject(new Error("Failed to load Facebook SDK"));
    document.head.appendChild(script);

    // Timeout fallback
    setTimeout(() => {
      if (!sdkLoaded) reject(new Error("Facebook SDK load timeout"));
    }, 15000);
  });
}

interface EmbeddedSignupResult {
  ok: boolean;
  connection?: { id: string; instance_name: string; status: string };
  display_phone_number?: string;
  waba_id?: string;
  error?: string;
}

/**
 * Launch the Embedded Signup flow.
 *
 * Opens a Facebook Login popup requesting `whatsapp_business_messaging`
 * and `whatsapp_business_management` permissions.
 */
export async function launchEmbeddedSignup(params: {
  appId: string;
  storeId: string;
  instanceName?: string;
}): Promise<EmbeddedSignupResult> {
  await loadFacebookSdk(params.appId);

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
    FB.login(
      (response) => {
        const code = response.authResponse?.code;
        if (!code) {
          resolve({
            ok: false,
            error: response.status === "not_authorized"
              ? "Autorização negada. Permita o acesso ao WhatsApp Business."
              : "Login cancelado.",
          });
          return;
        }

        // Exchange code via edge function
        supabase.functions
          .invoke<EmbeddedSignupResult>("meta-wa-oauth", {
            body: {
              code,
              store_id: params.storeId,
              instance_name: params.instanceName,
            },
          })
          .then(({ data, error }) => {
            if (error) {
              resolve({ ok: false, error: error.message });
            } else {
              resolve(data ?? { ok: false, error: "Resposta vazia" });
            }
          });
      },
      {
        config_id: "", // Will use default config from app settings
        response_type: "code",
        override_default_response_type: true,
        scope: "whatsapp_business_messaging,whatsapp_business_management",
        extras: {
          setup: {
            // Embedded Signup specific
            solutionID: undefined,
          },
          featureType: "",
          sessionInfoVersion: 2,
        },
      },
    );
  });
}
