import { supabase } from "./supabase";

export async function invokeCachedRpc<T>(
  rpcName: "get_dashboard_snapshot" | "get_funil_page_data" | "get_prescriptions_bundle_v2",
  params: Record<string, unknown>,
  ttlSeconds = 300
): Promise<T> {
  const { data, error } = await supabase.functions.invoke("get-cached-data", {
    body: {
      rpc_name: rpcName,
      params,
      ttl_seconds: ttlSeconds,
    },
  });

  if (error) throw error;
  return data as T;
}
