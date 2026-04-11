/**
 * Regras de UI para conexões WhatsApp (sem expor segredos no cliente).
 */

export type WaConnLike = {
  provider?: string | null;
  status?: string | null;
  evolution_api_url?: string | null;
  evolution_api_key?: string | null;
  meta_phone_number_id?: string | null;
};

export function evolutionReadyForQr(conn: WaConnLike): boolean {
  return !!(conn.evolution_api_url?.trim() && conn.evolution_api_key?.trim());
}

/** Mostrar bloco de webhook / ajuda Meta sem depender de meta_access_token no select. */
export function metaShowsWebhookHelp(conn: WaConnLike): boolean {
  return conn.provider === "meta_cloud" && !!conn.meta_phone_number_id?.trim();
}

/** Aviso amarelo: falta configurar credenciais mínimas (sem inferir token no cliente). */
export function shouldWarnIncompleteSetup(conn: WaConnLike): boolean {
  if (conn.status === "connected") return false;
  if (conn.provider === "meta_cloud") {
    return !conn.meta_phone_number_id?.trim();
  }
  return !evolutionReadyForQr(conn);
}
