import { useEffect, useState } from "react";
import { Navigate, Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Shield, ExternalLink, AlertTriangle, Loader2, CheckCircle2,
  Users, Activity, Zap, Store, BarChart3, AlertCircle, Sparkles,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/lib/supabase";
import { useSistemaConfig } from "@/hooks/useSistemaConfig";
import { useIsAdmin } from "@/hooks/useAdminCheck";
import { MultiTenantAudit } from "@/components/admin/MultiTenantAudit";
import { PendingActivations } from "@/components/admin/PendingActivations";
import { AdminStoresTab } from "@/components/admin/AdminStoresTab";
import { toast } from "sonner";

// ─── Pilot Monitor Tab ─────────────────────────────────────────────────────────

function PilotMonitor() {
  const { data: stores, isLoading } = useQuery({
    queryKey: ["admin-pilot-stores"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores" as never)
        .select("id, name, user_id, plataforma, created_at, integration_status")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string; name: string; user_id: string;
        plataforma: string | null; created_at: string;
        integration_status: string | null;
      }>;
    },
    staleTime: 30_000,
  });

  const { data: profiles } = useQuery({
    queryKey: ["admin-pilot-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, plan, trial_ends_at, onboarding_completed, created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string; full_name: string | null; plan: string;
        trial_ends_at: string | null; onboarding_completed: boolean;
        created_at: string;
      }>;
    },
    staleTime: 30_000,
  });

  const { data: recentErrors } = useQuery({
    queryKey: ["admin-recent-errors"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_error_events")
        .select("id, user_id, message, route, created_at")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string; user_id: string | null; message: string;
        route: string | null; created_at: string;
      }>;
    },
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm py-8">
        <Loader2 className="w-4 h-4 animate-spin" /> Carregando dados dos pilotos…
      </div>
    );
  }

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Lojas", value: stores?.length ?? 0, icon: Store },
          { label: "Usuários", value: profiles?.length ?? 0, icon: Users },
          { label: "Onboarding OK", value: (profiles ?? []).filter((p) => p.onboarding_completed).length, icon: CheckCircle2 },
          { label: "Erros (24h)", value: (recentErrors ?? []).filter((e) => new Date(e.created_at) > new Date(Date.now() - 86400000)).length, icon: AlertCircle },
        ].map(({ label, value, icon: Icon }) => (
          <Card key={label} className="border-border/50">
            <CardContent className="pt-4 pb-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Icon className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-black">{value}</p>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Store list */}
      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Store className="w-5 h-5" /> Lojas cadastradas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground text-left">
                  <th className="py-2 pr-4 font-medium">Loja</th>
                  <th className="py-2 pr-4 font-medium">Usuário</th>
                  <th className="py-2 pr-4 font-medium">Plataforma</th>
                  <th className="py-2 pr-4 font-medium">Plano</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 font-medium">Criado em</th>
                </tr>
              </thead>
              <tbody>
                {(stores ?? []).map((s) => {
                  const p = profileMap.get(s.user_id);
                  return (
                    <tr key={s.id} className="border-b border-border/30 hover:bg-muted/20">
                      <td className="py-2.5 pr-4 font-bold">{s.name || "—"}</td>
                      <td className="py-2.5 pr-4">{p?.full_name || s.user_id.slice(0, 8)}</td>
                      <td className="py-2.5 pr-4">{s.plataforma || "—"}</td>
                      <td className="py-2.5 pr-4">
                        <Badge variant="outline" className="text-[9px]">{p?.plan ?? "starter"}</Badge>
                      </td>
                      <td className="py-2.5 pr-4">
                        {p?.onboarding_completed ? (
                          <Badge className="bg-emerald-500/10 text-emerald-500 text-[9px]">Ativo</Badge>
                        ) : (
                          <Badge variant="outline" className="text-amber-500 border-amber-500/30 text-[9px]">Onboarding</Badge>
                        )}
                      </td>
                      <td className="py-2.5 text-muted-foreground">
                        {new Date(s.created_at).toLocaleDateString("pt-BR")}
                      </td>
                    </tr>
                  );
                })}
                {(!stores || stores.length === 0) && (
                  <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">Nenhuma loja cadastrada</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Recent errors */}
      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-500" /> Erros recentes do cliente
          </CardTitle>
        </CardHeader>
        <CardContent>
          {(!recentErrors || recentErrors.length === 0) ? (
            <p className="text-sm text-muted-foreground py-4">Nenhum erro registrado recentemente 🎉</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {recentErrors.map((e) => (
                <div key={e.id} className="flex items-start gap-3 p-3 rounded-lg bg-red-500/5 border border-red-500/10 text-sm">
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-xs truncate">{e.message}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {e.route && <span className="mr-2">📍 {e.route}</span>}
                      {new Date(e.created_at).toLocaleString("pt-BR")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Validation Checklist Tab ───────────────────────────────────────────────────

function ValidationChecklist() {
  const [results, setResults] = useState<Record<string, { status: "idle" | "loading" | "ok" | "error"; ms?: number; error?: string }>>({});

  const EDGE_FUNCTIONS = [
    "gerar-diagnostico",
    "fetch-store-metrics",
    "dispatch-campaign",
    "meta-whatsapp-send",
    "send-email",
    "ai-reply-suggest",
    "calculate-rfm",
    "buscar-ga4",
  ];

  async function testFunction(name: string) {
    setResults((prev) => ({ ...prev, [name]: { status: "loading" } }));
    const start = performance.now();
    try {
      const { error } = await supabase.functions.invoke(name, {
        body: { _healthCheck: true },
      });
      const ms = Math.round(performance.now() - start);
      if (error) {
        setResults((prev) => ({ ...prev, [name]: { status: "error", ms, error: error.message } }));
      } else {
        setResults((prev) => ({ ...prev, [name]: { status: "ok", ms } }));
      }
    } catch (err) {
      const ms = Math.round(performance.now() - start);
      setResults((prev) => ({
        ...prev,
        [name]: { status: "error", ms, error: err instanceof Error ? err.message : "Unknown" },
      }));
    }
  }

  async function testAll() {
    for (const fn of EDGE_FUNCTIONS) {
      await testFunction(fn);
    }
  }

  return (
    <div className="space-y-6">
      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-500" /> Health Check — Edge Functions
          </CardTitle>
          <CardDescription>
            Chama cada Edge Function com payload mínimo para verificar se está respondendo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={testAll} className="font-bold">
            <Activity className="w-4 h-4 mr-2" /> Testar todas
          </Button>

          <div className="grid gap-2">
            {EDGE_FUNCTIONS.map((fn) => {
              const r = results[fn];
              return (
                <div key={fn} className="flex items-center justify-between p-3 rounded-lg border border-border/40 bg-muted/10">
                  <div className="flex items-center gap-3">
                    {!r || r.status === "idle" ? (
                      <div className="w-2.5 h-2.5 rounded-full bg-muted-foreground/30" />
                    ) : r.status === "loading" ? (
                      <Loader2 className="w-4 h-4 animate-spin text-primary" />
                    ) : r.status === "ok" ? (
                      <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    ) : (
                      <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                    )}
                    <code className="text-sm font-mono">{fn}</code>
                  </div>
                  <div className="flex items-center gap-3">
                    {r?.ms !== undefined && (
                      <span className="text-xs text-muted-foreground font-mono">{r.ms}ms</span>
                    )}
                    {r?.error && (
                      <span className="text-xs text-red-400 max-w-[200px] truncate" title={r.error}>{r.error}</span>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => testFunction(fn)}
                      className="text-xs h-7 px-2"
                    >
                      Testar
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-500" /> Checklist de fluxos críticos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm">
            {[
              { flow: "Signup → Profile + Store criados", check: "Verificar em profiles e stores" },
              { flow: "Onboarding → Integration saved", check: "Verificar integrations com is_active=true" },
              { flow: "WhatsApp Setup → Connection row", check: "Verificar whatsapp_connections" },
              { flow: "Campanha → Dispatch → Delivery", check: "Criar campanha de teste, verificar sent_count" },
              { flow: "Inbox → Receber inbound → Responder", check: "Enviar mensagem teste via Meta, verificar conversations" },
              { flow: "ConvertIQ → Diagnóstico IA", check: "Gerar diagnóstico, verificar diagnostics" },
            ].map(({ flow, check }) => (
              <div key={flow} className="flex items-start gap-3 p-3 rounded-lg border border-border/40 bg-muted/10">
                <div className="w-5 h-5 rounded border border-border/60 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-[10px] text-muted-foreground">☐</span>
                </div>
                <div>
                  <p className="font-bold">{flow}</p>
                  <p className="text-xs text-muted-foreground">{check}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Main Admin Page ────────────────────────────────────────────────────────────

export default function Admin() {
  const queryClient = useQueryClient();
  const { data: isAdmin, isLoading: adminLoading } = useIsAdmin();
  const { data: config, isLoading: configLoading } = useSistemaConfig();
  const [maintenanceOn, setMaintenanceOn] = useState(false);
  const [message, setMessage] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (!config) return;
    setMaintenanceOn(!!config.maintenance_active);
    setMessage(config.maintenance_message ?? "");
  }, [config]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("system_config")
        .update({
          maintenance_active: maintenanceOn,
          maintenance_message: message.trim() ? message.trim() : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", "config_geral");
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["system_config"] });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      toast.success("Configuração global atualizada.");
    },
    onError: (e: Error) => {
      const friendly =
        e.message.includes("row-level security") || e.message.includes("permission") || e.message.includes("denied")
          ? "Sem permissão para alterar esta configuração."
          : e.message.includes("duplicate") || e.message.includes("unique")
          ? "Conflito de dados — recarregue a página e tente novamente."
          : e.message.includes("network") || e.message.includes("fetch")
          ? "Erro de rede — verifique sua conexão e tente novamente."
          : "Não foi possível salvar. Tente novamente em instantes.";
      toast.error("Erro ao salvar", { description: friendly });
    },
  });

  if (!adminLoading && isAdmin === false) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8 p-6 md:p-10">
      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar alteração de manutenção</AlertDialogTitle>
            <AlertDialogDescription>
              {maintenanceOn
                ? "Ao ativar a manutenção, todos os usuários sem papel de staff serão bloqueados. Deseja continuar?"
                : "Ao desativar a manutenção, o acesso será restaurado para todos os usuários. Deseja continuar?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saveMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { setShowConfirm(false); saveMutation.mutate(); }}
              disabled={saveMutation.isPending}
              className={maintenanceOn ? "bg-destructive hover:bg-destructive/90" : ""}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
            <Shield className="w-6 h-6 text-amber-500" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-black font-syne tracking-tight">Administração da plataforma</h1>
            <p className="text-sm text-muted-foreground">
              Controle operacional interno. Visível apenas para usuários com papel <code className="text-xs bg-muted px-1 rounded">admin</code> em{" "}
              <code className="text-xs bg-muted px-1 rounded">user_roles</code>.
            </p>
          </div>
        </div>
        <Badge variant="outline" className="text-[10px] font-black tracking-widest border-amber-500/40 text-amber-600 dark:text-amber-400">
          Staff LTV Boost — não é o admin da sua loja
        </Badge>
      </div>

      <Tabs defaultValue="manutencao" className="w-full">
        <TabsList className="grid w-full max-w-4xl grid-cols-6 h-auto p-1 rounded-xl mb-6">
          <TabsTrigger value="aprovacoes" className="rounded-lg text-xs py-2.5 font-bold">
            ✅ Aprovações
          </TabsTrigger>
          <TabsTrigger value="manutencao" className="rounded-lg text-xs py-2.5 font-bold">
            ⚙️ Manutenção
          </TabsTrigger>
          <TabsTrigger value="pilotos" className="rounded-lg text-xs py-2.5 font-bold">
            👥 Pilotos
          </TabsTrigger>
          <TabsTrigger value="validacao" className="rounded-lg text-xs py-2.5 font-bold">
            ✅ Validação
          </TabsTrigger>
          <TabsTrigger value="multitenant" className="rounded-lg text-xs py-2.5 font-bold">
            🛡️ Multi-tenant
          </TabsTrigger>
          <TabsTrigger value="lojas" className="rounded-lg text-xs py-2.5 font-bold">
            🏪 Lojas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="aprovacoes" className="outline-none">
          <PendingActivations />
        </TabsContent>

        <TabsContent value="manutencao" className="space-y-6 outline-none">
          <Card className="border-border/60">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                Modo de manutenção
              </CardTitle>
              <CardDescription>
                Quando ativo, utilizadores sem papel de staff veem a página de manutenção.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {configLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" /> Carregando estado atual…
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-4 rounded-xl border border-border/50 bg-muted/20 p-4">
                    <div className="space-y-1">
                      <Label htmlFor="maintenance-toggle" className="text-base font-bold">
                        Manutenção ativa
                      </Label>
                      <p className="text-xs text-muted-foreground">Atualiza <code className="text-[10px]">config_geral</code> em <code className="text-[10px]">system_config</code>.</p>
                    </div>
                    <Switch
                      id="maintenance-toggle"
                      checked={maintenanceOn}
                      onCheckedChange={setMaintenanceOn}
                      disabled={saveMutation.isPending}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="maintenance-msg">Mensagem (opcional)</Label>
                    <Textarea
                      id="maintenance-msg"
                      placeholder="Ex.: Estamos melhorando o sistema. Voltamos em breve."
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      rows={4}
                      disabled={saveMutation.isPending}
                      className="resize-y min-h-[100px]"
                    />
                  </div>
                  <Button
                    type="button"
                    onClick={() => setShowConfirm(true)}
                    disabled={saveMutation.isPending}
                    className="font-bold"
                  >
                    {saveMutation.isPending ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Salvando…</>
                    ) : saveSuccess ? (
                      <><CheckCircle2 className="w-4 h-4 mr-2 text-emerald-400" /> Salvo com sucesso</>
                    ) : (
                      "Salvar alterações"
                    )}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/60">
            <CardHeader>
              <CardTitle className="text-lg">Operação e documentação</CardTitle>
              <CardDescription>Atalhos úteis para deploy, migrações e segredos.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <p className="text-muted-foreground">
                Consulte <code className="text-xs bg-muted px-1 rounded">CLAUDE.md</code> e <code className="text-xs bg-muted px-1 rounded">docs/</code> no repositório.
              </p>
              <a
                href="https://supabase.com/dashboard/project/ydkglitowqlpizpnnofy"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-primary font-bold hover:underline w-fit"
              >
                Supabase Dashboard <ExternalLink className="w-4 h-4" />
              </a>
            </CardContent>
          </Card>

          <Card className="border-border/60">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" /> Telemetria de diagnósticos
              </CardTitle>
              <CardDescription>
                Saúde da geração de diagnósticos: volume, fallback, parse retry e completude do payload.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link
                to="/admin/diagnostico-telemetria"
                className="inline-flex items-center gap-2 text-primary font-bold hover:underline"
              >
                Abrir dashboard <ExternalLink className="w-4 h-4" />
              </Link>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pilotos" className="outline-none">
          <PilotMonitor />
        </TabsContent>

        <TabsContent value="validacao" className="outline-none">
          <ValidationChecklist />
        </TabsContent>

        <TabsContent value="multitenant" className="outline-none">
          <MultiTenantAudit />
        </TabsContent>
      </Tabs>
    </div>
  );
}
