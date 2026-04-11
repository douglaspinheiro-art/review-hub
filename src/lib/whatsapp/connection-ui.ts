/**
 * Regras de UI para conexões WhatsApp (sem expor segredos no cliente).
 */

export type WaConnLike = {
  provider?: string | null;
  status?: string | null;
  meta_phone_number_id?: string | null;
};

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
  /* Linhas antigas sem provider ou não migradas: tratar como incompleto até reconfigurar em Meta. */
  return true;
}
