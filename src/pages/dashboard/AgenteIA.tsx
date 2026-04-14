import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Zap,
  Settings2,
  Sparkles,
  Save,
  Bot,
  ShieldCheck,
  UserCheck,
  Headset,
  Target,
  MessageSquare,
  Heart,
  CreditCard,
  TrendingUp,
  AlertCircle,
  Info,
  GitBranch,
  Play,
  Store,
  Eye,
  EyeOff,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useStoreScope } from "@/contexts/StoreScopeContext";
import { useAiAgentConfig, aiAgentConfigQueryKey } from "@/hooks/useAiAgentConfig";
import { toast } from "sonner";
import { isBetaLimitedScope } from "@/lib/beta-scope";
import {
  AI_AGENT_PERSONALITY_PRESETS,
  buildNewStoreAiConfig,
  defaultPromptForPersonality,
} from "@/lib/ai-agent-personalities";
import { AI_AGENT_EDGE_MODEL } from "@/lib/ai-edge-model";
import type { Database } from "@/integrations/supabase/types";

type AiConfigInsert = Database["public"]["Tables"]["ai_agent_config"]["Insert"];
/** Estado editável (linha existente ou rascunho por loja). */
type EditableAiConfig = AiConfigInsert & { id?: string };

const PERSONA_ICONS: Record<string, LucideIcon> = {
  consultivo: Target,
  suporte: Headset,
  amigavel: Heart,
  formal: UserCheck,
};

export default function AgenteIA() {
  const { user, profile } = useAuth();
  const scope = useStoreScope();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [selectedLoja, setSelectedLoja] = useState<string>("");

  const [config, setConfig] = useState<EditableAiConfig>(() => ({
    ...buildNewStoreAiConfig(""),
    user_id: user?.id ?? "",
  }));

  const [iaNegotiation, setIaNegotiation] = useState(true);
  const [iaMaxDiscount, setIaMaxDiscount] = useState([10]);
  const [socialProof, setSocialProof] = useState(true);
  const [pixKey, setPixKey] = useState("");
  const [showPixKey, setShowPixKey] = useState(false);

  const presetsWithIcons = useMemo(
    () =>
      AI_AGENT_PERSONALITY_PRESETS.map((p) => ({
        ...p,
        icon: PERSONA_ICONS[p.id] ?? Target,
      })),
    [],
  );

  const storesQuery = useQuery({
    queryKey: ["agente-ia-stores", user?.id],
    enabled: !!user && scope?.ready === true,
    queryFn: async () => {
      const effectiveUserId = scope.effectiveUserId;
      if (!effectiveUserId) return [] as { id: string; name: string }[];
      const { data, error } = await supabase
        .from("stores")
        .select("id, name")
        .eq("user_id", effectiveUserId)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });

  const lojas = useMemo(() => storesQuery.data ?? [], [storesQuery.data]);
  const storeListLoading = storesQuery.isLoading;
  const storesLoadError = storesQuery.isError;

  useEffect(() => {
    if (!lojas.length) return;
    // Do not reset the selected store while a save is in progress — it would cause
    // the in-flight mutation to target a stale storeId.
    if (saving) return;
    setSelectedLoja((prev) => (prev && lojas.some((s) => s.id === prev) ? prev : lojas[0].id));
  }, [lojas, saving]);

  useEffect(() => {
    if (storesQuery.isError) toast.error("Não foi possível carregar as lojas.");
  }, [storesQuery.isError]);

  const aiConfigQuery = useAiAgentConfig(selectedLoja || undefined, user?.id);
  const recentActions = aiConfigQuery.data?.recentActions ?? [];

  useEffect(() => {
    if (aiConfigQuery.isError) toast.error("Erro ao carregar configuração do agente.");
  }, [aiConfigQuery.isError]);

  useEffect(() => {
    if (!selectedLoja || !aiConfigQuery.isSuccess || !aiConfigQuery.data) return;
    if (aiConfigQuery.data.storeId !== selectedLoja) return;
    if (isDirty) return;
    const { row, ownerId } = aiConfigQuery.data;
    if (row) {
      setConfig({ ...row });
    } else {
      setConfig({
        ...buildNewStoreAiConfig(selectedLoja),
        user_id: ownerId,
      });
    }
    setIsDirty(false);
  }, [selectedLoja, aiConfigQuery.isSuccess, aiConfigQuery.data, isDirty]);

  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  useEffect(() => {
    if (!profile) return;
    setIaNegotiation(profile.ia_negotiation_enabled ?? true);
    setIaMaxDiscount([profile.ia_max_discount_pct ?? 10]);
    setSocialProof(profile.social_proof_enabled ?? true);
    setPixKey(profile.pix_key ?? "");
  }, [profile]);

  const applyPreset = (preset: (typeof presetsWithIcons)[number]) => {
    setConfig((prev) => ({
      ...prev,
      personalidade_preset: preset.id,
      prompt_sistema: preset.prompt,
    }));
    setIsDirty(true);
    toast.info(`Personalidade "${preset.nome}" aplicada.`);
  };

  function handleDiscard() {
    // Explicitly reset all form fields to the last confirmed saved values so
    // there is no timing gap if aiConfigQuery is currently background-refetching.
    const saved = aiConfigQuery.data;
    if (saved?.row) {
      setConfig({ ...saved.row });
    } else if (saved?.ownerId && selectedLoja) {
      setConfig({ ...buildNewStoreAiConfig(selectedLoja), user_id: saved.ownerId });
    }
    // Profile-level fields
    if (profile) {
      setIaNegotiation(profile.ia_negotiation_enabled ?? true);
      setIaMaxDiscount([profile.ia_max_discount_pct ?? 10]);
      setSocialProof(profile.social_proof_enabled ?? true);
      setPixKey(profile.pix_key ?? "");
    }
    // Clearing isDirty also triggers the useEffect as a secondary sync
    // in case saved data arrives after this tick.
    setIsDirty(false);
  }

  async function handleSave() {
    if (!user?.id || !selectedLoja) {
      toast.error("Selecione uma loja para salvar.");
      return;
    }
    const tenantOwnerId = scope.effectiveUserId ?? user.id;
    if (!tenantOwnerId) {
      toast.error("Não foi possível identificar a conta da loja.");
      return;
    }

    const rawPrompt = (config.prompt_sistema ?? "").trim();
    const prompt_sistema =
      rawPrompt || defaultPromptForPersonality(String(config.personalidade_preset ?? "consultivo"));

    setSaving(true);
    const payload: AiConfigInsert = {
      ...config,
      prompt_sistema,
      user_id: tenantOwnerId,
      store_id: selectedLoja,
      updated_at: new Date().toISOString(),
    };

    const { error: cfgError } = await supabase.from("ai_agent_config").upsert(payload, {
      onConflict: "store_id",
    });

    if (cfgError) {
      toast.error(cfgError.message || "Erro ao salvar configuração do agente.");
      setSaving(false);
      return;
    }

    if (tenantOwnerId === user.id) {
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          ia_negotiation_enabled: iaNegotiation,
          ia_max_discount_pct: iaMaxDiscount[0],
          social_proof_enabled: socialProof,
          pix_key: pixKey || null,
        })
        .eq("id", user.id);

      if (profileError) {
        toast.error(
          `Configuração do agente salva, mas o perfil não atualizou: ${profileError.message}`,
        );
        setSaving(false);
        return;
      }
    }

    setIsDirty(false);
    await queryClient.invalidateQueries({
      queryKey: aiAgentConfigQueryKey(user.id, selectedLoja),
    });
    toast.success(
      tenantOwnerId === user.id
        ? "Configuração atualizada."
        : "Configuração do agente guardada. Negociação, prova social e PIX só o proprietário altera no perfil.",
    );
    setSaving(false);
  }

  // Show loader only while scope is hydrating or stores query is in flight.
  // If scope.ready is permanently false (hydration error), storesLoadError will eventually
  // fire via the query's own retry mechanism, surfacing the error card below.
  const scopeReady = scope?.ready === true;
  const showInitialLoader = (!scopeReady || storeListLoading) && !selectedLoja && !storesLoadError;
  const modo = (config.modo === "piloto_automatico" ? "piloto_automatico" : "sugestao") as
    | "sugestao"
    | "piloto_automatico";

  const onSelectLoja = (id: string) => {
    if (isDirty) {
      const ok = window.confirm(
        "Existem alterações não guardadas. Trocar de loja descarta o que não foi guardado na sessão atual. Continuar?",
      );
      if (!ok) return;
      setIsDirty(false);
    }
    setSelectedLoja(id);
  };

  if (showInitialLoader) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full max-w-2xl" />
      </div>
    );
  }

  if (storesLoadError && !storeListLoading) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16 text-center px-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <h1 className="text-xl font-bold font-syne">Erro ao carregar lojas</h1>
        <p className="text-sm text-muted-foreground max-w-md">
          Verifique a ligação e as permissões da conta. Se o problema continuar, tente mais tarde.
        </p>
        <Button type="button" onClick={() => void storesQuery.refetch()}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  if (!lojas.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16 text-center px-4">
        <Store className="h-12 w-12 text-muted-foreground" />
        <h1 className="text-xl font-bold font-syne">Nenhuma loja encontrada</h1>
        <p className="text-sm text-muted-foreground max-w-md">
          Crie uma loja no onboarding para configurar o agente de IA por loja.
        </p>
        <Button asChild>
          <Link to="/onboarding">Ir para onboarding</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-28">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-black font-syne tracking-tighter uppercase flex items-center gap-3 italic">
            <Bot className="w-8 h-8 text-primary" /> Agente IA
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-muted-foreground text-sm font-medium">Loja:</p>
            <Select value={selectedLoja} onValueChange={onSelectLoja}>
              <SelectTrigger className="h-8 w-fit bg-muted border-none font-bold text-xs rounded-lg px-3">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {lojas.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {modo === "piloto_automatico" && config.ativo && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-900 dark:text-amber-100 max-w-md">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Piloto automático ativo: mensagens de clientes no WhatsApp podem receber resposta
                automática. Revise prompt e conhecimento da loja antes de deixar em produção.
              </span>
            </div>
          )}
          <div className="flex items-center gap-3 bg-card border border-border/50 p-2 px-4 rounded-2xl shadow-sm shrink-0">
            <div className="flex flex-col items-end">
              <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">
                Agente
              </span>
              <span
                className={cn(
                  "text-xs font-black",
                  config?.ativo ? "text-emerald-500" : "text-red-500",
                )}
              >
                {config?.ativo ? "ATIVO" : "DESATIVADO"}
              </span>
            </div>
            <Switch
              checked={!!config?.ativo}
              onCheckedChange={(val) => {
                setConfig((prev) => ({ ...prev, ativo: val }));
                setIsDirty(true);
              }}
            />
          </div>
        </div>
      </div>

      {aiConfigQuery.isPending && selectedLoja ? (
        <div className="space-y-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <Tabs defaultValue="vendas" className="w-full">
          <TabsList className="bg-muted/50 p-1 rounded-xl mb-8 overflow-x-auto flex-nowrap h-auto justify-start border border-border/20">
            <TabsTrigger value="vendas" className="rounded-lg px-6 font-bold text-xs gap-2">
              <Zap className="w-3.5 h-3.5" /> Negociação & Vendas
            </TabsTrigger>
            <TabsTrigger value="persona" className="rounded-lg px-6 font-bold text-xs gap-2">
              <UserCheck className="w-3.5 h-3.5" /> Persona & Voz
            </TabsTrigger>
            <TabsTrigger value="fluxos" className="rounded-lg px-6 font-bold text-xs gap-2">
              <GitBranch className="w-3.5 h-3.5" /> Fluxos
            </TabsTrigger>
            <TabsTrigger value="simulador" className="rounded-lg px-6 font-bold text-xs gap-2">
              <Play className="w-3.5 h-3.5" /> Pré-visualização
            </TabsTrigger>
          </TabsList>

          <TabsContent value="vendas" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="p-6 space-y-8 shadow-sm border-none bg-card/50">
                <div className="space-y-1">
                  <h3 className="text-lg font-bold flex items-center gap-2">
                    <Zap className="w-5 h-5 text-amber-500" /> IA negociadora
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Regras aplicadas nas sugestões e no piloto automático (via servidor, modelo{" "}
                    <span className="font-mono text-[10px]">{AI_AGENT_EDGE_MODEL}</span>).
                  </p>
                </div>

                <div className="space-y-6">
                  <div className="flex items-center justify-between p-4 bg-background/50 rounded-xl border border-border/40">
                    <Label className="text-sm font-bold cursor-pointer" htmlFor="neg-active">
                      Ativar negociação automática
                    </Label>
                    <Switch
                      id="neg-active"
                      checked={iaNegotiation}
                      onCheckedChange={(v) => {
                        setIaNegotiation(v);
                        setIsDirty(true);
                      }}
                    />
                  </div>

                  <div className="space-y-4">
                    <div className="flex justify-between items-end">
                      <Label className="text-xs font-bold uppercase text-muted-foreground tracking-widest">
                        Margem de desconto máxima
                      </Label>
                      <span className="text-xl font-black text-amber-500">{iaMaxDiscount[0]}%</span>
                    </div>
                    <Slider
                      value={iaMaxDiscount}
                      onValueChange={(v) => {
                        setIaMaxDiscount(v);
                        setIsDirty(true);
                      }}
                      max={30}
                      min={5}
                      step={5}
                      className="py-2"
                    />
                    <div className="flex items-start gap-2 bg-amber-500/5 p-3 rounded-lg border border-amber-500/10">
                      <Info className="w-3 h-3 text-amber-600 mt-0.5 shrink-0" />
                      <p className="text-[10px] text-amber-700 dark:text-amber-200 font-medium leading-relaxed">
                        A IA orienta respeitando esse teto ao sugerir cupons ou descontos verbais.
                      </p>
                    </div>
                  </div>
                </div>
              </Card>

              <Card className="p-6 space-y-8 shadow-sm border-none bg-card/50">
                <div className="space-y-1">
                  <h3 className="text-lg font-bold flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-emerald-500" /> Prova social
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Quando ativo, a IA pode mencionar compras recentes de forma genérica, sem
                    inventar números.
                  </p>
                </div>

                <div className="space-y-6">
                  <div className="flex items-center justify-between p-4 bg-background/50 rounded-xl border border-border/40">
                    <Label className="text-sm font-bold cursor-pointer" htmlFor="social-active">
                      Permitir prova social nas respostas
                    </Label>
                    <Switch
                      id="social-active"
                      checked={socialProof}
                      onCheckedChange={(v) => {
                        setSocialProof(v);
                        setIsDirty(true);
                      }}
                    />
                  </div>
                  <div className="bg-[#0A0A0F] rounded-xl p-4 border border-white/5 space-y-3">
                    <span className="text-[8px] font-black uppercase tracking-widest text-emerald-500/60 flex items-center gap-1">
                      <Sparkles className="w-2 h-2" /> Exemplo
                    </span>
                    <p className="text-[11px] text-white/80 leading-relaxed italic">
                      &quot;Muita gente está garantindo a peça hoje — quer que eu reserve a sua?&quot;
                    </p>
                  </div>
                </div>
              </Card>

              <Card className="p-6 space-y-8 shadow-sm border-none bg-card/50 md:col-span-2 lg:col-span-1">
                <div className="space-y-1">
                  <h3 className="text-lg font-bold flex items-center gap-2">
                    <CreditCard className="w-5 h-5 text-blue-500" /> Chave PIX
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Guardada no seu perfil de utilizador; a IA só deve citar esta chave quando o
                    cliente pedir PIX.
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">
                      Chave PIX
                    </Label>
                    <div className="relative">
                      <Input
                        type={showPixKey ? "text" : "password"}
                        value={pixKey}
                        onChange={(e) => {
                          setPixKey(e.target.value);
                          setIsDirty(true);
                        }}
                        placeholder="CNPJ, e-mail ou telefone"
                        className={cn(
                          "h-11 rounded-xl bg-background/50 font-mono text-sm pr-10",
                          iaNegotiation && !pixKey.trim() && "border-amber-500",
                        )}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPixKey((v) => !v)}
                        aria-label={showPixKey ? "Ocultar chave PIX" : "Mostrar chave PIX"}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showPixKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      Visível para quem tiver acesso a esta conta no dashboard.
                    </p>
                  </div>
                </div>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="persona" className="space-y-8">
            <Card className="p-6 space-y-4 border border-border/50">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-bold flex items-center gap-2">
                    <Settings2 className="w-4 h-4" /> Modo de operação
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Sugestão: só na inbox (operador). Piloto automático: webhook pode enviar
                    respostas no WhatsApp quando o agente estiver ativo.
                  </p>
                </div>
                <div className="flex bg-muted p-1 rounded-xl shrink-0">
                  <Button
                    type="button"
                    variant={modo === "sugestao" ? "secondary" : "ghost"}
                    size="sm"
                    className="h-8 text-[10px] font-black uppercase"
                    onClick={() => {
                      setConfig((prev) => ({ ...prev, modo: "sugestao" }));
                      setIsDirty(true);
                    }}
                  >
                    Sugestão
                  </Button>
                  <Button
                    type="button"
                    variant={modo === "piloto_automatico" ? "secondary" : "ghost"}
                    size="sm"
                    className="h-8 text-[10px] font-black uppercase"
                    onClick={() => {
                      setConfig((prev) => ({ ...prev, modo: "piloto_automatico" }));
                      setIsDirty(true);
                    }}
                  >
                    Piloto automático
                  </Button>
                </div>
              </div>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-8">
                <section className="space-y-4">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
                    Voz da marca
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {presetsWithIcons.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => applyPreset(p)}
                        className={cn(
                          "text-left p-5 rounded-2xl border-2 transition-all cursor-pointer relative overflow-hidden group",
                          config.personalidade_preset === p.id
                            ? "border-primary bg-primary/5 shadow-lg shadow-primary/5"
                            : "border-border/50 bg-card hover:border-primary/20",
                        )}
                      >
                        <div className="flex gap-4 relative z-10">
                          <div
                            className={cn(
                              "w-12 h-12 rounded-xl flex items-center justify-center transition-colors",
                              config.personalidade_preset === p.id
                                ? "bg-primary text-white"
                                : "bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary",
                            )}
                          >
                            <p.icon className="w-6 h-6" />
                          </div>
                          <div className="flex-1">
                            <h4 className="font-bold text-sm">{p.nome}</h4>
                            <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">
                              {p.desc}
                            </p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </section>

                <Card className="p-6 space-y-6 shadow-sm border-none bg-card/50">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground italic">
                      Prompt de sistema
                    </Label>
                    <Textarea
                      value={config.prompt_sistema ?? ""}
                      onChange={(e) => {
                        setConfig((prev) => ({ ...prev, prompt_sistema: e.target.value }));
                        setIsDirty(true);
                      }}
                      className="min-h-[120px] bg-background/50 font-mono text-[11px] leading-relaxed rounded-xl border-none"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                      Tom de voz
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="inline-flex text-muted-foreground hover:text-foreground"
                              aria-label="Ajuda tom de voz"
                            >
                              <Info className="w-3 h-3" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent className="text-[10px] max-w-xs">
                            Usado no texto de instrução enviado ao modelo junto com o prompt e a
                            base de conhecimento.
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </Label>
                    <Input
                      value={config.tom_de_voz ?? ""}
                      onChange={(e) => {
                        setConfig((prev) => ({ ...prev, tom_de_voz: e.target.value }));
                        setIsDirty(true);
                      }}
                      placeholder="Ex.: amigável e profissional"
                      className="h-11 rounded-xl bg-background/50 text-sm"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      Base de conhecimento (FAQ, prazos, frete)
                    </Label>
                    <Textarea
                      value={config.conhecimento_loja ?? ""}
                      onChange={(e) => {
                        setConfig((prev) => ({ ...prev, conhecimento_loja: e.target.value }));
                        setIsDirty(true);
                      }}
                      className="min-h-[100px] bg-background/50 text-[11px] leading-relaxed rounded-xl border-none"
                      placeholder="Políticas da loja, prazos de envio, trocas…"
                    />
                  </div>
                </Card>
              </div>

              <div className="space-y-6">
                <Card className="p-6 bg-muted/30 border border-border/50 rounded-2xl">
                  <h4 className="font-bold text-xs mb-3 uppercase tracking-widest text-muted-foreground">
                    Modelo e privacidade
                  </h4>
                  <ul className="space-y-3 text-[11px] text-muted-foreground leading-relaxed">
                    <li className="flex gap-2">
                      <ShieldCheck className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                      <span>
                        As respostas são geradas no servidor (Anthropic). O modelo configurado na
                        edge é{" "}
                        <span className="font-mono text-foreground text-[10px]">
                          {AI_AGENT_EDGE_MODEL}
                        </span>
                        .
                      </span>
                    </li>
                    <li className="flex gap-2">
                      <Bot className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                      <span>
                        Não invente dados sensíveis no prompt: a IA segue o que escrever aqui e a
                        base de conhecimento.
                      </span>
                    </li>
                    <li className="flex gap-2">
                      <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                      <span>
                        Chaves de API (Anthropic, etc.) ficam nos secrets das Edge Functions no
                        Supabase, não nesta página.
                      </span>
                    </li>
                  </ul>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="fluxos" className="space-y-6">
            <Card className="p-8 border-dashed border-2 bg-muted/10 text-center space-y-3 max-w-xl mx-auto">
              <GitBranch className="w-10 h-10 mx-auto text-muted-foreground" />
              <h3 className="font-bold text-sm">Fluxos estruturados em breve</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Menus fixos, rastreio e coleta passo a passo exigirão editor dedicado e armazenamento
                próprio. Por agora use o prompt e a base de conhecimento para orientar a IA.
              </p>
            </Card>
          </TabsContent>

          <TabsContent value="simulador" className="space-y-6 max-w-2xl mx-auto">
            <Card className="p-6 space-y-4 rounded-3xl border-none bg-[#0A0A0F] shadow-2xl overflow-hidden relative">
              <div className="flex items-center justify-between border-b border-white/5 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-orange-500 flex items-center justify-center shadow-lg shadow-orange-500/20">
                    <Bot className="w-6 h-6 text-white" />
                  </div>
                  <div className="text-left">
                    <p className="text-xs font-bold text-white tracking-tight uppercase italic">
                      Pré-visualização estática
                    </p>
                    <p className="text-[9px] text-white/50 font-medium">
                      Não chama a API; apenas ilustra regras atuais de negociação.
                    </p>
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className="text-[8px] border-white/10 text-white/50 px-2 py-1 uppercase font-black tracking-widest"
                >
                  Offline
                </Badge>
              </div>

              <div className="h-[280px] overflow-y-auto space-y-6 py-4 text-left">
                <div className="bg-muted/20 rounded-2xl p-4 text-[11px] max-w-[85%] border border-border/50 text-white/70 italic leading-relaxed">
                  &quot;Olá! Gostei da jaqueta, mas achei o preço um pouco alto. Tem desconto?&quot;
                </div>
                <div className="bg-primary/10 rounded-2xl p-4 text-[11px] max-w-[85%] ml-auto text-right font-medium text-primary border border-primary/20 leading-relaxed">
                  {iaNegotiation
                    ? `Entendo! Se fizer sentido, posso mencionar até ${iaMaxDiscount[0]}% em condições combinadas com a loja. Posso ajudar com o tamanho ou envio?`
                    : "Nossos preços refletem a qualidade do produto. Posso ajudar com outra dúvida?"}
                </div>
              </div>

              <p className="text-[10px] text-center text-white/40 px-2">
                Para testar a IA de verdade, use uma conversa na inbox com sugestão de resposta.
              </p>
              {!isBetaLimitedScope && (
                <Button variant="secondary" size="sm" className="w-full rounded-xl" asChild>
                  <Link to="/dashboard/inbox">Abrir inbox</Link>
                </Button>
              )}
            </Card>
          </TabsContent>
        </Tabs>
      )}

      <div
        className={cn(
          "fixed bottom-0 left-0 right-0 p-4 bg-background/95 backdrop-blur-lg border-t border-border z-50 flex items-center justify-between gap-3 transition-all duration-300",
          isDirty ? "opacity-100 translate-y-0" : "opacity-0 translate-y-full pointer-events-none",
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
          <span className="text-xs font-bold text-amber-600 truncate">Mudanças não salvas</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            type="button"
            variant="ghost"
            onClick={handleDiscard}
            disabled={saving}
            className="h-11 px-4 rounded-xl text-xs text-muted-foreground"
          >
            Descartar
          </Button>
          <Button
            onClick={() => void handleSave()}
            disabled={saving || !selectedLoja}
            className="h-11 px-8 rounded-xl font-black text-xs uppercase tracking-widest gap-2 bg-primary text-primary-foreground shadow-lg shadow-primary/30"
          >
            {saving ? <Zap className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Guardar
          </Button>
        </div>
      </div>
    </div>
  );
}
