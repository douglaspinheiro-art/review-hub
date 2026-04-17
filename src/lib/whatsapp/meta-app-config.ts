import { supabase } from "@/lib/supabase";

type MetaWhatsAppConfigResponse = {
  app_id?: string;
  config_id?: string | null;
  graph_version?: string;
  error?: string;
};

export type MetaAppConfig = {
  appId: string;
  configId: string | null;
  graphVersion: string;
};

let cached: MetaAppConfig | null = null;

export async function getMetaAppConfig(): Promise<MetaAppConfig> {
  if (cached) return cached;

  const { data, error } = await supabase.functions.invoke<MetaWhatsAppConfigResponse>(
    "meta-whatsapp-config",
  );

  if (error) throw new Error(error.message);

  const appId = data?.app_id?.trim();
  if (!appId) {
    throw new Error(data?.error ?? "META_APP_ID not configured");
  }

  cached = {
    appId,
    configId: data?.config_id ?? null,
    graphVersion: data?.graph_version?.trim() || "v21.0",
  };
  return cached;
}

/** @deprecated Use getMetaAppConfig() instead. Kept for back-compat. */
export async function getMetaAppId(): Promise<string> {
  const cfg = await getMetaAppConfig();
  return cfg.appId;
}
