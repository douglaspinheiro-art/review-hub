import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowRight, ArrowLeft, Loader2, Shield, Sparkles, Info,
  Store, BarChart3, Plug, CheckCircle2, ExternalLink, AlertCircle, Clock, X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabasePublicUrl, supabasePublishableKey } from "@/lib/supabase-public-env";
import { VERTICALS, type EcommerceVertical } from "@/lib/strategy-profile";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useStoreScopeOptional } from "@/contexts/StoreScopeContext";
import { seedPilotStore } from "@/lib/pilot-seed-data";
import { getPostLoginRoute } from "@/lib/post-login-route";
import { benchmarkCvrForVertical, segmentLabelForVertical, ticketMedioForVertical } from "@/lib/funnel-benchmarks";
import {
  validateFunnelConsistency,
  computeRealSignalsPct,
  provenanceSource,
  ONBOARDING_DRAFT_VERSION,
  type FieldProvenance,
} from "@/lib/funnel-validation";
import { DataSourceBadge } from "@/components/dashboard/trust/DataSourceBadge";
import { trackFunnelEvent } from "@/lib/funnel-telemetry";

const TOTAL_STEPS = 3;

/** Formata "há X minutos/horas/dias" em pt-BR para o banner de retomada. */
function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "agora";
  const diffMin = Math.max(0, Math.round((Date.now() - then) / 60_000));
  if (diffMin < 1) return "agora";
  if (diffMin < 60) return `há ${diffMin} min`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `há ${diffH}h`;
  const diffD = Math.round(diffH / 24);
  return `há ${diffD}d`;
}

/** Normaliza e valida URL pública da loja (passo 1). */
function parsePublicStoreUrl(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  try {
    const withProtocol = /^https?:\/\//i.test(t) ? t : `https://${t}`;
    const u = new URL(withProtocol);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!u.hostname || !u.hostname.includes(".")) return null;
    return withProtocol.replace(/\/$/, "");
  } catch {
    return null;
  }
}

// Platform → integration type mapping
const PLATFORM_INTEGRATION_MAP: Record<string, { type: string; fields: { key: string; label: string; placeholder: string; secret?: boolean }[]; helpUrl?: string }> = {
  Shopify: {
    type: "shopify",
    fields: [
      { key: "shop_url", label: "Domínio Shopify", placeholder: "minhaloja.myshopify.com" },
    ],
  },
  Nuvemshop: {
    type: "nuvemshop",
    fields: [
      { key: "user_id", label: "User ID (Store ID)", placeholder: "Ex: 1234567" },
      { key: "access_token", label: "Access Token", placeholder: "Token da API", secret: true },
    ],
    helpUrl: "https://tiendanube.github.io/api-documentation/authentication",
  },
  VTEX: {
    type: "vtex",
    fields: [
      { key: "account_name", label: "Account Name", placeholder: "minhaloja" },
      { key: "app_key", label: "App Key", placeholder: "vtexappkey-...", secret: true },
      { key: "app_token", label: "App Token", placeholder: "Token da aplicação", secret: true },
    ],
    helpUrl: "https://help.vtex.com/en/tutorial/application-keys--2onstR7WIzmALJuvNwLKa",
  },
  WooCommerce: {
    type: "woocommerce",
    fields: [
      { key: "site_url", label: "URL do site", placeholder: "https://minhaloja.com.br" },
      { key: "consumer_key", label: "Consumer Key", placeholder: "ck_...", secret: true },
      { key: "consumer_secret", label: "Consumer Secret", placeholder: "cs_...", secret: true },
    ],
    helpUrl: "https://woocommerce.com/document/woocommerce-rest-api/",
  },
  Tray: {
    type: "tray",
    fields: [
      { key: "api_address", label: "API Address", placeholder: "minhaloja.api.tray.com.br" },
      { key: "access_token", label: "Access Token", placeholder: "Token de acesso", secret: true },
    ],
    helpUrl: "https://developers.tray.com.br/",
  },
  Magento: {
    type: "magento",
    fields: [
      { key: "base_url", label: "URL base do Magento", placeholder: "https://minhaloja.com.br" },
      { key: "access_token", label: "Access Token (Integration)", placeholder: "Token de integração", secret: true },
    ],
    helpUrl: "https://developer.adobe.com/commerce/webapi/get-started/authentication/",
  },
  "Dizy Commerce": {
    type: "dizy",
    fields: [
      { key: "base_url", label: "URL da loja", placeholder: "https://minhaloja.com.br" },
      { key: "api_key", label: "API Key", placeholder: "Chave da API Dizy", secret: true },
    ],
    helpUrl: "https://developer.adobe.com/commerce/webapi/get-started/authentication/",
  },
};

const UNSUPPORTED_PLATFORMS = ["Yampi", "Loja Integrada", "Outra", "Outro", ""];

// Platforms that support OAuth / app-auth (1-click or assisted redirect)
const OAUTH_PLATFORMS = ["Shopify", "Nuvemshop", "WooCommerce"] as const;
type OAuthPlatform = typeof OAUTH_PLATFORMS[number];

/** VTEX: conexão assistida (sem OAuth clássico). */
const ASSISTED_PLATFORMS = ["VTEX"] as const;
type AssistedPlatform = typeof ASSISTED_PLATFORMS[number];

function isOAuthPlatform(p: string): p is OAuthPlatform {
  return (OAUTH_PLATFORMS as readonly string[]).includes(p);
}

function isAssistedPlatform(p: string): p is AssistedPlatform {
  return (ASSISTED_PLATFORMS as readonly string[]).includes(p);
}

/** Normaliza plataforma vinda do /signup para chaves usadas neste wizard. */
function onboardingPlatformFromSignupMetadata(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  if (Object.prototype.hasOwnProperty.call(PLATFORM_INTEGRATION_MAP, t)) return t;
  if ((UNSUPPORTED_PLATFORMS as readonly string[]).includes(t)) return t;
  if (t === "Shopee") return "Outra";
  return "Outra";
}

export default function Onboarding() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, profile } = useAuth();
  const storeScope = useStoreScopeOptional();

  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Step 1 — Store info
  const [storeName, setStoreName] = useState("");
  const [storeUrl, setStoreUrl] = useState("");
  const [vertical, setVertical] = useState<EcommerceVertical | null>(null);
  const [plataforma, setPlataforma] = useState("");

  // Step 2 — Integration
  const [integrationConfig, setIntegrationConfig] = useState<Record<string, string>>({});
  const [integrationValidating, setIntegrationValidating] = useState(false);
  const [integrationValid, setIntegrationValid] = useState(false);
  const [integrationError, setIntegrationError] = useState<string | null>(null);
  const [oauthConnecting, setOauthConnecting] = useState(false);

  // Step 3 — Funnel data
  const [faturamento, setFaturamento] = useState("");
  const [ticketMedio, setTicketMedio] = useState("250");
  const [numClientes, setNumClientes] = useState("");
  const [visitantes, setVisitantes] = useState("");
  const [carrinho, setCarrinho] = useState("");
  const [checkout, setCheckout] = useState("");
  const [pedidos, setPedidos] = useState("");
  const [metaConversao, setMetaConversao] = useState("2.5");
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metricsImported, setMetricsImported] = useState(false);
  const [metricsFetched, setMetricsFetched] = useState(false);
  const [taxaAbandono, setTaxaAbandono] = useState("");
  const [importedFields, setImportedFields] = useState<{ faturamento?: boolean; ticketMedio?: boolean; numClientes?: boolean; taxaAbandono?: boolean; visitantes?: boolean; carrinho?: boolean; checkout?: boolean; pedidos?: boolean }>({});
  const [importedPlatform, setImportedPlatform] = useState<string>("");
  const [zeroFields, setZeroFields] = useState<string[]>([]);

  // GA4 removido do onboarding durante a verificação Google.
  // A conexão continua disponível em /dashboard/configuracoes para lojas
  // liberadas como test users no Google Cloud Console.

  const estimatedVisitors = visitantes ? Number(visitantes) : Math.round(Number(faturamento || 0) / Number(ticketMedio || 250) / 0.014);
  const estimatedCarrinho = carrinho ? Number(carrinho) : Math.round(estimatedVisitors * 0.28);
  const estimatedCheckout = checkout ? Number(checkout) : Math.round(estimatedVisitors * 0.14);
  const estimatedPedidos = pedidos ? Number(pedidos) : Math.round(Number(faturamento || 0) / Number(ticketMedio || 250));

  /** Taxa de conversão derivada de visitantes × pedidos (GA4/importação da loja ou estimativa a partir do faturamento). */
  const conversoComputedPct =
    estimatedVisitors > 0 && estimatedPedidos > 0
      ? Number(((estimatedPedidos / estimatedVisitors) * 100).toFixed(2))
      : null;

  useEffect(() => {
    if (conversoComputedPct !== null) {
      setMetaConversao(String(conversoComputedPct));
    }
  }, [conversoComputedPct]);

  const platformInfo = PLATFORM_INTEGRATION_MAP[plataforma];
  const isUnsupportedPlatform = UNSUPPORTED_PLATFORMS.includes(plataforma);
  const isOAuth = isOAuthPlatform(plataforma);
  const isAssisted = isAssistedPlatform(plataforma);

  const [onboardingStoreId, setOnboardingStoreId] = useState<string | null>(null);
  const [showManualOAuthFallback, setShowManualOAuthFallback] = useState(false);
  const [assistedStep, setAssistedStep] = useState(1);

  // 1.2 Retomada de draft — banner explícito no topo quando há rascunho restaurado.
  const [draftRestoredAt, setDraftRestoredAt] = useState<string | null>(null);
  const [draftBannerDismissed, setDraftBannerDismissed] = useState(false);

  // GA4 fora do onboarding: validação cruzada GA4↔plataforma não é mais necessária aqui.

  // Resolver loja para chave de rascunho (multi-tenant por store_id).
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      const active = storeScope?.activeStoreId;
      if (active) {
        if (!cancelled) setOnboardingStoreId(active);
        return;
      }
      const { data } = await supabase
        .from("stores")
        .select("id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (!cancelled) setOnboardingStoreId(data?.id ?? null);
    })();
    return () => { cancelled = true; };
  }, [user?.id, storeScope?.activeStoreId]);

  // Telemetria 4.1: marca início do onboarding (uma vez por sessão).
  useEffect(() => {
    if (!user?.id) return;
    const key = `onb_started_${user.id}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    void trackFunnelEvent({
      event: "onboarding_started",
      metadata: { entry_step: 1 },
    });
  }, [user?.id]);

  // Se o usuário já tem diagnóstico mas ainda não pagou, mandar pra /resultado
  // (evita refazer o onboarding ao voltar pro app sem ter completado o checkout).
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      const next = await getPostLoginRoute(user.id, profile);
      if (!cancelled && next === "/resultado") {
        navigate("/resultado", { replace: true });
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id, profile, navigate]);

  const progressStorageKey = user?.id
    ? `onboarding_progress_v2_${user.id}_${onboardingStoreId ?? "draft"}`
    : null;

  // Listen for OAuth popup result
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === "oauth_result") {
        setOauthConnecting(false);
        const p = event.data.platform as string | undefined;
        if (event.data.success && (!p || p === PLATFORM_INTEGRATION_MAP[plataforma]?.type || p === plataforma.toLowerCase())) {
          setIntegrationValid(true);
          toast.success(`${plataforma} conectado com sucesso!`);
        } else if (!event.data.success) {
          setIntegrationError(event.data.error || "Falha na conexão OAuth.");
          toast.error("Falha na conexão. Tente novamente.");
        }
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [plataforma]);

  // Check URL params for OAuth redirect result (ex.: WooCommerce return_url)
  useEffect(() => {
    const oauthParam = searchParams.get("oauth");
    const platformParam = searchParams.get("platform");
    if (oauthParam === "connected") {
      setIntegrationValid(true);
      setStep(2);
      if (platformParam === "woocommerce") {
        toast.success("WooCommerce conectado com sucesso!");
      } else {
        toast.success("Loja conectada com sucesso!");
      }
    }
  }, [searchParams]);

  // Restore in-progress onboarding from localStorage (per user + loja).
  useEffect(() => {
    if (!user?.id || !progressStorageKey) return;
    try {
      let raw = localStorage.getItem(progressStorageKey);
      if (!raw) {
        const legacy = localStorage.getItem(`onboarding_progress_${user.id}`);
        if (legacy) {
          raw = legacy;
          localStorage.setItem(progressStorageKey, legacy);
          localStorage.removeItem(`onboarding_progress_${user.id}`);
        }
      }
      if (!raw) return;
      const parsed = JSON.parse(raw) as
        | { version?: number; data?: Record<string, unknown> }
        | Record<string, unknown>;
      let s: Partial<{
        step: number; storeName: string; storeUrl: string; vertical: EcommerceVertical | null;
        plataforma: string; integrationConfig: Record<string, string>; integrationValid: boolean;
        faturamento: string; ticketMedio: string; numClientes: string; visitantes: string;
        carrinho: string; checkout: string; pedidos: string; metaConversao: string;
        assistedStep: number; showManualOAuthFallback: boolean;
      }>;
      if (parsed && typeof parsed === "object" && "version" in parsed && "data" in parsed) {
        if ((parsed as { version?: number }).version !== ONBOARDING_DRAFT_VERSION) {
          console.info(`[onboarding] Draft version mismatch (got ${(parsed as { version?: number }).version}, expected ${ONBOARDING_DRAFT_VERSION}) — descartando`);
          localStorage.removeItem(progressStorageKey);
          return;
        }
        s = (parsed as { data: typeof s }).data;
        const savedAt = (parsed as { savedAt?: string }).savedAt;
        if (typeof savedAt === "string") setDraftRestoredAt(savedAt);
      } else {
        // Legado sem envelope — aceita uma vez para retrocompat
        s = parsed as typeof s;
        setDraftRestoredAt(new Date().toISOString());
      }
      if (s.storeName) setStoreName(s.storeName);
      if (s.storeUrl) setStoreUrl(s.storeUrl);
      if (s.vertical) setVertical(s.vertical);
      if (s.plataforma) setPlataforma(s.plataforma);
      if (s.integrationConfig) setIntegrationConfig(s.integrationConfig);
      if (s.integrationValid) setIntegrationValid(s.integrationValid);
      if (s.faturamento) setFaturamento(s.faturamento);
      if (s.ticketMedio) setTicketMedio(s.ticketMedio);
      if (s.numClientes) setNumClientes(s.numClientes);
      if (s.visitantes) setVisitantes(s.visitantes);
      if (s.carrinho) setCarrinho(s.carrinho);
      if (s.checkout) setCheckout(s.checkout);
      if (s.pedidos) setPedidos(s.pedidos);
      if (s.metaConversao) setMetaConversao(s.metaConversao);
      if (s.step && s.step >= 1 && s.step <= TOTAL_STEPS) setStep(s.step);
      if (s.assistedStep && s.assistedStep >= 1 && s.assistedStep <= 4) setAssistedStep(s.assistedStep);
      if (typeof s.showManualOAuthFallback === "boolean") setShowManualOAuthFallback(s.showManualOAuthFallback);
    } catch { /* ignore corrupt cache */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, progressStorageKey]);

  // Pré-preenche plataforma a partir do cadastro (/signup grava em user_metadata.plataforma)
  useEffect(() => {
    if (!user?.id) return;
    const meta = user.user_metadata?.plataforma;
    if (typeof meta !== "string" || !meta.trim()) return;
    const mapped = onboardingPlatformFromSignupMetadata(meta);
    if (!mapped) return;
    setPlataforma((prev) => prev || mapped);
  }, [user?.id, user?.user_metadata?.plataforma]);

  // 1.3 Smart defaults por segmento — pré-popular ticket médio e meta de conversão
  // com base na vertical escolhida, mas só quando o lojista ainda não tocou nesses
  // campos (mantém valor manual ou importado da loja).
  useEffect(() => {
    if (!vertical) return;
    const benchTicket = ticketMedioForVertical(vertical);
    const benchCvr = benchmarkCvrForVertical(vertical);
    setTicketMedio((prev) => {
      if (importedFields.ticketMedio) return prev;
      // Considera "intocado" se está no default genérico ("250") ou vazio.
      if (!prev || prev === "250") return String(benchTicket);
      return prev;
    });
    setMetaConversao((prev) => {
      // Não sobrescreve se já foi derivado de visitantes×pedidos reais.
      if (conversoComputedPct !== null) return prev;
      if (!prev || prev === "2.5") return String(benchCvr);
      return prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vertical]);

  // Persist progress on every change. SECURITY: never persist OAuth tokens,
  // API keys, or GA4 access tokens in localStorage (XSS exfiltration risk).
  useEffect(() => {
    if (!user?.id || !progressStorageKey) return;
    try {
      const info = PLATFORM_INTEGRATION_MAP[plataforma];
      const safeIntegrationConfig: Record<string, string> = {};
      if (info) {
        for (const f of info.fields) {
          if (!f.secret && integrationConfig[f.key]) {
            safeIntegrationConfig[f.key] = integrationConfig[f.key];
          }
        }
      }
      localStorage.setItem(progressStorageKey, JSON.stringify({
        version: ONBOARDING_DRAFT_VERSION,
        savedAt: new Date().toISOString(),
        data: {
          step, storeName, storeUrl, vertical, plataforma,
          integrationConfig: safeIntegrationConfig, integrationValid,
          faturamento, ticketMedio, numClientes, visitantes, carrinho, checkout, pedidos,
          metaConversao,
          assistedStep, showManualOAuthFallback,
        },
      }));
    } catch { /* quota or private mode */ }
  }, [user, progressStorageKey, step, storeName, storeUrl, vertical, plataforma, integrationConfig, integrationValid,
      faturamento, ticketMedio, numClientes, visitantes, carrinho, checkout, pedidos,
      metaConversao, assistedStep, showManualOAuthFallback]);

  // Pre-load existing active integration for esta loja (evita cruzar tenant/loja).
  useEffect(() => {
    if (!user?.id || !onboardingStoreId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("integrations")
        .select("type, name, is_active")
        .eq("user_id", user.id)
        .eq("store_id", onboardingStoreId)
        .eq("is_active", true)
        .order("last_sync_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      if (cancelled || !data) return;
      const matchedPlatform = Object.entries(PLATFORM_INTEGRATION_MAP).find(
        ([, info]) => info?.type === data.type
      )?.[0];
      if (matchedPlatform) {
        setPlataforma(matchedPlatform);
        setIntegrationValid(true);
        if (data.name) setStoreName(data.name);
        toast.success(`Já conectado a ${matchedPlatform} nesta loja — pode avançar.`);
      }
    })();
    return () => { cancelled = true; };
  }, [user, onboardingStoreId]);

  const fetchStoreMetrics = useCallback(async (manual = false, force = false) => {
    if (!platformInfo) return;
    if (!force && !integrationValid) return;
    setMetricsLoading(true);
    try {
      let { data, error } = await supabase.functions.invoke("fetch-store-metrics", {});
      // Retry once after a short delay if integration row was just persisted
      if (error) {
        await new Promise((r) => setTimeout(r, 1500));
        const retry = await supabase.functions.invoke("fetch-store-metrics", {});
        data = retry.data;
        error = retry.error;
      }
      if (error) throw error;
      if (!data || typeof data !== "object") throw new Error("empty");

      const fat = Number((data as Record<string, unknown>).faturamento);
      const tm = Number((data as Record<string, unknown>).ticketMedio);
      const cli = Number((data as Record<string, unknown>).totalClientes);
      const abd = Number((data as Record<string, unknown>).taxaAbandono);
      const plat = String((data as Record<string, unknown>).plataforma ?? "");
      const updated: { faturamento?: boolean; ticketMedio?: boolean; numClientes?: boolean; taxaAbandono?: boolean; pedidos?: boolean } = {};
      const zeros: string[] = [];

      if (Number.isFinite(fat) && fat > 0) {
        setFaturamento(String(Math.round(fat)));
        updated.faturamento = true;
      } else if (Number.isFinite(fat)) {
        zeros.push("Faturamento");
      }
      if (Number.isFinite(tm) && tm > 0) {
        setTicketMedio(String(Math.round(tm)));
        updated.ticketMedio = true;
      } else if (Number.isFinite(tm)) {
        zeros.push("Ticket médio");
      }
      if (Number.isFinite(cli) && cli > 0) {
        setNumClientes(String(Math.round(cli)));
        updated.numClientes = true;
      } else if (Number.isFinite(cli)) {
        zeros.push("Nº clientes");
      }
      if (Number.isFinite(abd) && abd > 0) {
        setTaxaAbandono((abd * 100).toFixed(1));
        updated.taxaAbandono = true;
      }
      // Derive monthly orders from integration revenue / avg ticket (only field e-commerce APIs know)
      if (Number.isFinite(fat) && fat > 0 && Number.isFinite(tm) && tm > 0) {
        const derivedPedidos = Math.round(fat / tm);
        if (derivedPedidos > 0) {
          setPedidos(String(derivedPedidos));
          updated.pedidos = true;
        }
      }
      setImportedFields(prev => ({ ...prev, ...updated }));
      setImportedPlatform(plat);
      setZeroFields(zeros);
      setMetricsImported(Object.keys(updated).length > 0);
      if (manual) toast.success("Dados atualizados da plataforma!");
    } catch {
      if (manual) toast.error("Não foi possível importar. Preencha manualmente.");
      else toast.info("Não foi possível importar automaticamente. Preencha manualmente.");
    } finally {
      setMetricsLoading(false);
      setMetricsFetched(true);
    }
  }, [platformInfo, integrationValid]);

  // Auto-fetch metrics when entering the Funnel step (Step 3) with valid integration
  useEffect(() => {
    if (step === 3 && integrationValid && !metricsFetched && !metricsLoading) {
      fetchStoreMetrics(false);
    }
  }, [step, integrationValid, metricsFetched, metricsLoading, fetchStoreMetrics]);

  const getPrimaryStoreId = useCallback(async () => {
    if (!user?.id) return null;

    // Prefer the currently active store from StoreScope (multi-store safety).
    // Only fall back to the oldest store if no active store is selected.
    const active = storeScope?.activeStoreId;
    if (active) return active;

    const { data, error } = await supabase
      .from("stores")
      .select("id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    return data?.id ?? null;
  }, [user?.id, storeScope?.activeStoreId]);

  const persistActiveIntegration = useCallback(async (storeId: string) => {
    if (!user?.id || !platformInfo) {
      throw new Error("missing_user_or_platform");
    }

    const connectionMode = isAssisted ? "assisted" : "manual";

    // onConflict: "store_id,type" so the same user can connect the same platform
    // to different stores without clobbering each other (multi-store isolation).
    const { error } = await supabase.from("integrations").upsert(
      {
        user_id: user.id,
        store_id: storeId,
        type: platformInfo.type,
        name: plataforma,
        config: integrationConfig,
        is_active: true,
        connection_mode: connectionMode,
        connection_status: "connected",
      },
      { onConflict: "store_id,type" }
    );

    if (error) throw error;

    supabase.functions
      .invoke("post-integration-setup", { body: { store_id: storeId, platform: platformInfo.type } })
      .catch((setupError) => {
        console.warn("post-integration-setup failed:", setupError);
      });
  }, [user?.id, platformInfo, plataforma, integrationConfig, isAssisted]);

  const handleOAuthConnect = useCallback(async () => {
    if (!user?.id) return;

    const storeId = await getPrimaryStoreId();

    if (!storeId) {
      toast.error("Crie sua loja primeiro (passo 1).");
      return;
    }

    setOauthConnecting(true);
    setIntegrationError(null);

    try {
      const session = (await supabase.auth.getSession()).data.session;
      const supabaseUrl = supabasePublicUrl;
      const anon = supabasePublishableKey;
      const headers: Record<string, string> = {
        Authorization: `Bearer ${session?.access_token ?? ""}`,
        apikey: anon,
      };

      if (plataforma === "Shopify") {
        const shop = integrationConfig.shop_url?.trim();
        if (!shop) {
          toast.error("Informe o domínio da loja Shopify (ex: minhaloja.myshopify.com).");
          setOauthConnecting(false);
          return;
        }
        const queryParams =
          `action=start&store_id=${encodeURIComponent(storeId)}&shop=${encodeURIComponent(shop)}`;
        const res = await fetch(`${supabaseUrl}/functions/v1/oauth-shopify?${queryParams}`, { headers });
        const resData = await res.json();
        if (!resData?.url) {
          setIntegrationError("Não foi possível gerar a URL de autorização.");
          setOauthConnecting(false);
          return;
        }
        const popup = window.open(resData.url, "oauth-shopify", "width=600,height=700,scrollbars=yes");
        if (!popup) {
          toast.error("Popup bloqueado. Permita popups para este site.");
          setOauthConnecting(false);
        }
        return;
      }

      if (plataforma === "Nuvemshop") {
        const res = await fetch(
          `${supabaseUrl}/functions/v1/oauth-nuvemshop?action=start&store_id=${encodeURIComponent(storeId)}`,
          { headers },
        );
        const resData = await res.json();
        if (!resData?.url) {
          setIntegrationError((resData as { error?: string })?.error ?? "Não foi possível iniciar a conexão Nuvemshop.");
          setOauthConnecting(false);
          return;
        }
        const popup = window.open(resData.url, "oauth-nuvemshop", "width=600,height=700,scrollbars=yes");
        if (!popup) {
          toast.error("Popup bloqueado. Permita popups para este site.");
          setOauthConnecting(false);
        }
        return;
      }

      if (plataforma === "WooCommerce") {
        const site = integrationConfig.site_url?.trim();
        if (!site) {
          toast.error("Informe a URL do site (https://sualoja.com.br).");
          setOauthConnecting(false);
          return;
        }
        const q =
          `action=start&store_id=${encodeURIComponent(storeId)}` +
          `&site_url=${encodeURIComponent(site)}&return_to=onboarding`;
        const res = await fetch(`${supabaseUrl}/functions/v1/oauth-woocommerce?${q}`, { headers });
        const resData = await res.json();
        if (!resData?.url) {
          setIntegrationError("Não foi possível iniciar a conexão assistida WooCommerce.");
          setOauthConnecting(false);
          return;
        }
        window.location.href = resData.url as string;
        return;
      }

      setIntegrationError("Plataforma sem fluxo OAuth configurado.");
      setOauthConnecting(false);
    } catch (e) {
      console.error("OAuth error:", e);
      setIntegrationError("Erro ao iniciar conexão. Tente novamente.");
      setOauthConnecting(false);
    }
  }, [user?.id, integrationConfig, plataforma, getPrimaryStoreId]);

  const handleStep1Next = () => {
    if (!storeName.trim()) { toast.error("Informe o nome da loja."); return; }
    const normalizedUrl = parsePublicStoreUrl(storeUrl);
    if (!normalizedUrl) {
      toast.error("Informe a URL pública da loja (ex.: https://minhaloja.com.br ou minhaloja.com.br).");
      return;
    }
    setStoreUrl(normalizedUrl);
    if (!vertical) { toast.error("Selecione o segmento da loja."); return; }
    if (!plataforma) { toast.error("Selecione sua plataforma de e-commerce."); return; }

    // If unsupported platform, skip step 2
    if (isUnsupportedPlatform) {
      setStep(3);
    } else {
      setStep(2);
    }
  };

  const handleIntegrationFieldChange = (key: string, value: string) => {
    setIntegrationConfig(prev => ({ ...prev, [key]: value }));
    setIntegrationError(null);
    setIntegrationValid(false);
  };

  const handleValidateIntegration = async () => {
    if (!platformInfo) return;

    const missingField = platformInfo.fields.find(f => !integrationConfig[f.key]?.trim());
    if (missingField) {
      toast.error(`Preencha o campo "${missingField.label}".`);
      return;
    }

    setIntegrationValidating(true);
    setIntegrationError(null);
    setIntegrationValid(false);

    try {
      const { data, error } = await supabase.functions.invoke("validate-integration", {
        body: { type: platformInfo.type, config: integrationConfig },
      });

      if (error) {
        setIntegrationError("Erro de rede ao validar. Tente novamente.");
        toast.error("Erro ao validar integração.");
        return;
      }

      if (data?.ok) {
        const storeId = await getPrimaryStoreId();

        if (!storeId) {
          setIntegrationError("Sua loja ainda não foi criada. Recarregue a página e tente novamente.");
          toast.error("Validação concluída, mas não encontramos a loja para salvar a integração.");
          return;
        }

        try {
          await persistActiveIntegration(storeId);
          setIntegrationValid(true);
          toast.success("✓ Loja conectada — sincronizando dados…");
          // Fetch metrics imediatamente para que o passo 3 já apareça preenchido
          fetchStoreMetrics(false, true).catch(() => { /* fallback no step 3 */ });
        } catch (persistErr) {
          console.error("Persist integration failed:", persistErr);
          setIntegrationError("A integração foi validada, mas não conseguimos salvá-la.");
          toast.error("Integração validada, mas não foi possível salvá-la.");
        }
      } else {
        setIntegrationError(data?.detail || "Falha na validação. Verifique as credenciais.");
        toast.error(data?.detail || "Falha na validação.");
      }
    } catch {
      setIntegrationError("Erro inesperado. Tente novamente.");
    } finally {
      setIntegrationValidating(false);
    }
  };

  const handleStep2Next = () => {
    if (!integrationValid) {
      toast.error("Conecte e valide sua plataforma antes de avançar.");
      return;
    }
    setStep(3);
  };

  const handleFinish = async () => {
    if (!faturamento || Number(faturamento) <= 0) {
      toast.error("Informe seu faturamento mensal aproximado.");
      return;
    }

    const tmNum = Number(ticketMedio) || 250;
    const visPreview = visitantes ? Number(visitantes) : estimatedVisitors;
    const pedPreview = pedidos ? Number(pedidos) : estimatedPedidos;
    const carPreview = carrinho ? Number(carrinho) : estimatedCarrinho;
    const chkPreview = checkout ? Number(checkout) : estimatedCheckout;
    const pvPreview = Math.round(visPreview * 0.72);

    // A1. Validação de consistência (bloqueante leve)
    const validation = validateFunnelConsistency({
      visitantes: visPreview,
      produto_visto: pvPreview,
      carrinho: carPreview,
      checkout: chkPreview,
      pedido: pedPreview,
      ticket_medio: tmNum,
    });
    if (!validation.ok) {
      toast.error(validation.errors[0]?.message ?? "Dados do funil inconsistentes.");
      return;
    }
    if (validation.warnings.length > 0) {
      toast.warning(validation.warnings[0].message);
    }

    setIsSubmitting(true);
    try {
      if (!user?.id) {
        toast.error("Sessão expirada. Faça login novamente.");
        return;
      }

      const funnelVisitorsPreview = visitantes ? Number(visitantes) : estimatedVisitors;
      const funnelPedidosPreview = pedidos ? Number(pedidos) : estimatedPedidos;
      const benchmarkCvr = benchmarkCvrForVertical(vertical);
      const resolvedTaxaConversao =
        funnelVisitorsPreview > 0 && funnelPedidosPreview > 0
          ? Number(((funnelPedidosPreview / funnelVisitorsPreview) * 100).toFixed(2))
          : null;

      // 1. Update store — meta_conversao = benchmark de setor (não a taxa medida)
      const { error: storeErr } = await supabase
        .from("stores")
        .update({
          name: storeName,
          segment: vertical,
          meta_conversao: benchmarkCvr,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any)
        .eq("user_id", user.id);

      if (storeErr) console.warn("Store update error:", storeErr.message);

      // 2. Get store_id
      const storeId = await getPrimaryStoreId();

      // 3. Save integration if validated
      if (storeId && integrationValid && platformInfo) {
        await persistActiveIntegration(storeId);
      }

      // 4. Register interest for unsupported platforms
      if (isUnsupportedPlatform && storeId) {
        await supabase.from("integration_interest").insert({
          user_id: user.id,
          integration_type: plataforma || "outro",
        });
      }

      // 5. Save funnel metrics
      const funnelVisitors = funnelVisitorsPreview;
      const funnelCarrinho = carrinho ? Number(carrinho) : estimatedCarrinho;
      const funnelCheckout = checkout ? Number(checkout) : estimatedCheckout;
      const funnelPedidos = funnelPedidosPreview;
      const funnelProdutoVisto = Math.round(funnelVisitors * 0.72);

      if (storeId) {
        await supabase.from("funnel_metrics").insert({
          store_id: storeId,
          user_id: user.id,
          visitantes: funnelVisitors,
          visualizacoes_produto: funnelProdutoVisto,
          adicionou_carrinho: funnelCarrinho,
          iniciou_checkout: funnelCheckout,
          compras: funnelPedidos,
          receita: Number(faturamento) || 0,
        });
      }

      // 5b. Mark onboarding complete; subscription_status fica em diagnostic_only
      // até o checkout ativar (webhook de pagamento). Mantém active se já ativo.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from("profiles")
        .update({ onboarding_completed: true })
        .eq("id", user.id);

      // 6. Seed demo data for pilot users (best-effort)
      const isPilot = user?.user_metadata?.pilot === true || searchParams.get("ref") === "pilot";
      if (isPilot && storeId) {
        seedPilotStore(user.id, storeId).catch(() => {});
      }

      // 7. Store funnel data in sessionStorage for Analisando page
      // A2. Marcação de proveniência por campo
      const fieldProvenance: FieldProvenance = {
        visitantes: importedFields.visitantes ? "real" : "estimated",
        produto_visto: importedFields.visitantes ? "real" : "estimated",
        carrinho: importedFields.carrinho || carrinho ? "real" : "estimated",
        checkout: importedFields.checkout || checkout ? "real" : "estimated",
        pedido: importedFields.pedidos || pedidos ? "real" : "estimated",
        ticket_medio: importedFields.ticketMedio || ticketMedio ? "real" : "estimated",
        faturamento: importedFields.faturamento ? "real" : "estimated",
      };
      const realSignalsPct = computeRealSignalsPct(fieldProvenance);

      const funnelPayload = {
        visitantes: funnelVisitors,
        produto_visto: funnelProdutoVisto,
        carrinho: funnelCarrinho,
        checkout: funnelCheckout,
        pedido: funnelPedidos,
        ticket_medio: Number(ticketMedio) || 250,
        /** Taxa de conversão medida (pedidos/visitantes), quando aplicável */
        ...(resolvedTaxaConversao !== null ? { taxa_conversao: resolvedTaxaConversao } : {}),
        /** Benchmark de setor para comparar perda / CHS — não confundir com taxa medida */
        meta_conversao: benchmarkCvr,
        segmento: segmentLabelForVertical(vertical),
        store_id: storeId,
        // A5. Payload enriquecido (proveniência + summary)
        field_provenance: fieldProvenance,
        real_signals_pct: realSignalsPct,
        data_source_summary: {
          ga4: false,
          loja: integrationValid,
          manual: !integrationValid,
        },
      };
      sessionStorage.setItem("ltv_funnel_data", JSON.stringify(funnelPayload));

      // Onboarding complete — clear in-progress draft (v2 + legado)
      try {
        if (progressStorageKey) localStorage.removeItem(progressStorageKey);
        if (user?.id) {
          localStorage.removeItem(`onboarding_progress_${user.id}`);
          if (onboardingStoreId) {
            localStorage.removeItem(`onboarding_progress_v2_${user.id}_${onboardingStoreId}`);
          }
          localStorage.removeItem(`onboarding_progress_v2_${user.id}_draft`);
        }
      } catch { /* noop */ }

      // Telemetria 4.1: onboarding_completed antes de navegar.
      void trackFunnelEvent({
        event: "onboarding_completed",
        metadata: {
          vertical: vertical ?? null,
          plataforma: plataforma || null,
          integration_connected: integrationValid,
          ga4_connected: false,
          real_signals_pct: realSignalsPct,
          imported_fields: Object.keys(importedFields).filter((k) => (importedFields as Record<string, boolean>)[k]),
        },
      });

      // 2.2 Warm-up da edge — fire-and-forget para reduzir cold-start em /analisando.
      // Não bloqueia o navigate; falha silenciosa.
      try {
        void supabase.functions.invoke("gerar-diagnostico", { body: { _warmup: true } });
      } catch { /* noop */ }

      navigate("/analisando");
    } catch (e) {
      console.error(e);
      toast.error("Erro ao salvar dados. Tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white flex flex-col items-center p-6 md:p-20 overflow-x-hidden">
      <div className="max-w-2xl w-full space-y-12">
        {/* Progress Header */}
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center font-black">L</div>
              <span className="font-bold tracking-tighter">LTV BOOST</span>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex gap-2">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className={cn("w-2 h-2 rounded-full transition-all", i <= step ? "bg-primary" : "bg-muted")} />
                ))}
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Passo {step} de {TOTAL_STEPS}
              </span>
            </div>
          </div>
          <Progress value={Math.round((step / TOTAL_STEPS) * 100)} className="h-1 bg-muted/40" />
        </div>

        {/* 1.2 Banner de retomada de draft */}
        {draftRestoredAt && !draftBannerDismissed && step > 1 && (
          <div className="flex items-center justify-between gap-3 bg-primary/5 border border-primary/20 rounded-2xl px-4 py-3 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                <Clock className="w-4 h-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold">Continuando de onde você parou</p>
                <p className="text-[11px] text-muted-foreground truncate">
                  Rascunho salvo {formatRelativeTime(draftRestoredAt)} · você está no passo {step} de {TOTAL_STEPS}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-[11px] font-bold text-muted-foreground hover:text-foreground"
                onClick={() => {
                  if (!confirm("Descartar rascunho e recomeçar do zero?")) return;
                  if (progressStorageKey) localStorage.removeItem(progressStorageKey);
                  setDraftBannerDismissed(true);
                  setDraftRestoredAt(null);
                  setStep(1);
                  setStoreName(""); setStoreUrl(""); setVertical(null); setPlataforma("");
                  setIntegrationConfig({}); setIntegrationValid(false);
                  setFaturamento(""); setTicketMedio("250"); setNumClientes("");
                  setVisitantes(""); setCarrinho(""); setCheckout(""); setPedidos("");
                  setMetaConversao("2.5");
                  toast.success("Rascunho descartado.");
                }}
              >
                Descartar
              </Button>
              <button
                aria-label="Fechar aviso"
                onClick={() => setDraftBannerDismissed(true)}
                className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 1: Store Info */}
        {step === 1 && (
          <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
            <div className="text-center space-y-4">
              <div className="inline-flex items-center gap-2 bg-primary/10 text-primary text-[10px] font-black px-3 py-1 rounded-full border border-primary/20 uppercase tracking-[0.2em]">
                <Store className="w-3 h-3" /> Passo 1 — Sua Loja
              </div>
              <h1 className="text-4xl md:text-5xl font-black font-syne tracking-tighter">
                Conte sobre sua loja
              </h1>
              <p className="text-muted-foreground max-w-lg mx-auto font-medium">
                Essas informações vão personalizar seu diagnóstico e benchmarks do setor.
              </p>
            </div>

            <div className="bg-[#13131A] border border-[#1E1E2E] rounded-2xl p-6 space-y-5">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Nome da loja *</Label>
                <Input
                  placeholder="Ex: Studio Moda Feminina"
                  value={storeName}
                  onChange={e => setStoreName(e.target.value)}
                  className="h-12 rounded-xl bg-background/50 border-[#2E2E3E]"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  URL da loja *
                </Label>
                <Input
                  placeholder="https://minhaloja.com.br"
                  value={storeUrl}
                  onChange={e => setStoreUrl(e.target.value)}
                  className="h-12 rounded-xl bg-background/50 border-[#2E2E3E]"
                  inputMode="url"
                  autoComplete="url"
                />
                <p className="text-[11px] text-muted-foreground leading-snug">
                  Obrigatório — site público da sua marca (com ou sem https).
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Plataforma *</Label>
                <Select value={plataforma} onValueChange={(v) => {
                  setPlataforma(v);
                  setIntegrationConfig({});
                  setIntegrationValid(false);
                  setIntegrationError(null);
                  setShowManualOAuthFallback(false);
                  setAssistedStep(1);
                }}>
                  <SelectTrigger className="h-12 rounded-xl bg-background/50 border-[#2E2E3E]">
                    <SelectValue placeholder="Selecione sua plataforma" />
                  </SelectTrigger>
                  <SelectContent>
                    {["Shopify", "Nuvemshop", "VTEX", "WooCommerce", "Magento", "Dizy Commerce", "Yampi", "Outra"].map(p => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Segmento *</Label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {VERTICALS.map(item => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setVertical(item.id)}
                      className={cn(
                        "text-left rounded-xl border p-3 transition-all",
                        vertical === item.id
                          ? "border-primary bg-primary/10"
                          : "border-[#2A2A38] hover:border-primary/40"
                      )}
                    >
                      <p className="text-sm font-bold">{item.label}</p>
                      <p className="text-[10px] text-muted-foreground">{item.benchmarkHint}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: E-commerce Integration */}
        {step === 2 && (
          <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
            <div className="text-center space-y-4">
              <div className="inline-flex items-center gap-2 bg-violet-500/10 text-violet-400 text-[10px] font-black px-3 py-1 rounded-full border border-violet-500/20 uppercase tracking-[0.2em]">
                <Plug className="w-3 h-3" /> Passo 2 — Conectar {plataforma}
              </div>
              <h1 className="text-4xl md:text-5xl font-black font-syne tracking-tighter">
                Integre sua loja
              </h1>
              <p className="text-muted-foreground max-w-lg mx-auto font-medium">
                {isAssisted
                  ? "Conexão assistida: seguimos o passo a passo da sua plataforma — não é OAuth clássico."
                  : isOAuth
                    ? `Conecte com mínimo atrito — ${plataforma === "WooCommerce" ? "fluxo assistido no WooCommerce" : "autorização segura na plataforma"}.`
                    : `A integração com o ${plataforma} permite que o diagnóstico use dados reais da sua loja.`}
              </p>
            </div>

            <div className="bg-[#13131A] border border-[#1E1E2E] rounded-2xl p-6 space-y-5">
              <div className="flex items-center gap-3 pb-3 border-b border-[#1E1E2E]">
                <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
                  <Plug className="w-5 h-5 text-violet-400" />
                </div>
                <div>
                  <p className="font-bold text-sm">{plataforma}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {isAssisted
                      ? "Conexão assistida (credenciais de API)"
                      : isOAuth
                        ? "Conexão automática / app auth"
                        : "Preencha as credenciais da API"}
                  </p>
                </div>
                {platformInfo?.helpUrl && (!isOAuth || showManualOAuthFallback) && !isAssisted && (
                  <a
                    href={platformInfo.helpUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-auto text-xs text-violet-400 hover:text-violet-300 flex items-center gap-1 transition-colors"
                  >
                    Como obter? <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                {platformInfo?.helpUrl && isAssisted && (
                  <a
                    href={platformInfo.helpUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-auto text-xs text-violet-400 hover:text-violet-300 flex items-center gap-1 transition-colors"
                  >
                    Documentação <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>

              {isAssisted && !integrationValid && platformInfo && (
                <div className="rounded-xl bg-amber-500/5 border border-amber-500/20 p-4 space-y-3">
                  <p className="text-xs font-bold text-amber-400">Conexão assistida</p>
                  <ol className="text-xs text-muted-foreground space-y-2 list-decimal list-inside">
                    <li>
                      Abra o painel da {plataforma} em outra aba e gere as chaves de API conforme a documentação.
                      {plataforma === "VTEX" && " Depois volte aqui e cole Account name, App Key e App Token."}
                    </li>
                    <li>Preencha os campos abaixo e use &quot;Conectar e validar&quot; — testamos a API antes de guardar.</li>
                    <li>Se o painel exigir URL de retorno ou webhook, use a Central de Integrações no dashboard após conectar.</li>
                  </ol>
                  <div className="flex gap-2 pt-1">
                    {[1, 2, 3].map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setAssistedStep(s)}
                        className={cn(
                          "text-[10px] font-black px-2 py-1 rounded-md border transition-colors",
                          assistedStep === s
                            ? "border-amber-500/50 bg-amber-500/10 text-amber-300"
                            : "border-[#2E2E3E] text-muted-foreground hover:border-amber-500/30",
                        )}
                      >
                        Passo {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ── OAuth / app-auth (Shopify / Nuvemshop / WooCommerce) ── */}
              {isOAuth && !integrationValid && !showManualOAuthFallback && (
                <>
                  {plataforma === "Shopify" && (
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                        Domínio Shopify *
                      </Label>
                      <Input
                        placeholder="minhaloja.myshopify.com"
                        value={integrationConfig.shop_url || ""}
                        onChange={e => handleIntegrationFieldChange("shop_url", e.target.value)}
                        className="h-12 rounded-xl bg-background/50 border-[#2E2E3E] font-mono"
                      />
                    </div>
                  )}

                  {plataforma === "WooCommerce" && (
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                        URL do site WooCommerce *
                      </Label>
                      <Input
                        placeholder="https://sualoja.com.br"
                        value={integrationConfig.site_url || ""}
                        onChange={e => handleIntegrationFieldChange("site_url", e.target.value)}
                        className="h-12 rounded-xl bg-background/50 border-[#2E2E3E] font-mono"
                      />
                      <p className="text-[10px] text-muted-foreground">
                        Usamos o endpoint oficial wc-auth. Se o seu host bloquear o fluxo, use &quot;Credenciais manuais&quot; abaixo.
                      </p>
                    </div>
                  )}

                  <Button
                    onClick={() => void handleOAuthConnect()}
                    disabled={oauthConnecting}
                    className="w-full h-14 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-bold text-base"
                  >
                    {oauthConnecting ? (
                      <><Loader2 className="w-5 h-5 animate-spin mr-2" /> Conectando...</>
                    ) : (
                      <><Plug className="w-5 h-5 mr-2" /> Conectar com {plataforma}</>
                    )}
                  </Button>

                  <p className="text-[10px] text-muted-foreground text-center">
                    {plataforma === "WooCommerce"
                      ? "Você será enviado ao WooCommerce para aprovar o app — em seguida retornamos ao onboarding."
                      : `Você será redirecionado para o ${plataforma} para autorizar o acesso. Nenhuma senha da sua conta LTV Boost é compartilhada.`}
                  </p>

                  {(plataforma === "Nuvemshop" || plataforma === "WooCommerce") && (
                    <button
                      type="button"
                      className="w-full text-center text-[11px] text-violet-400 hover:underline"
                      onClick={() => { setShowManualOAuthFallback(true); setIntegrationError(null); }}
                    >
                      Usar credenciais manuais (token / consumer key)
                    </button>
                  )}
                </>
              )}

              {/* ── Manual Flow (inclui fallback OAuth e VTEX assistido) ── */}
              {platformInfo && (!isOAuth || showManualOAuthFallback || isAssisted) && (
                <>
                  {isOAuth && showManualOAuthFallback && (
                    <button
                      type="button"
                      className="text-[11px] text-violet-400 hover:underline text-left"
                      onClick={() => { setShowManualOAuthFallback(false); setIntegrationError(null); }}
                    >
                      Voltar ao fluxo automático
                    </button>
                  )}
                  {platformInfo.fields.map(field => (
                    <div key={field.key} className="space-y-1.5">
                      <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{field.label}</Label>
                      <Input
                        type={field.secret ? "password" : "text"}
                        placeholder={field.placeholder}
                        value={integrationConfig[field.key] || ""}
                        onChange={e => handleIntegrationFieldChange(field.key, e.target.value)}
                        className="h-12 rounded-xl bg-background/50 border-[#2E2E3E] font-mono"
                        disabled={integrationValid}
                      />
                    </div>
                  ))}

                  {/* Platform-specific guide */}
                  {platformInfo.helpUrl && (
                    <div className="rounded-xl bg-blue-500/5 border border-blue-500/20 p-4 space-y-2">
                      <p className="text-xs font-bold text-blue-400">📋 Como encontrar suas credenciais:</p>
                      {plataforma === "VTEX" && (
                        <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                          <li>Acesse o Admin VTEX → Configurações da conta → Chaves de aplicação</li>
                          <li>Clique em "Gerenciar chaves de aplicação" → "Gerar nova chave"</li>
                          <li>Copie o App Key e App Token gerados</li>
                        </ol>
                      )}
                      {plataforma === "Magento" && (
                        <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                          <li>Acesse Admin → System → Integrations → Add New Integration</li>
                          <li>Configure permissões (Sales, Catalog, Customers) e ative</li>
                          <li>Copie o Access Token gerado</li>
                        </ol>
                      )}
                      <a
                        href={platformInfo.helpUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
                      >
                        Ver documentação completa <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )}

                  {!integrationValid && (
                    <Button
                      onClick={handleValidateIntegration}
                      disabled={integrationValidating}
                      className="w-full h-12 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold"
                    >
                      {integrationValidating ? (
                        <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Validando conexão...</>
                      ) : (
                        <><Plug className="w-4 h-4 mr-2" /> Conectar e validar</>
                      )}
                    </Button>
                  )}
                </>
              )}

              {/* Success state (shared) */}
              {integrationValid && (
                <div className="rounded-xl p-4 flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/30">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  <div>
                    <p className="text-sm font-bold text-emerald-400">Conectado com sucesso!</p>
                    <p className="text-xs text-muted-foreground">Sua loja está pronta para o diagnóstico.</p>
                  </div>
                </div>
              )}

              {integrationError && (
                <div className="rounded-xl p-4 flex items-center gap-3 bg-red-500/10 border border-red-500/30">
                  <AlertCircle className="w-5 h-5 text-red-400" />
                  <div>
                    <p className="text-sm font-bold text-red-400">Erro na conexão</p>
                    <p className="text-xs text-muted-foreground">{integrationError}</p>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-violet-500/5 border border-violet-500/20 rounded-2xl p-4 flex gap-3">
              <Shield className="w-5 h-5 text-violet-400 shrink-0" />
              <p className="text-xs text-violet-300/80 leading-relaxed font-medium">
                Suas credenciais são criptografadas e armazenadas com segurança. Usamos apenas para ler dados da loja — nunca para alterar nada.
              </p>
            </div>
          </div>
        )}

        {/* STEP 4: Funnel Data (auto-filled from GA4 + integration when available) */}
        {step === 4 && (
          <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
            <div className="text-center space-y-4">
              <div className="inline-flex items-center gap-2 bg-emerald-500/10 text-emerald-500 text-[10px] font-black px-3 py-1 rounded-full border border-emerald-500/20 uppercase tracking-[0.2em]">
                <BarChart3 className="w-3 h-3" /> Passo 4 — Dados do Funil
              </div>
              <h1 className="text-4xl md:text-5xl font-black font-syne tracking-tighter">
                Métricas do seu negócio
              </h1>
              <p className="text-muted-foreground max-w-lg mx-auto font-medium">
                Com esses dados, a IA calcula seu Conversion Health Score e identifica gargalos.
              </p>
            </div>

            <div className="bg-[#13131A] border border-[#1E1E2E] rounded-2xl p-6 space-y-5">
              {(metricsImported || metricsLoading) && (
                <div className="rounded-xl p-4 flex items-center justify-between gap-3 bg-emerald-500/10 border border-emerald-500/30">
                  <div className="flex items-center gap-3">
                    {metricsLoading ? (
                      <Loader2 className="w-5 h-5 text-emerald-400 animate-spin" />
                    ) : (
                      <Sparkles className="w-5 h-5 text-emerald-400" />
                    )}
                    <div className="flex-1">
                      <p className="text-sm font-bold text-emerald-400">
                        {metricsLoading
                          ? `Importando dados de ${importedPlatform || plataforma}...`
                          : `Dados importados de ${importedPlatform || plataforma} — últimos 30 dias`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {metricsLoading
                          ? "Buscando faturamento, ticket médio, clientes e abandono…"
                          : `Importados: ${[
                              importedFields.faturamento && "faturamento",
                              importedFields.ticketMedio && "ticket médio",
                              importedFields.numClientes && "clientes",
                              importedFields.taxaAbandono && "taxa de abandono",
                            ].filter(Boolean).join(", ") || "nenhum campo"}. Você pode ajustar manualmente.`}
                      </p>
                      {!metricsLoading && zeroFields.length > 0 && (
                        <p className="text-[11px] text-amber-400 mt-1">
                          ⚠ A plataforma retornou zero para: {zeroFields.join(", ")}. Preencha manualmente se tiver os valores.
                        </p>
                      )}
                    </div>
                  </div>
                  {!metricsLoading && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => fetchStoreMetrics(true)}
                      className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
                    >
                      Atualizar
                    </Button>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                    Faturamento mensal (R$) *
                    {importedFields.faturamento && <span className="text-[9px] text-emerald-400 normal-case tracking-normal">✨ importado</span>}
                  </Label>
                  {metricsLoading ? (
                    <div className="h-12 rounded-xl bg-background/50 border border-[#2E2E3E] animate-pulse" />
                  ) : (
                    <Input
                      type="number"
                      placeholder="Ex: 50000"
                      value={faturamento}
                      onChange={e => setFaturamento(e.target.value)}
                      className="h-12 rounded-xl bg-background/50 border-[#2E2E3E] font-mono"
                    />
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                    Ticket médio (R$)
                    {importedFields.ticketMedio && <span className="text-[9px] text-emerald-400 normal-case tracking-normal">✨ importado</span>}
                  </Label>
                  {metricsLoading ? (
                    <div className="h-12 rounded-xl bg-background/50 border border-[#2E2E3E] animate-pulse" />
                  ) : (
                    <Input
                      type="number"
                      placeholder="250"
                      value={ticketMedio}
                      onChange={e => setTicketMedio(e.target.value)}
                      className="h-12 rounded-xl bg-background/50 border-[#2E2E3E] font-mono"
                    />
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                    Nº clientes ativos
                    {importedFields.numClientes && <span className="text-[9px] text-emerald-400 normal-case tracking-normal">✨ importado</span>}
                  </Label>
                  {metricsLoading ? (
                    <div className="h-12 rounded-xl bg-background/50 border border-[#2E2E3E] animate-pulse" />
                  ) : (
                    <Input
                      type="number"
                      placeholder="Ex: 1200"
                      value={numClientes}
                      onChange={e => setNumClientes(e.target.value)}
                      className="h-12 rounded-xl bg-background/50 border-[#2E2E3E] font-mono"
                    />
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2 flex-wrap">
                    Taxa de conversão (%)
                    {conversoComputedPct !== null && (
                      <span className="text-[9px] text-emerald-400 normal-case tracking-normal">
                        ✨ calculada automaticamente
                      </span>
                    )}
                  </Label>
                  <Input
                    type="number"
                    placeholder="2.5"
                    value={conversoComputedPct !== null ? String(conversoComputedPct) : metaConversao}
                    onChange={(e) => setMetaConversao(e.target.value)}
                    readOnly={conversoComputedPct !== null}
                    className="h-12 rounded-xl bg-background/50 border-[#2E2E3E] font-mono"
                    step="0.01"
                  />
                  <p className="text-[10px] text-muted-foreground leading-snug">
                    {conversoComputedPct !== null
                      ? Number(visitantes) > 0 && Number(pedidos) > 0
                        ? "Calculada a partir dos visitantes e pedidos informados (ex.: dados do GA4 + loja)."
                        : "Calculada a partir do faturamento e ticket médio quando visitantes/pedidos não estão separados — ajuste visitantes e pedidos abaixo para refinar."
                      : "Informe visitantes e pedidos no funil abaixo ou o faturamento acima para estimarmos a taxa."}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                    Taxa de abandono carrinho (%)
                    {importedFields.taxaAbandono && <span className="text-[9px] text-emerald-400 normal-case tracking-normal">✨ importado</span>}
                  </Label>
                  {metricsLoading ? (
                    <div className="h-12 rounded-xl bg-background/50 border border-[#2E2E3E] animate-pulse" />
                  ) : (
                    <Input
                      type="number"
                      placeholder="Ex: 70"
                      value={taxaAbandono}
                      onChange={e => setTaxaAbandono(e.target.value)}
                      className="h-12 rounded-xl bg-background/50 border-[#2E2E3E] font-mono"
                      step="0.1"
                    />
                  )}
                </div>
              </div>

              <div className="border-t border-[#1E1E2E] pt-5 space-y-3">
                <div className="flex items-center gap-2">
                  <Info className="w-3.5 h-3.5 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground font-medium">
                    Visitantes e eventos de carrinho/checkout vêm do GA4. Pedidos vêm da sua loja. Se algum campo estiver vazio, a IA estima com base no faturamento.
                  </p>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="space-y-1">
                    <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                      Visitantes/mês
                      {importedFields.visitantes && <span className="text-[9px] text-emerald-400 normal-case tracking-normal">✨ GA4</span>}
                    </Label>
                    <Input
                      type="number"
                      placeholder={String(estimatedVisitors || "—")}
                      value={visitantes}
                      onChange={e => { setVisitantes(e.target.value); setImportedFields(prev => ({ ...prev, visitantes: false })); }}
                      className="h-10 rounded-lg bg-background/50 border-[#2E2E3E] font-mono text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                      Add to cart
                      {importedFields.carrinho && <span className="text-[9px] text-emerald-400 normal-case tracking-normal">✨ GA4</span>}
                    </Label>
                    <Input
                      type="number"
                      placeholder={String(estimatedCarrinho || "—")}
                      value={carrinho}
                      onChange={e => { setCarrinho(e.target.value); setImportedFields(prev => ({ ...prev, carrinho: false })); }}
                      className="h-10 rounded-lg bg-background/50 border-[#2E2E3E] font-mono text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                      Checkout
                      {importedFields.checkout && <span className="text-[9px] text-emerald-400 normal-case tracking-normal">✨ GA4</span>}
                    </Label>
                    <Input
                      type="number"
                      placeholder={String(estimatedCheckout || "—")}
                      value={checkout}
                      onChange={e => { setCheckout(e.target.value); setImportedFields(prev => ({ ...prev, checkout: false })); }}
                      className="h-10 rounded-lg bg-background/50 border-[#2E2E3E] font-mono text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                      Pedidos/mês
                      {importedFields.pedidos && <span className="text-[9px] text-emerald-400 normal-case tracking-normal">✨ {importedPlatform || "loja"}</span>}
                    </Label>
                    <Input
                      type="number"
                      placeholder={String(estimatedPedidos || "—")}
                      value={pedidos}
                      onChange={e => { setPedidos(e.target.value); setImportedFields(prev => ({ ...prev, pedidos: false })); }}
                      className="h-10 rounded-lg bg-background/50 border-[#2E2E3E] font-mono text-sm"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Action Footer */}
        <div className="pt-12 border-t border-[#1E1E2E] flex flex-col items-center gap-4">
          <div className="w-full flex items-center justify-between">
            {step > 1 ? (
              <button
                onClick={() => setStep((s) => Math.max(1, s - 1))}
                disabled={isSubmitting}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5 disabled:opacity-50"
              >
                <ArrowLeft className="w-4 h-4" /> Voltar
              </button>
            ) : <span />}
            <button
              onClick={() => {
                if (!confirm("Tem certeza que deseja resetar todos os dados do onboarding? Esta ação não pode ser desfeita.")) return;
                try {
                  if (user?.id) {
                    localStorage.removeItem(`onboarding_progress_${user.id}`);
                    localStorage.removeItem(`onboarding_progress_v2_${user.id}_draft`);
                    if (onboardingStoreId) {
                      localStorage.removeItem(`onboarding_progress_v2_${user.id}_${onboardingStoreId}`);
                    }
                  }
                  if (progressStorageKey) localStorage.removeItem(progressStorageKey);
                } catch { /* noop */ }
                setStep(1);
                setStoreName(""); setStoreUrl(""); setVertical(null); setPlataforma("");
                setIntegrationConfig({}); setIntegrationValid(false); setIntegrationError(null);
                setShowManualOAuthFallback(false);
                setAssistedStep(1);
                setFaturamento(""); setTicketMedio("250"); setNumClientes("");
                setVisitantes(""); setCarrinho(""); setCheckout(""); setPedidos("");
                setMetaConversao("2.5"); setMetricsImported(false); setMetricsFetched(false);
                setImportedFields({});
                toast.success("Dados do onboarding resetados");
              }}
              disabled={isSubmitting}
              className="text-sm text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
            >
              Resetar dados
            </button>
          </div>
          {step === 1 && (
            <Button
              size="lg"
              onClick={handleStep1Next}
              className="h-14 px-12 text-lg font-black bg-gradient-to-r from-emerald-500 to-blue-600 rounded-xl shadow-xl shadow-emerald-500/20 hover:scale-105 transition-all gap-2 group"
            >
              {isUnsupportedPlatform ? "Próximo: Conectar GA4" : `Próximo: Conectar ${plataforma || "plataforma"}`} <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Button>
          )}

          {step === 2 && (
            <Button
              size="lg"
              onClick={handleStep2Next}
              disabled={!integrationValid}
              className="h-14 px-12 text-lg font-black bg-gradient-to-r from-emerald-500 to-blue-600 rounded-xl shadow-xl shadow-emerald-500/20 hover:scale-105 transition-all gap-2 group disabled:opacity-50"
            >
              Próximo: Dados do funil <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Button>
          )}

          {step === 3 && (
            <div className="flex flex-col items-center gap-3">
              {(() => {
                // A3. Card "Score de confiabilidade" no último passo
                const fieldProvenancePreview: FieldProvenance = {
                  visitantes: importedFields.visitantes ? "real" : "estimated",
                  produto_visto: importedFields.visitantes ? "real" : "estimated",
                  carrinho: importedFields.carrinho || carrinho ? "real" : "estimated",
                  checkout: importedFields.checkout || checkout ? "real" : "estimated",
                  pedido: importedFields.pedidos || pedidos ? "real" : "estimated",
                  ticket_medio: importedFields.ticketMedio || ticketMedio ? "real" : "estimated",
                  faturamento: importedFields.faturamento ? "real" : "estimated",
                };
                const pct = computeRealSignalsPct(fieldProvenancePreview);
                const source = provenanceSource(pct);
                const realCount = Object.values(fieldProvenancePreview).filter((v) => v === "real").length;
                const estCount = Object.values(fieldProvenancePreview).length - realCount;
                const lojaOk = integrationValid;
                return (
                  <div className="w-full max-w-md rounded-2xl border border-[#1E1E2E] bg-[#13131A] p-4 mb-2 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                        Score de confiabilidade
                      </p>
                      <DataSourceBadge
                        source={source}
                        origin={`${pct}% sinais reais`}
                        note="Quanto maior, mais preciso o diagnóstico."
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      <strong className="text-white">{realCount} campos reais</strong> · {estCount} estimados
                    </p>
                  </div>
                );
              })()}
              <Button
                size="lg"
                onClick={() => void handleFinish()}
                disabled={isSubmitting}
                className="h-14 px-12 text-lg font-black bg-primary hover:bg-primary/90 rounded-xl shadow-xl shadow-primary/20 hover:scale-105 transition-all gap-2 group"
              >
                {isSubmitting ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> Salvando...</>
                ) : (
                  <><Sparkles className="w-5 h-5" /> Gerar Diagnóstico com IA</>
                )}
              </Button>
              <p className="text-[9px] font-black text-muted-foreground flex items-center gap-1.5 uppercase tracking-[0.2em]">
                <Shield className="w-3.5 h-3.5 text-emerald-500" /> Dados criptografados e protegidos
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
