import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Check, Plus, Trash2, RefreshCw, Loader2,
  ShoppingCart, BarChart3, MessageSquare, Star, Sparkles, ArrowRight,
  ShieldCheck, ShieldX, Store, Cloud, Package, Layers, ShoppingBasket,
  Flame, Target, Radio, Mail, MapPin, MessageCircleWarning, Smartphone, Phone,
  ShoppingBag, Webhook, Activity, type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { INTEGRATIONS_LIST_SELECT } from "@/lib/supabase-select-fragments";
type Integration = {
  id: string;
  type: string;
  name: string;
  config: Record<string, string>;
  is_active: boolean;
  last_sync_at: string | null;
  created_at: string;
  store_id?: string | null;
};

type CatalogField = { key: string; label: string; placeholder: string };
type ValidationMode = "api" | "stored";
type CatalogItem = {
  type: string;
  name: string;
  icon: LucideIcon;
  iconClassName: string;
  validation: ValidationMode;
  fields: CatalogField[];
  isComingSoon?: boolean;
};
type CatalogCategory = { category: string; icon: LucideIcon; items: CatalogItem[] };

const CATALOG: CatalogCategory[] = [
  {
    category: "E-commerce",
    icon: ShoppingCart,
    items: [
      { type: "shopify", name: "Shopify", icon: ShoppingBag, iconClassName: "text-emerald-600", validation: "api", fields: [{ key: "shop_url", label: "URL da loja", placeholder: "minha-loja.myshopify.com" }, { key: "access_token", label: "Access Token", placeholder: "shpat_..." }] },
      { type: "nuvemshop", name: "Nuvemshop", icon: Cloud, iconClassName: "text-sky-500", validation: "api", fields: [{ key: "user_id", label: "User ID", placeholder: "12345" }, { key: "access_token", label: "Access Token", placeholder: "..." }] },
      { type: "tray", name: "Tray", icon: Package, iconClassName: "text-amber-600", validation: "api", fields: [{ key: "api_address", label: "API Address", placeholder: "minha-loja.commercesuite.com.br" }, { key: "access_token", label: "Access Token", placeholder: "..." }] },
      { type: "vtex", name: "VTEX", icon: Layers, iconClassName: "text-orange-500", validation: "api", fields: [{ key: "account_name", label: "Account Name", placeholder: "minha-loja" }, { key: "app_key", label: "App Key", placeholder: "vtexappkey-..." }, { key: "app_token", label: "App Token", placeholder: "..." }] },
      { type: "woocommerce", name: "WooCommerce", icon: ShoppingBasket, iconClassName: "text-violet-600", validation: "api", fields: [{ key: "site_url", label: "URL do site", placeholder: "https://minha-loja.com.br" }, { key: "consumer_key", label: "Consumer Key", placeholder: "ck_..." }, { key: "consumer_secret", label: "Consumer Secret", placeholder: "cs_..." }] },
      { type: "dizy", name: "Dizy Commerce", icon: Flame, iconClassName: "text-orange-600", validation: "api", fields: [{ key: "base_url", label: "URL da loja", placeholder: "https://minhaloja.com.br" }, { key: "api_key", label: "API Key", placeholder: "Chave da API Dizy" }] },
    ],
  },
  {
    category: "CRM & Marketing",
    icon: BarChart3,
    items: [
      { type: "hubspot", name: "HubSpot", icon: Target, iconClassName: "text-orange-500", validation: "api", fields: [{ key: "access_token", label: "Access Token", placeholder: "pat-..." }] },
      { type: "rdstation", name: "RD Station", icon: Radio, iconClassName: "text-blue-500", validation: "api", fields: [{ key: "api_key", label: "API Key", placeholder: "..." }] },
      { type: "mailchimp", name: "Mailchimp", icon: Mail, iconClassName: "text-yellow-600", validation: "api", fields: [{ key: "api_key", label: "API Key", placeholder: "...-us1" }] },
    ],
  },
  {
    category: "Reputação",
    icon: Star,
    items: [
      { type: "google_my_business", name: "Google Meu Negócio", icon: MapPin, iconClassName: "text-red-500", validation: "stored", fields: [{ key: "place_id", label: "Place ID", placeholder: "ChIJ..." }] },
      { type: "reclame_aqui", name: "Reclame Aqui", icon: MessageCircleWarning, iconClassName: "text-amber-500", validation: "stored", fields: [{ key: "company_id", label: "ID da empresa", placeholder: "minha-empresa" }] },
    ],
  },
  {
    category: "Marketplaces (Beta)",
    icon: Store,
    items: [
      { type: "mercado_livre", name: "Mercado Livre", icon: ShoppingBag, iconClassName: "text-yellow-500", isComingSoon: true, validation: "stored", fields: [] },
      { type: "shopee", name: "Shopee", icon: ShoppingBag, iconClassName: "text-orange-500", isComingSoon: true, validation: "stored", fields: [] },
      { type: "amazon", name: "Amazon Brasil", icon: Store, iconClassName: "text-muted-foreground", isComingSoon: true, validation: "stored", fields: [] },
    ],
  },
  {
    category: "SMS",
    icon: MessageSquare,
    items: [
      { type: "zenvia", name: "Zenvia", icon: Smartphone, iconClassName: "text-green-600", validation: "stored", fields: [{ key: "token", label: "Token", placeholder: "..." }, { key: "sender_id", label: "Sender ID", placeholder: "LTV Boost" }] },
      { type: "twilio", name: "Twilio", icon: Phone, iconClassName: "text-red-500", validation: "api", fields: [{ key: "account_sid", label: "Account SID", placeholder: "AC..." }, { key: "auth_token", label: "Auth Token", placeholder: "..." }, { key: "from_number", label: "Número de envio", placeholder: "+1..." }] },
    ],
  },
];

const QUICK_LINKS: { to: string; label: string; description: string; icon: LucideIcon }[] = [
  { to: "/dashboard/whatsapp", label: "WhatsApp", description: "Meta Cloud API", icon: MessageSquare },
  { to: "/dashboard/convertiq/setup", label: "GA4 / ConvertIQ", description: "Funil e Property ID", icon: Activity },
  { to: "/dashboard/carrinho-abandonado", label: "Carrinho abandonado", description: "Webhook e URL da loja", icon: Webhook },
  { to: "/dashboard/canais", label: "Canais e logs", description: "Webhooks recebidos", icon: Radio },
];

const PARCEIROS_OFICIAIS = [
  {
    nome: "Nuvemshop",
    icon: Cloud,
    iconClassName: "text-sky-500",
    descricao: "Integração certificada para sincronizar pedidos, clientes e carrinhos com o LTV Boost.",
    beneficio: "Condições comerciais e campanhas para parceiros: consulte o site oficial.",
    href: "https://www.nuvemshop.com.br/parceiros",
    cor: "from-blue-500/10 to-blue-600/5 border-blue-500/20",
    badge_cor: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  },
  {
    nome: "Shopify",
    icon: ShoppingBag,
    iconClassName: "text-emerald-600",
    descricao: "Instalação via Shopify App Store quando disponível, ou conexão manual por token nesta página.",
    beneficio: "Veja ofertas vigentes na página do app na App Store.",
    href: "https://apps.shopify.com/",
    cor: "from-emerald-500/10 to-emerald-600/5 border-emerald-500/20",
    badge_cor: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  },
];

function formatConnectedSubtitle(integration: Integration): string | null {
  if (integration.last_sync_at) {
    return `Última sincronização de dados: ${new Date(integration.last_sync_at).toLocaleString("pt-BR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}`;
  }
  return `Conectado em ${new Date(integration.created_at).toLocaleDateString("pt-BR")}`;
}

export default function Integracoes() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [connecting, setConnecting] = useState<string | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [validationState, setValidationState] = useState<{ status: "idle" | "validating" | "success" | "error"; detail: string }>({ status: "idle", detail: "" });
  const [disconnectTarget, setDisconnectTarget] = useState<Integration | null>(null);

  const {
    data: integrations = [],
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["integrations", user?.id ?? null],
    queryFn: async () => {
      const { data, error: qError } = await supabase
        .from("integrations")
        .select(INTEGRATIONS_LIST_SELECT)
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (qError) throw new Error(qError.message);
      return (data ?? []) as Integration[];
    },
    enabled: !!user,
  });

  const interestMutation = useMutation({
    mutationFn: async (integrationType: string) => {
      const { error: insErr } = await supabase.from("integration_interest").upsert(
        { user_id: user!.id, integration_type: integrationType },
        { onConflict: "user_id,integration_type" }
      );
      if (insErr) throw insErr;
    },
    onSuccess: () => {
      toast.success("Interesse registado", { description: "Avisaremos quando a integração estiver disponível." });
    },
    onError: (e: Error) => {
      toast.error("Não foi possível registar", { description: e.message });
    },
  });

  const validateAndConnect = useMutation({
    mutationFn: async ({ type, name }: { type: string; name: string }) => {
      setValidationState({ status: "validating", detail: "Testando conexão..." });
      const { data: valResult, error: valError } = await supabase.functions.invoke("validate-integration", {
        body: { type, config: formData },
      });

      if (valError || !valResult?.ok) {
        const detail = (valResult as { detail?: string } | null)?.detail || valError?.message || "Falha na validação";
        setValidationState({ status: "error", detail });
        throw new Error(detail);
      }

      setValidationState({ status: "success", detail: (valResult as { detail?: string }).detail ?? "" });

      const { data: allStores } = await supabase
        .from("stores")
        .select("id")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: true });

      const storeId = allStores?.[0]?.id ?? null;

      const { data: existingRow } = await supabase
        .from("integrations")
        .select("id")
        .eq("user_id", user!.id)
        .eq("type", type)
        .maybeSingle();

      const now = new Date().toISOString();
      const basePayload = {
        user_id: user!.id,
        store_id: storeId,
        type,
        name,
        config: formData as unknown as Record<string, unknown>,
        is_active: true,
        updated_at: now,
      };

      if (existingRow?.id) {
        const { error: upErr } = await supabase.from("integrations").update(basePayload as any).eq("id", existingRow.id);
        if (upErr) throw upErr;
      } else {
        const { error: insErr } = await supabase.from("integrations").insert(basePayload as any);
        if (insErr) throw insErr;
      }

      const { data: setupData, error: setupErr } = await supabase.functions.invoke<{
        ok?: boolean;
        detail?: string;
        automationsSeeded?: boolean;
        journeysStoresSeeded?: number;
      }>("post-integration-setup", { body: {} });

      if (setupErr || !setupData?.ok) {
        const detail = setupData?.detail ?? setupErr?.message ?? "Falha ao preparar automações/jornadas";
        toast.warning("Integração guardada", {
          description: `${detail}. Pode tentar guardar de novo ou contactar o suporte.`,
        });
      }

      return { name, replaced: !!existingRow?.id };
    },
    onSuccess: ({ name, replaced }) => {
      toast.success(replaced ? `${name} atualizado` : `${name} conectado`, {
        description: replaced
          ? "Credenciais validadas e substituídas na sua conta."
          : "Credenciais validadas. Jornadas padrão ativadas quando aplicável.",
      });
      setConnecting(null);
      setFormData({});
      setValidationState({ status: "idle", detail: "" });
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
      queryClient.invalidateQueries({ queryKey: ["automations"] });
      queryClient.invalidateQueries({ queryKey: ["automacoes_journeys"] });
      queryClient.invalidateQueries({ queryKey: ["activation_journeys"] });
    },
    onError: (err: Error) => {
      toast.error("Erro ao conectar", { description: err.message });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("integrations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Integração removida");
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
      setDisconnectTarget(null);
    },
    onError: (err: Error) => {
      toast.error("Erro ao remover", { description: err.message });
    },
  });

  function isConnected(type: string) {
    return integrations.some((i) => i.type === type && i.is_active);
  }

  function getIntegration(type: string) {
    return integrations.find((i) => i.type === type);
  }

  const listError = isError && error instanceof Error ? error.message : null;
  const showInitialLoad = isLoading && !integrations.length && !isError;
  const activeCount = isError ? 0 : integrations.filter((i) => i.is_active).length;

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">Integrações</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Conecte o LTV Boost com seu e-commerce, CRM e ferramentas de marketing
        </p>
      </div>

      {listError && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3">
          <p className="text-sm text-destructive">
            Não foi possível carregar as integrações: {listError}
          </p>
          <Button type="button" variant="outline" size="sm" className="shrink-0 gap-1.5" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Tentar de novo
          </Button>
        </div>
      )}

      <div className="rounded-xl border bg-card/50 p-4 space-y-3">
        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Outras ligações da conta</p>
        <div className="grid sm:grid-cols-2 gap-2">
          {QUICK_LINKS.map((q) => (
            <Link
              key={q.to}
              to={q.to}
              className="flex items-center gap-3 rounded-lg border bg-background/80 px-3 py-2.5 text-left transition-colors hover:border-primary/40 hover:bg-muted/30"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-muted/40">
                <q.icon className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold">{q.label}</p>
                <p className="text-xs text-muted-foreground truncate">{q.description}</p>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          ))}
        </div>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">
        As credenciais trafegam encriptadas (TLS) e ficam na sua linha de conta com políticas RLS.
        Revogue tokens antigos na plataforma de origem sempre que remover uma integração aqui.
      </p>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Parceiros</span>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          {PARCEIROS_OFICIAIS.map((p) => {
            const PIcon = p.icon;
            return (
              <div key={p.nome} className={`bg-gradient-to-br ${p.cor} border rounded-2xl p-5 space-y-3`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-background/60">
                      <PIcon className={cn("h-5 w-5", p.iconClassName)} />
                    </div>
                    <span className="font-bold text-sm truncate">{p.nome}</span>
                  </div>
                  <Badge variant="outline" className={`text-[8px] font-black shrink-0 ${p.badge_cor}`}>PARCEIRO</Badge>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{p.descricao}</p>
                <div className="bg-white/5 rounded-xl p-3">
                  <p className="text-[10px] font-medium text-muted-foreground">{p.beneficio}</p>
                </div>
                <a
                  href={p.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs font-bold text-primary hover:underline"
                >
                  Saiba mais <ArrowRight className="w-3 h-3" />
                </a>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-card border rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Ativas</p>
          <p className="text-2xl font-bold text-primary">{isError ? "—" : activeCount}</p>
        </div>
        <div className="bg-card border rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Disponíveis</p>
          <p className="text-2xl font-bold">{CATALOG.reduce((s, c) => s + c.items.length, 0)}</p>
        </div>
        <div className="bg-card border rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Categorias</p>
          <p className="text-2xl font-bold">{CATALOG.length}</p>
        </div>
      </div>

      {!isError && CATALOG.map(({ category, icon: CatIcon, items }) => (
        <div key={category} className="space-y-3">
          <div className="flex items-center gap-2">
            <CatIcon className="w-4 h-4 text-muted-foreground" />
            <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">{category}</h2>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {items.map((item) => {
              const connected = isConnected(item.type);
              const integration = getIntegration(item.type);
              const isExpanded = connecting === item.type;
              const ItemIcon = item.icon;

              return (
                <div
                  key={item.type}
                  className={cn(
                    "bg-card border rounded-xl overflow-hidden transition-colors",
                    connected && "border-primary/40"
                  )}
                >
                  <div className="p-4 flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-muted/30">
                      <ItemIcon className={cn("h-5 w-5", item.iconClassName)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 gap-y-0">
                        <p className="font-medium text-sm">{item.name}</p>
                        <Badge variant="secondary" className="text-[9px] font-bold h-5 px-1.5">
                          {item.validation === "api" ? "Teste remoto" : "Só armazenado"}
                        </Badge>
                      </div>
                      {connected && integration && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {formatConnectedSubtitle(integration)}
                        </p>
                      )}
                    </div>
                    {connected ? (
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-400 dark:border-green-800 gap-1">
                          <Check className="w-3 h-3" /> Conectado
                        </Badge>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                          onClick={() => integration && setDisconnectTarget(integration)}
                          aria-label={`Remover ${item.name}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ) : item.isComingSoon ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1.5 shrink-0 opacity-80"
                        disabled={interestMutation.isPending}
                        onClick={() => user && interestMutation.mutate(item.type)}
                      >
                        {interestMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                        Registar interesse
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant={isExpanded ? "default" : "outline"}
                        className="h-8 gap-1.5 shrink-0"
                        onClick={() => {
                          setConnecting(isExpanded ? null : item.type);
                          setFormData({});
                          setValidationState({ status: "idle", detail: "" });
                        }}
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Conectar
                      </Button>
                    )}
                  </div>

                  {isExpanded && !connected && (
                    <div className="border-t px-4 pb-4 pt-3 space-y-3 bg-muted/20">
                      {item.validation === "stored" && (
                        <p className="text-[11px] text-muted-foreground leading-snug">
                          Esta integração não chama a API externa a partir daqui: os dados são guardados para uso nas funcionalidades que já as suportam (ex.: SMS com Zenvia na edge).
                        </p>
                      )}
                      {item.fields.map((field) => (
                        <div key={field.key} className="space-y-1">
                          <Label className="text-xs">{field.label}</Label>
                          <Input
                            type={field.key.includes("token") || field.key.includes("secret") ? "password" : "text"}
                            placeholder={field.placeholder}
                            value={formData[field.key] ?? ""}
                            onChange={(e) => setFormData((f) => ({ ...f, [field.key]: e.target.value }))}
                            className="h-8 text-xs"
                          />
                        </div>
                      ))}
                      {validationState.status !== "idle" && connecting === item.type && (
                        <div className={cn(
                          "text-xs rounded-lg px-3 py-2 flex items-center gap-2",
                          validationState.status === "validating" && "bg-muted text-muted-foreground",
                          validationState.status === "success" && "bg-emerald-500/10 text-emerald-500",
                          validationState.status === "error" && "bg-destructive/10 text-destructive",
                        )}>
                          {validationState.status === "validating" && <Loader2 className="w-3 h-3 animate-spin" />}
                          {validationState.status === "success" && <ShieldCheck className="w-3 h-3" />}
                          {validationState.status === "error" && <ShieldX className="w-3 h-3" />}
                          {validationState.detail}
                        </div>
                      )}
                      <div className="flex gap-2 pt-1">
                        <Button
                          type="button"
                          size="sm"
                          className="h-8 gap-1.5"
                          onClick={() => validateAndConnect.mutate({ type: item.type, name: item.name })}
                          disabled={validateAndConnect.isPending}
                        >
                          {validateAndConnect.isPending
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <ShieldCheck className="w-3.5 h-3.5" />
                          }
                          Testar e Conectar
                        </Button>
                        <Button type="button" size="sm" variant="ghost" className="h-8" onClick={() => { setConnecting(null); setValidationState({ status: "idle", detail: "" }); }}>
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {showInitialLoad && (
        <div className="flex justify-center py-4">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      )}

      <AlertDialog open={!!disconnectTarget} onOpenChange={(open) => { if (!open) setDisconnectTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover integração?</AlertDialogTitle>
            <AlertDialogDescription>
              {disconnectTarget
                ? `Isto remove "${disconnectTarget.name}" desta conta. Funcionalidades que dependem destas credenciais podem deixar de funcionar até voltar a conectar.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (disconnectTarget) deleteMutation.mutate(disconnectTarget.id);
              }}
            >
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Remover"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <p className="text-[10px] text-muted-foreground">
        Em produção, faça deploy das edges <code className="rounded bg-muted px-1">validate-integration</code> e{" "}
        <code className="rounded bg-muted px-1">post-integration-setup</code> (JWT ativo no dashboard).
      </p>
    </div>
  );
}
