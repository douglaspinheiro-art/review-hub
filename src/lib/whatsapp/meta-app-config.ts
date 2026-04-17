import { supabase } from "@/lib/supabase";

type MetaWhatsAppConfigResponse = {
  app_id?: string;
  error?: string;
};

export async function getMetaAppId(): Promise<string> {
  const { data, error } = await supabase.functions.invoke<MetaWhatsAppConfigResponse>("meta-whatsapp-config");

  if (error) {
    throw new Error(error.message);
  }

  const appId = data?.app_id?.trim();
  if (!appId) {
    throw new Error(data?.error ?? "META_APP_ID not configured");
  }

  return appId;
}
