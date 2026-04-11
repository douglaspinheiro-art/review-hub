import type { SupabaseClient } from "@supabase/supabase-js";
import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from "@supabase/supabase-js";

export type StoreMetricsPayload = {
  plataforma: string;
  faturamento: number;
  ticketMedio: number;
  totalClientes: number;
  taxaAbandono: number;
};

export class StoreMetricsQueryError extends Error {
  constructor(
    message: string,
    public readonly kind:
      | "no_integration"
      | "unauthorized"
      | "unsupported"
      | "server"
      | "network"
      | "empty_response"
  ) {
    super(message);
    this.name = "StoreMetricsQueryError";
  }
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

export function isValidStoreMetricsPayload(data: unknown): data is StoreMetricsPayload {
  if (!isRecord(data)) return false;
  const plataforma = data.plataforma;
  if (typeof plataforma !== "string" || !plataforma.trim()) return false;
  const faturamento = Number(data.faturamento);
  const ticketMedio = Number(data.ticketMedio);
  const totalClientes = Number(data.totalClientes);
  const taxaAbandono = Number(data.taxaAbandono);
  if (!Number.isFinite(faturamento) || !Number.isFinite(ticketMedio) || !Number.isFinite(totalClientes) || !Number.isFinite(taxaAbandono)) {
    return false;
  }
  return true;
}

/**
 * Invoca a edge fetch-store-metrics e normaliza erros HTTP/rede para a UI do /diagnostico.
 */
export async function fetchStoreMetricsForDiagnostico(
  supabase: SupabaseClient,
  accessToken: string
): Promise<StoreMetricsPayload> {
  const res = await supabase.functions.invoke("fetch-store-metrics", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (res.error) {
    const err = res.error;
    if (err instanceof FunctionsFetchError || err instanceof FunctionsRelayError) {
      throw new StoreMetricsQueryError(
        "Não foi possível conectar ao servidor. Verifique sua rede e tente novamente.",
        "network"
      );
    }
    if (err instanceof FunctionsHttpError) {
      const ctx = err.context as Response | undefined;
      const status = ctx && typeof (ctx as Response).status === "number" ? (ctx as Response).status : 0;
      if (status === 401) {
        throw new StoreMetricsQueryError("Sessão expirada. Faça login novamente.", "unauthorized");
      }
      if (status === 404) {
        throw new StoreMetricsQueryError(
          "Nenhuma integração de e-commerce ativa encontrada.",
          "no_integration"
        );
      }
      if (status === 422) {
        let msg = "Plataforma ainda não suportada para métricas automáticas.";
        try {
          if (ctx instanceof Response) {
            const body = await ctx.clone().json();
            if (isRecord(body) && typeof body.error === "string") msg = body.error;
          }
        } catch {
          /* ignore */
        }
        throw new StoreMetricsQueryError(msg, "unsupported");
      }
      throw new StoreMetricsQueryError(
        "Erro ao buscar métricas da loja. Tente novamente em instantes.",
        "server"
      );
    }
    throw new StoreMetricsQueryError(
      err?.message || "Erro ao buscar métricas da loja.",
      "server"
    );
  }

  if (!isValidStoreMetricsPayload(res.data)) {
    throw new StoreMetricsQueryError(
      "Não encontramos métricas para pré-preencher — ajuste os valores abaixo.",
      "empty_response"
    );
  }

  return res.data;
}
