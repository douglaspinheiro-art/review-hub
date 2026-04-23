import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Loader2, Check, ShieldCheck, AlertCircle,
  BellRing, Smartphone, Mail, Clock, ShoppingBag,
  Zap, MessageSquare, TrendingUp, CreditCard, Wifi, LogOut, X,
} from "lucide-react";
import { BarChart3 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useStoreScope } from "@/contexts/StoreScopeContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Database } from "@/integrations/supabase/types";
import { PROFILE_SESSION_SELECT, SETTINGS_V3_SELECT } from "@/lib/supabase-select-fragments";

type SettingsV3Row = Database["public"]["Tables"]["settings_v3"]["Row"];
type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

type FormBaseline = {
  fullName: string;
  companyName: string;
  iaNegotiation: boolean;
  iaMaxDiscount: number;
  socialProof: boolean;
  pixKey: string;
  waCap: number;
  emailCap: number;
  cooldown: number;
  pulseAtivo: boolean;
  pulseNum: string;
  pulseDia: string;
  pulseHora: string;
};

function baselineFromProfileAndSettings(
  profile: Pick<
    ProfileRow,
    "full_name" | "company_name" | "ia_negotiation_enabled" | "ia_max_discount_pct" | "social_proof_enabled" | "pix_key"
  >,
  row: SettingsV3Row | null | undefined
): FormBaseline {
  return {
    fullName: profile.full_name ?? "",
    companyName: profile.company_name ?? "",
    iaNegotiation: profile.ia_negotiation_enabled ?? true,
    iaMaxDiscount: profile.ia_max_discount_pct ?? 10,
    socialProof: profile.social_proof_enabled ?? true,
    pixKey: profile.pix_key ?? "",
    waCap: row?.cap_msgs_whatsapp_semana ?? 2,
    emailCap: row?.cap_msgs_email_semana ?? 3,
    cooldown: row?.cooldown_pos_compra_dias ?? 7,
    pulseAtivo: row?.pulse_active ?? true,
    pulseNum: row?.pulse_whatsapp_number ?? "",
    pulseDia: String(row?.pulse_day_of_week ?? 1),
    pulseHora: row?.pulse_time ?? "08:00",
  };
}

function digitsOnly(s: string) {
  return s.replace(/\D/g, "");
}

export default function Configuracoes() {
  const { user, profile, refetchProfile, signOut } = useAuth();
  const scope = useStoreScope();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const baselineRef = useRef<FormBaseline | null>(null);
  const settingsHydratedRef = useRef(false);

  useEffect(() => {
    settingsHydratedRef.current = false;
  }, [user?.id]);

  const [isDirty, setIsDirty] = useState(false);
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");

  const [waCap, setWaCap] = useState([2]);
  const [emailCap, setEmailCap] = useState([3]);
  const [cooldown, setCooldown] = useState([7]);

  const [iaNegotiation, setIaNegotiation] = useState(true);
  const [iaMaxDiscount, setIaMaxDiscount] = useState([10]);
  const [socialProof, setSocialProof] = useState(true);
  const [pixKey, setPixKey] = useState("");

  const [pulseAtivo, setPulseAtivo] = useState(true);
  const [pulseNum, setPulseNum] = useState("");
  const [pulseDia, setPulseDia] = useState("1");
  const [pulseHora, setPulseHora] = useState("08:00");

  const markDirty = useCallback(() => setIsDirty(true), []);

  const {
    data: configV3,
    isLoading: settingsLoading,
    isError: settingsError,
    error: settingsQueryError,
    isFetched: settingsFetched,
    refetch: refetchSettings,
  } = useQuery({
    queryKey: ["settings_v3", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("settings_v3")
        .select(SETTINGS_V3_SELECT)
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data as SettingsV3Row | null;
    },
    enabled: !!user,
  });

  const { data: integrationData } = useQuery({
    queryKey: ["configuracoes_integrations", user?.id],
    queryFn: async () => {
      const [waRes, smsRes, storeRes] = await Promise.all([
        supabase.from("whatsapp_connections").select("id, status, provider").eq("user_id", user!.id),
        supabase.from("sms_connections").select("id, is_active, provider").eq("user_id", user!.id),
        supabase.from("stores").select("id, email_from_address").eq("user_id", user!.id).order("created_at", { ascending: true }).limit(1).maybeSingle(),
      ]);
      return {
        whatsapp: waRes.data ?? [],
        sms: smsRes.data ?? [],
        storeEmail: storeRes.data?.email_from_address ?? null,
      };
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  // Privacidade — opt-out de benchmark anônimo cross-tenant (LGPD)
  const activeStoreId = scope.activeStoreId;
  const { data: privacyStore, refetch: refetchPrivacy } = useQuery({
    queryKey: ["store_privacy", activeStoreId],
    queryFn: async () => {
      if (!activeStoreId) return null;
      const { data, error } = await supabase
        .from("stores")
        .select("id, benchmark_opt_out")
        .eq("id", activeStoreId)
        .maybeSingle();
      if (error) throw error;
      return data as { id: string; benchmark_opt_out: boolean } | null;
    },
    enabled: !!activeStoreId,
  });

  const benchmarkOptOut = privacyStore?.benchmark_opt_out ?? false;
  const togglePrivacyMutation = useMutation({
    mutationFn: async (newValue: boolean) => {
      if (!activeStoreId) throw new Error("Selecione uma loja");
      const { error } = await supabase
        .from("stores")
        .update({ benchmark_opt_out: newValue })
        .eq("id", activeStoreId);
      if (error) throw error;
    },
    onSuccess: async (_data, newValue) => {
      toast.success(
        newValue
          ? "Loja removida dos benchmarks anônimos."
          : "Loja incluída nos benchmarks anônimos."
      );
      await refetchPrivacy();
    },
    onError: (e: Error) => toast.error(e.message || "Erro ao salvar"),
  });

  // Sincroniza só quando o objeto `profile` vindo do servidor muda — não incluir `isDirty`
  // para que "Descartar" não seja sobrescrito no mesmo ciclo.
  useEffect(() => {
    if (isDirty) return;
    if (!profile) return;
    setFullName(profile.full_name ?? "");
    setCompanyName(profile.company_name ?? "");
    setIaNegotiation(profile.ia_negotiation_enabled ?? true);
    setIaMaxDiscount([profile.ia_max_discount_pct ?? 10]);
    setSocialProof(profile.social_proof_enabled ?? true);
    setPixKey(profile.pix_key ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ver comentário acima
  }, [profile]);

  useEffect(() => {
    if (!settingsFetched) return;
    const row = configV3;
    const apply = () => {
      setWaCap([row?.cap_msgs_whatsapp_semana ?? 2]);
      setEmailCap([row?.cap_msgs_email_semana ?? 3]);
      setCooldown([row?.cooldown_pos_compra_dias ?? 7]);
      setPulseAtivo(row?.pulse_active ?? true);
      setPulseNum(row?.pulse_whatsapp_number ?? "");
      setPulseDia(String(row?.pulse_day_of_week ?? 1));
      setPulseHora(row?.pulse_time ?? "08:00");
    };
    if (!settingsHydratedRef.current) {
      settingsHydratedRef.current = true;
      apply();
      return;
    }
    if (isDirty) return;
    apply();
  }, [configV3, settingsFetched, isDirty]);

  useEffect(() => {
    if (!profile || !user || !settingsFetched || isDirty) return;
    baselineRef.current = baselineFromProfileAndSettings(profile as ProfileRow, configV3);
  }, [profile, configV3, settingsFetched, user, isDirty]);

  const applyBaseline = useCallback(() => {
    const b = baselineRef.current;
    if (!b) return;
    setFullName(b.fullName);
    setCompanyName(b.companyName);
    setIaNegotiation(b.iaNegotiation);
    setIaMaxDiscount([b.iaMaxDiscount]);
    setSocialProof(b.socialProof);
    setPixKey(b.pixKey);
    setWaCap([b.waCap]);
    setEmailCap([b.emailCap]);
    setCooldown([b.cooldown]);
    setPulseAtivo(b.pulseAtivo);
    setPulseNum(b.pulseNum);
    setPulseDia(b.pulseDia);
    setPulseHora(b.pulseHora);
    setIsDirty(false);
  }, []);

  const discardChanges = useCallback(() => {
    if (!baselineRef.current) {
      setIsDirty(false);
      return;
    }
    applyBaseline();
  }, [applyBaseline]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Sessão inválida");
      if (iaNegotiation && !pixKey.trim()) {
        throw new Error("Informe a chave PIX para usar a IA negociadora.");
      }
      if (pulseAtivo && pulseNum.trim() && digitsOnly(pulseNum).length < 10) {
        throw new Error("Número do Pulse inválido: use DDD + número.");
      }

      const storeId = scope.activeStoreId;

      const [profileRes, configRes] = await Promise.all([
        supabase
          .from("profiles")
          .update({
            full_name: fullName,
            company_name: companyName,
            ia_negotiation_enabled: iaNegotiation,
            ia_max_discount_pct: iaMaxDiscount[0],
            social_proof_enabled: socialProof,
            pix_key: pixKey.trim() || null,
          })
          .eq("id", user.id),
        supabase
          .from("settings_v3")
          .upsert(
            {
              user_id: user.id,
              store_id: storeId,
              cap_msgs_whatsapp_semana: waCap[0],
              cap_msgs_email_semana: emailCap[0],
              cooldown_pos_compra_dias: cooldown[0],
              pulse_active: pulseAtivo,
              pulse_day_of_week: Number(pulseDia),
              pulse_time: pulseHora,
              pulse_whatsapp_number: pulseNum.trim() || null,
            },
            { onConflict: "user_id" }
          ),
      ]);
      if (profileRes.error) throw profileRes.error;
      if (configRes.error) throw configRes.error;
    },
    onSuccess: async () => {
      setIsDirty(false);
      toast.success("Configurações atualizadas com sucesso!");
      await refetchProfile();
      await queryClient.invalidateQueries({ queryKey: ["settings_v3"] });
      const freshSettings = await refetchSettings();
      const { data: freshProfile } = await supabase.from("profiles").select(PROFILE_SESSION_SELECT).eq("id", user!.id).single();
      if (freshProfile) {
        baselineRef.current = baselineFromProfileAndSettings(
          freshProfile as ProfileRow,
          (freshSettings.data ?? null) as SettingsV3Row | null
        );
      }
    },
    onError: (e: Error) => toast.error(e.message || "Erro ao salvar"),
  });

  const handlePasswordReset = async () => {
    if (!user?.email) return;
    const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) toast.error(error.message);
    else toast.success("Enviamos um e-mail com o link para redefinir a senha.");
  };

  const waList = integrationData?.whatsapp ?? [];
  const waConnected = waList.some((c) => c.status === "connected");
  const smsList = integrationData?.sms ?? [];
  const smsActive = smsList.some((c) => c.is_active);
  const resendHint = integrationData?.storeEmail;

  const canEditSettings = !settingsLoading || settingsFetched;

  return (
    <div className="space-y-8 pb-10">
      <div>
        <h1 className="text-3xl font-black font-syne tracking-tighter uppercase">Configurações</h1>
        <p className="text-muted-foreground text-sm mt-1">Gerencie a inteligência, proteção e dados da sua conta.</p>
      </div>

      {settingsError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Erro ao carregar preferências</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-2">
            {(settingsQueryError as Error)?.message ?? "Tente novamente."}
            <Button type="button" variant="outline" size="sm" onClick={() => refetchSettings()}>
              Tentar de novo
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {settingsLoading && !settingsFetched && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando preferências da conta…
        </div>
      )}

      <Tabs defaultValue="perfil" className="w-full">
        <TabsList className="bg-muted/50 p-1 rounded-xl mb-8 overflow-x-auto flex-nowrap h-auto justify-start">
          <TabsTrigger value="perfil" className="rounded-lg px-6 font-bold text-xs">Perfil</TabsTrigger>
          <TabsTrigger value="conversao" className="rounded-lg px-6 font-bold text-xs bg-primary/10 text-primary">Conversão (Beta)</TabsTrigger>
          <TabsTrigger value="protecao" className="rounded-lg px-6 font-bold text-xs">Proteção da Base</TabsTrigger>
          <TabsTrigger value="pulse" className="rounded-lg px-6 font-bold text-xs">Pulse Semanal</TabsTrigger>
          <TabsTrigger value="integracoes" className="rounded-lg px-6 font-bold text-xs">Integrações</TabsTrigger>
          <TabsTrigger value="privacidade" className="rounded-lg px-6 font-bold text-xs">Privacidade</TabsTrigger>
        </TabsList>

        <TabsContent value="perfil" className="space-y-6 max-w-2xl">
          <div className="bg-card border border-border/50 rounded-2xl p-6 space-y-6 shadow-sm">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Nome Completo</Label>
                <Input
                  value={fullName}
                  onChange={(e) => { setFullName(e.target.value); markDirty(); }}
                  className="h-11 rounded-xl bg-background/50"
                  disabled={!canEditSettings}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Nome da Loja</Label>
                <Input
                  value={companyName}
                  onChange={(e) => { setCompanyName(e.target.value); markDirty(); }}
                  className="h-11 rounded-xl bg-background/50"
                  disabled={!canEditSettings}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">E-mail de Acesso</Label>
                <Input value={user?.email || ""} disabled className="h-11 rounded-xl bg-muted/50 opacity-70 cursor-not-allowed" />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Plano Atual</Label>
                <div className="h-11 flex items-center px-4 bg-primary/10 border border-primary/20 rounded-xl text-primary font-bold text-[10px] uppercase tracking-tighter italic">
                  {profile?.plan || "Starter"}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 pt-2 border-t border-border/40">
              <Button type="button" variant="outline" className="rounded-xl" onClick={handlePasswordReset}>
                Redefinir senha por e-mail
              </Button>
              <Button type="button" variant="outline" className="rounded-xl" asChild>
                <Link to="/dashboard/billing">Plano e faturamento</Link>
              </Button>
              <Button type="button" variant="ghost" className="rounded-xl text-destructive" onClick={() => signOut()}>
                <LogOut className="w-4 h-4 mr-2" />
                Sair da conta
              </Button>
            </div>
            <div className="flex gap-2">
              {isDirty && (
                <Button type="button" variant="ghost" className="h-11 rounded-xl px-4 text-muted-foreground" onClick={discardChanges} disabled={saveMutation.isPending}>
                  <X className="w-4 h-4 mr-1.5" /> Descartar
                </Button>
              )}
              <Button
                onClick={() => saveMutation.mutate()}
                className="font-bold h-11 rounded-xl px-8"
                disabled={saveMutation.isPending || !canEditSettings}
              >
                {saveMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Salvar Alterações
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="conversao" className="space-y-6 max-w-4xl">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-card border border-border/50 rounded-2xl p-6 space-y-8 shadow-sm">
              <div className="space-y-1">
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <Zap className="w-5 h-5 text-amber-500" /> IA Negociadora
                </h3>
                <p className="text-xs text-muted-foreground">A IA responde objeções de preço e frete automaticamente.</p>
              </div>
              <div className="space-y-6">
                <div className="flex items-center justify-between p-4 bg-muted/20 rounded-xl border border-border/40">
                  <Label className="text-sm font-bold">Ativar Negociação</Label>
                  <Switch
                    checked={iaNegotiation}
                    onCheckedChange={(v) => { setIaNegotiation(v); markDirty(); }}
                    disabled={!canEditSettings}
                  />
                </div>
                <div className="space-y-4">
                  <div className="flex justify-between items-end">
                    <Label className="text-xs font-bold uppercase text-muted-foreground">Limite de Desconto Automático</Label>
                    <span className="text-xl font-black text-amber-500">{iaMaxDiscount[0]}%</span>
                  </div>
                  <Slider
                    value={iaMaxDiscount}
                    onValueChange={(v) => { setIaMaxDiscount(v); markDirty(); }}
                    max={30}
                    min={5}
                    step={5}
                    className="py-2"
                    disabled={!canEditSettings}
                  />
                  <p className="text-[10px] text-muted-foreground italic">A IA nunca oferecerá mais do que este limite para fechar uma venda.</p>
                </div>
              </div>
            </div>

            <div className="bg-card border border-border/50 rounded-2xl p-6 space-y-8 shadow-sm">
              <div className="space-y-1">
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-emerald-500" /> Prova Social Dinâmica
                </h3>
                <p className="text-xs text-muted-foreground">Injeta urgência real baseada nas vendas recentes da sua loja.</p>
              </div>
              <div className="space-y-6">
                <div className="flex items-center justify-between p-4 bg-muted/20 rounded-xl border border-border/40">
                  <Label className="text-sm font-bold">Ativar Prova Social</Label>
                  <Switch
                    checked={socialProof}
                    onCheckedChange={(v) => { setSocialProof(v); markDirty(); }}
                    disabled={!canEditSettings}
                  />
                </div>
                <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4">
                  <p className="text-[11px] text-emerald-700 italic">&quot;Olá Maria! 14 pessoas compraram este item hoje. Garanta o seu antes que acabe!&quot;</p>
                </div>
              </div>
            </div>

            <div className="bg-card border border-border/50 rounded-2xl p-6 space-y-8 shadow-sm">
              <div className="space-y-1">
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-blue-500" /> PIX Copia e Cola
                </h3>
                <p className="text-xs text-muted-foreground">Gera o código de pagamento instantaneamente no chat.</p>
              </div>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Sua Chave PIX (CNPJ, E-mail ou Celular)</Label>
                  <Input
                    value={pixKey}
                    onChange={(e) => { setPixKey(e.target.value); markDirty(); }}
                    placeholder="00.000.000/0001-00"
                    className={cn("h-11 rounded-xl bg-background/50 font-mono", iaNegotiation && !pixKey && "border-amber-500")}
                    disabled={!canEditSettings}
                  />
                  {iaNegotiation && !pixKey && (
                    <p className="text-[10px] text-amber-600 font-bold flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> Chave obrigatória para a IA Negociadora funcionar.
                    </p>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground">Usado para formatar a mensagem de pagamento rápido.</p>
              </div>
            </div>

            <div className="bg-card border border-border/50 rounded-2xl p-6 space-y-8 shadow-sm opacity-60">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold flex items-center gap-2">
                    <MessageSquare className="w-5 h-5 text-purple-500" /> WhatsApp Flows
                  </h3>
                  <Badge className="bg-purple-500 text-white border-none text-[8px] h-4">EM BREVE</Badge>
                </div>
                <p className="text-xs text-muted-foreground">Checkout nativo e captura de dados sem sair do WhatsApp.</p>
              </div>
              <Button disabled variant="outline" className="w-full rounded-xl text-xs font-bold h-11 border-dashed">Configurar Flows no Meta</Button>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            {isDirty && (
              <Button type="button" variant="ghost" className="h-12 rounded-xl px-5 text-muted-foreground" onClick={discardChanges} disabled={saveMutation.isPending}>
                <X className="w-4 h-4 mr-1.5" /> Descartar
              </Button>
            )}
            <Button
              onClick={() => saveMutation.mutate()}
              className="font-bold h-12 rounded-xl px-12 shadow-lg shadow-primary/20"
              disabled={saveMutation.isPending || !canEditSettings}
            >
              {saveMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Salvar Todas as Configurações de Conversão
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="protecao" className="space-y-6 max-w-2xl">
          <div className="bg-card border border-border/50 rounded-2xl p-6 space-y-10 shadow-sm">
            <div className="space-y-1">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-primary" /> Frequência de Mensagens
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">Evite a saturação da sua base definindo limites de contato por canal.</p>
            </div>
            <div className="space-y-10">
              <div className="space-y-4">
                <div className="flex justify-between items-end">
                  <div className="space-y-1">
                    <Label className="text-sm font-bold flex items-center gap-2"><Smartphone className="w-4 h-4 text-emerald-500" /> Máximo WhatsApp / semana</Label>
                    <p className="text-xs text-muted-foreground">Quantas mensagens de marketing um cliente pode receber.</p>
                  </div>
                  <span className="text-2xl font-black font-syne text-emerald-500">{waCap[0]}</span>
                </div>
                <Slider
                  value={waCap}
                  onValueChange={(v) => { setWaCap(v); markDirty(); }}
                  max={5}
                  min={1}
                  step={1}
                  className="py-2"
                  disabled={!canEditSettings}
                />
              </div>
              <div className="space-y-4">
                <div className="flex justify-between items-end">
                  <div className="space-y-1">
                    <Label className="text-sm font-bold flex items-center gap-2"><Mail className="w-4 h-4 text-blue-500" /> Máximo E-mail / semana</Label>
                    <p className="text-xs text-muted-foreground">Limite semanal para campanhas de e-mail.</p>
                  </div>
                  <span className="text-2xl font-black font-syne text-blue-500">{emailCap[0]}</span>
                </div>
                <Slider
                  value={emailCap}
                  onValueChange={(v) => { setEmailCap(v); markDirty(); }}
                  max={10}
                  min={1}
                  step={1}
                  className="py-2"
                  disabled={!canEditSettings}
                />
              </div>
              <div className="space-y-4">
                <div className="flex justify-between items-end">
                  <div className="space-y-1">
                    <Label className="text-sm font-bold flex items-center gap-2"><Clock className="w-4 h-4 text-primary" /> Cooldown Pós-Compra (Dias)</Label>
                    <p className="text-xs text-muted-foreground">Dias de silêncio após uma compra realizada.</p>
                  </div>
                  <span className="text-2xl font-black font-syne text-primary">{cooldown[0]} dias</span>
                </div>
                <Slider
                  value={cooldown}
                  onValueChange={(v) => { setCooldown(v); markDirty(); }}
                  max={30}
                  min={0}
                  step={1}
                  className="py-2"
                  disabled={!canEditSettings}
                />
              </div>
            </div>
            <div className="pt-8 border-t border-border/50 space-y-4">
              <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 flex gap-3">
                <ShieldCheck className="w-5 h-5 text-primary shrink-0" />
                <p className="text-[11px] text-primary/80 font-medium leading-relaxed">
                  Os limites acima são aplicados na verificação de frequência de envios por cliente e canal (últimos 7 dias), quando o fluxo estiver integrado à sua loja.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              {isDirty && (
                <Button type="button" variant="ghost" className="h-12 rounded-xl px-5 text-muted-foreground shrink-0" onClick={discardChanges} disabled={saveMutation.isPending}>
                  <X className="w-4 h-4 mr-1.5" /> Descartar
                </Button>
              )}
              <Button
                onClick={() => saveMutation.mutate()}
                className="flex-1 font-bold h-12 rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                disabled={saveMutation.isPending || !canEditSettings}
              >
                Salvar Regras de Proteção
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="pulse" className="space-y-6 max-w-2xl">
          <div className="bg-card border border-border/50 rounded-2xl p-6 space-y-8 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <BellRing className="w-5 h-5 text-primary" /> Relatório Pulse via WhatsApp
                </h3>
                <p className="text-sm text-muted-foreground">Receba um resumo da sua saúde de conversão toda semana.</p>
              </div>
              <Switch
                checked={pulseAtivo}
                onCheckedChange={(v) => { setPulseAtivo(v); markDirty(); }}
                disabled={!canEditSettings}
              />
            </div>
            <div className={cn("space-y-6 transition-all duration-300", !pulseAtivo && "opacity-40 pointer-events-none grayscale")}>
              <div className="space-y-2">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Número para Receber</Label>
                <Input
                  placeholder="+55 11 99999-9999"
                  value={pulseNum}
                  onChange={(e) => { setPulseNum(e.target.value); markDirty(); }}
                  className="h-11 rounded-xl font-mono bg-background/50"
                  disabled={!canEditSettings}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Dia da Semana</Label>
                  <Select value={pulseDia} onValueChange={(v) => { setPulseDia(v); markDirty(); }} disabled={!canEditSettings}>
                    <SelectTrigger className="h-11 rounded-xl bg-background/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Segunda-feira</SelectItem>
                      <SelectItem value="2">Terça-feira</SelectItem>
                      <SelectItem value="3">Quarta-feira</SelectItem>
                      <SelectItem value="4">Quinta-feira</SelectItem>
                      <SelectItem value="5">Sexta-feira</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Horário</Label>
                  <Select value={pulseHora} onValueChange={(v) => { setPulseHora(v); markDirty(); }} disabled={!canEditSettings}>
                    <SelectTrigger className="h-11 rounded-xl bg-background/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="08:00">08:00</SelectItem>
                      <SelectItem value="09:00">09:00</SelectItem>
                      <SelectItem value="10:00">10:00</SelectItem>
                      <SelectItem value="11:00">11:00</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="bg-[#13131A] border border-[#1E1E2E] rounded-3xl p-6 space-y-4">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Preview do Relatório</span>
                <div className="bg-background rounded-2xl p-4 border border-border/50 space-y-3 shadow-xl">
                  <div className="flex items-center gap-2 border-b border-border/40 pb-2 mb-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[10px] font-black uppercase italic tracking-tighter">LTV Boost Pulse — Studio Moda</span>
                  </div>
                  <div className="space-y-1.5 font-mono text-[11px]">
                    <p className="font-bold">CHS: 47 → 51 <span className="text-emerald-500">(+4pts) ↑</span></p>
                    <p>💰 Recuperado: <span className="font-bold">R$ 8.940</span></p>
                    <p>👥 Reativados: <span className="font-bold">67 clientes</span></p>
                    <p className="text-primary font-bold">⚡ 1 prescrição esperando aprovação</p>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <div className="h-7 px-3 bg-primary rounded-lg flex items-center justify-center text-[9px] font-black text-primary-foreground cursor-default">APROVAR</div>
                    <div className="h-7 px-3 bg-muted rounded-lg flex items-center justify-center text-[9px] font-black text-muted-foreground cursor-default">DASHBOARD</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              {isDirty && (
                <Button type="button" variant="ghost" className="h-11 rounded-xl px-5 text-muted-foreground shrink-0" onClick={discardChanges} disabled={saveMutation.isPending}>
                  <X className="w-4 h-4 mr-1.5" /> Descartar
                </Button>
              )}
              <Button
                onClick={() => saveMutation.mutate()}
                className="flex-1 font-bold h-11 rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                disabled={saveMutation.isPending || !canEditSettings}
              >
                Salvar Pulse
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="integracoes" className="space-y-6">
          <div className="bg-card border border-border/50 rounded-2xl p-6 space-y-6 shadow-sm">
            <h3 className="text-lg font-bold">Conexões</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-muted/20 rounded-2xl border border-border/40 hover:border-primary/30 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-background flex items-center justify-center shadow-inner">
                    <Wifi className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <div className="text-sm font-bold">WhatsApp (Meta Cloud)</div>
                    <div className={cn(
                      "text-[10px] font-bold uppercase tracking-widest flex items-center gap-1",
                      waConnected ? "text-emerald-500" : "text-amber-500"
                    )}>
                      {waConnected ? (<><Check className="w-3 h-3" /> Conectado</>) : (<><Clock className="w-3 h-3" /> Não conectado</>)}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" className="text-xs font-bold rounded-lg h-9" onClick={() => navigate("/dashboard/whatsapp")}>
                    {waConnected ? "Gerir" : "Conectar"}
                  </Button>
                </div>
              </div>

              <div className="flex items-center justify-between p-4 bg-muted/20 rounded-2xl border border-border/40 hover:border-primary/30 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-background flex items-center justify-center shadow-inner">
                    <Mail className="w-6 h-6 text-blue-500" />
                  </div>
                  <div>
                    <div className="text-sm font-bold">E-mail (remetente da loja)</div>
                    <div className={cn(
                      "text-[10px] font-bold uppercase tracking-widest flex items-center gap-1",
                      resendHint ? "text-emerald-500" : "text-muted-foreground"
                    )}>
                      {resendHint ? (<><Check className="w-3 h-3" /> {resendHint}</>) : "Remetente não configurado na loja"}
                    </div>
                  </div>
                </div>
                <Button type="button" variant="outline" size="sm" className="text-xs font-bold rounded-lg h-9" asChild>
                  <Link to="/dashboard/integracoes">Integrações</Link>
                </Button>
              </div>

              <div className="flex items-center justify-between p-4 bg-muted/20 rounded-2xl border border-border/40 hover:border-primary/30 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-background flex items-center justify-center shadow-inner">
                    <Smartphone className="w-6 h-6 text-purple-500" />
                  </div>
                  <div>
                    <div className="text-sm font-bold">SMS (Zenvia / conexão)</div>
                    <div className={cn(
                      "text-[10px] font-bold uppercase tracking-widest flex items-center gap-1",
                      smsActive ? "text-emerald-500" : "text-amber-500"
                    )}>
                      {smsActive ? (<><Check className="w-3 h-3" /> Ativo</>) : (<><Clock className="w-3 h-3" /> Não configurado</>)}
                    </div>
                  </div>
                </div>
                <Button type="button" variant="outline" size="sm" className="h-9 font-bold text-xs rounded-lg" onClick={() => navigate("/dashboard/integracoes")}>
                  Integrações
                </Button>
              </div>
            </div>

            <div className="pt-6 border-t border-border/50">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-4">Marketplaces (breve)</p>
              <div className="flex flex-wrap gap-3">
                <Button variant="outline" className="h-10 rounded-xl px-4 gap-2 font-bold text-xs" disabled><ShoppingBag className="w-4 h-4" /> Mercado Livre</Button>
                <Button variant="outline" className="h-10 rounded-xl px-4 gap-2 font-bold text-xs" disabled><ShoppingBag className="w-4 h-4 text-orange-500" /> Shopee</Button>
                <Button variant="outline" className="h-10 rounded-xl px-4 gap-2 font-bold text-xs opacity-50" disabled><Smartphone className="w-4 h-4" /> TikTok Shop</Button>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {isDirty && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/95 backdrop-blur-lg border-t border-border z-50 flex items-center justify-between gap-3 animate-in slide-in-from-bottom-full duration-300">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            <span className="text-sm font-bold">Você tem alterações não salvas</span>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" type="button" onClick={discardChanges}>Descartar</Button>
            <Button size="sm" type="button" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !canEditSettings} className="gap-1.5">
              {saveMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Salvar alterações
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
