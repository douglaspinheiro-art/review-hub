import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Link2, Check, Plus, Trash2, RefreshCw, Loader2,
  ShoppingCart, BarChart3, Mail, MessageSquare, Star, Sparkles, ArrowRight,
  ShieldCheck, ShieldX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { JORNADAS_META } from "@/lib/automations-meta";

type Integration = {
  id: string;
  type: string;
  name: string;
  config: Record<string, string>;
  is_active: boolean;
  last_sync_at: string | null;
  created_at: string;
};

const CATALOG = [
  {
    category: "E-commerce",
    icon: ShoppingCart,
    items: [
      { type: "shopify",    name: "Shopify",     logo: "🛍️", fields: [{ key: "shop_url", label: "URL da loja", placeholder: "minha-loja.myshopify.com" }, { key: "access_token", label: "Access Token", placeholder: "shpat_..." }] },
      { type: "nuvemshop",  name: "Nuvemshop",   logo: "☁️", fields: [{ key: "user_id", label: "User ID", placeholder: "12345" }, { key: "access_token", label: "Access Token", placeholder: "..." }] },
      { type: "tray",       name: "Tray",         logo: "📦", fields: [{ key: "api_address", label: "API Address", placeholder: "minha-loja.commercesuite.com.br" }, { key: "access_token", label: "Access Token", placeholder: "..." }] },
      { type: "vtex",       name: "VTEX",         logo: "🔷", fields: [{ key: "account_name", label: "Account Name", placeholder: "minha-loja" }, { key: "app_key", label: "App Key", placeholder: "vtexappkey-..." }, { key: "app_token", label: "App Token", placeholder: "..." }] },
      { type: "woocommerce",name: "WooCommerce",  logo: "🟣", fields: [{ key: "site_url", label: "URL do site", placeholder: "https://minha-loja.com.br" }, { key: "consumer_key", label: "Consumer Key", placeholder: "ck_..." }, { key: "consumer_secret", label: "Consumer Secret", placeholder: "cs_..." }] },
      { type: "dizy",       name: "Dizy Commerce",logo: "🔥", fields: [{ key: "api_key", label: "API Key", placeholder: "..." }, { key: "store_id", label: "Store ID", placeholder: "..." }] },
    ],
  },
  {
    category: "CRM & Marketing",
    icon: BarChart3,
    items: [
      { type: "hubspot",    name: "HubSpot",      logo: "🟠", fields: [{ key: "access_token", label: "Access Token", placeholder: "pat-..." }] },
      { type: "rdstation",  name: "RD Station",   logo: "🔵", fields: [{ key: "api_key", label: "API Key", placeholder: "..." }] },
      { type: "mailchimp",  name: "Mailchimp",    logo: "🐒", fields: [{ key: "api_key", label: "API Key", placeholder: "...-us1" }] },
    ],
  },
  {
    category: "Reputação",
    icon: Star,
    items: [
      { type: "google_my_business", name: "Google Meu Negócio", logo: "🔴", fields: [{ key: "place_id", label: "Place ID", placeholder: "ChIJ..." }] },
      { type: "reclame_aqui",       name: "Reclame Aqui",       logo: "🟡", fields: [{ key: "company_id", label: "ID da empresa", placeholder: "minha-empresa" }] },
    ],
  },
  {
    category: "Marketplaces (Beta)",
    icon: ShoppingCart,
    items: [
      { type: "mercado_livre", name: "Mercado Livre", logo: "🟡", isComingSoon: true, fields: [] },
      { type: "shopee",        name: "Shopee",        logo: "🟠", isComingSoon: true, fields: [] },
      { type: "amazon",        name: "Amazon Brasil", logo: "⚪", isComingSoon: true, fields: [] },
    ],
  },
  {
    category: "SMS",
    icon: MessageSquare,
    items: [
      { type: "zenvia",   name: "Zenvia",   logo: "📱", fields: [{ key: "token", label: "Token", placeholder: "..." }, { key: "sender_id", label: "Sender ID", placeholder: "LTV Boost" }] },
      { type: "twilio",   name: "Twilio",   logo: "🔴", fields: [{ key: "account_sid", label: "Account SID", placeholder: "AC..." }, { key: "auth_token", label: "Auth Token", placeholder: "..." }, { key: "from_number", label: "Número de envio", placeholder: "+1..." }] },
    ],
  },
];

const PARCEIROS_OFICIAIS = [
  {
    nome: "Nuvemshop",
    logo: "☁️",
    descricao: "Integração oficial certificada. Sincronização nativa de pedidos, clientes e carrinhos em tempo real.",
    beneficio: "Desconto exclusivo de 15% no plano Crescimento para lojistas Nuvemshop",
    href: "https://www.nuvemshop.com.br/parceiros",
    cor: "from-blue-500/10 to-blue-600/5 border-blue-500/20",
    badge_cor: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  },
  {
    nome: "Shopify Brasil",
    logo: "🛍️",
    descricao: "App oficial na Shopify App Store. Instale com 1 clique, sem configuração técnica.",
    beneficio: "30 dias grátis (vs. 14 dias padrão) para lojistas que instalam via Shopify App Store",
    href: "https://apps.shopify.com/ltv-boost",
    cor: "from-emerald-500/10 to-emerald-600/5 border-emerald-500/20",
    badge_cor: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  },
];

export default function Integracoes() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [connecting, setConnecting] = useState<string | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [validationState, setValidationState] = useState<{ status: "idle" | "validating" | "success" | "error"; detail: string }>({ status: "idle", detail: "" });

  const { data: integrations = [], isLoading } = useQuery({
    queryKey: ["integrations", user?.id ?? null],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("integrations")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) return [] as Integration[];
      return (data ?? []) as Integration[];
    },
    enabled: !!user,
  });

  const validateAndConnect = useMutation({
    mutationFn: async ({ type, name }: { type: string; name: string }) => {
      // Step 1: Validate credentials
      setValidationState({ status: "validating", detail: "Testando conexão..." });
      const { data: valResult, error: valError } = await supabase.functions.invoke("validate-integration", {
        body: { type, config: formData },
      });

      if (valError || !valResult?.ok) {
        const detail = valResult?.detail || valError?.message || "Falha na validação";
        setValidationState({ status: "error", detail });
        throw new Error(detail);
      }

      setValidationState({ status: "success", detail: valResult.detail });

      // Step 2: Save integration
      const { error } = await supabase.from("integrations").insert({
        user_id: user!.id,
        type,
        name,
        config: formData,
        is_active: true,
      });
      if (error) throw error;

      // Auto-seed automations on first store connection
      const { count } = await supabase
        .from("automations")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user!.id);

      if (count === 0) {
        const rows = JORNADAS_META.map(j => ({
          user_id: user!.id,
          name: j.titulo,
          trigger: j.trigger,
          message_template: j.message_template,
          delay_minutes: j.delay_minutes,
          is_active: j.defaultActive,
        }));
        await supabase.from("automations").insert(rows);
      }
    },
    onSuccess: (_, { name }) => {
      toast({ title: `${name} conectado com sucesso!`, description: "Credenciais validadas ✓ — Jornadas padrão ativadas." });
      setConnecting(null);
      setFormData({});
      setValidationState({ status: "idle", detail: "" });
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
      queryClient.invalidateQueries({ queryKey: ["automations"] });
    },
    onError: (err: any) => {
      toast({ title: "Erro ao conectar", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("integrations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["integrations"] }),
  });

  function isConnected(type: string) {
    return integrations.some((i) => i.type === type && i.is_active);
  }

  function getIntegration(type: string) {
    return integrations.find((i) => i.type === type);
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">Integrações</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Conecte o LTV Boost com seu e-commerce, CRM e ferramentas de marketing
        </p>
      </div>

      {/* Parceiros Oficiais */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Parceiros Oficiais</span>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          {PARCEIROS_OFICIAIS.map((p) => (
            <div key={p.nome} className={`bg-gradient-to-br ${p.cor} border rounded-2xl p-5 space-y-3`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{p.logo}</span>
                  <span className="font-bold text-sm">{p.nome}</span>
                </div>
                <Badge variant="outline" className={`text-[8px] font-black ${p.badge_cor}`}>PARCEIRO OFICIAL</Badge>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{p.descricao}</p>
              <div className="bg-white/5 rounded-xl p-3">
                <p className="text-[10px] font-bold text-emerald-400">🎁 {p.beneficio}</p>
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
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-card border rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Ativas</p>
          <p className="text-2xl font-bold text-primary">{integrations.filter((i) => i.is_active).length}</p>
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

      {/* Catalog */}
      {CATALOG.map(({ category, icon: CatIcon, items }) => (
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

              return (
                <div
                  key={item.type}
                  className={cn(
                    "bg-card border rounded-xl overflow-hidden transition-colors",
                    connected && "border-primary/40"
                  )}
                >
                  <div className="p-4 flex items-center gap-3">
                    <span className="text-2xl shrink-0">{item.logo}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{item.name}</p>
                      {connected && integration?.last_sync_at && (
                        <p className="text-xs text-muted-foreground">
                          Sincronizado {new Date(integration.last_sync_at).toLocaleDateString("pt-BR")}
                        </p>
                      )}
                    </div>
                    {connected ? (
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200 gap-1">
                          <Check className="w-3 h-3" /> Conectado
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                          onClick={() => integration && deleteMutation.mutate(integration.id)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ) : (item as any).isComingSoon ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1.5 shrink-0 opacity-60"
                        onClick={() => toast({ title: "Interesse registrado!", description: "Avisaremos você assim que esta integração estiver disponível." })}
                      >
                        Me avise
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant={isExpanded ? "default" : "outline"}
                        className="h-8 gap-1.5 shrink-0"
                        onClick={() => {
                          setConnecting(isExpanded ? null : item.type);
                          setFormData({});
                        }}
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Conectar
                      </Button>
                    )}
                  </div>

                  {isExpanded && !connected && (
                    <div className="border-t px-4 pb-4 pt-3 space-y-3 bg-muted/20">
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
                        <Button size="sm" variant="ghost" className="h-8" onClick={() => { setConnecting(null); setValidationState({ status: "idle", detail: "" }); }}>
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

      {isLoading && (
        <div className="flex justify-center py-4">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  );
}
