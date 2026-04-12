import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Shield, ExternalLink, AlertTriangle, Loader2, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/lib/supabase";
import { useSistemaConfig } from "@/hooks/useSistemaConfig";
import { useIsAdmin } from "@/hooks/useAdminCheck";
import { toast } from "sonner";

export default function Admin() {
  const queryClient = useQueryClient();
  const { data: isAdmin, isLoading: adminLoading } = useIsAdmin();
  const { data: config, isLoading: configLoading } = useSistemaConfig();
  const [maintenanceOn, setMaintenanceOn] = useState(false);
  const [message, setMessage] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // All hooks must be declared before any conditional return (rules-of-hooks)
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

  // Defense-in-depth: verify admin at component level in addition to route guard.
  // Placed after all hook declarations to comply with rules-of-hooks.
  if (!adminLoading && isAdmin === false) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8 p-6 md:p-10">
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

      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            Modo de manutenção
          </CardTitle>
          <CardDescription>
            Quando ativo, utilizadores sem papel de staff veem a página de manutenção. A equipa da plataforma continua a aceder à app normalmente.
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
                  <p className="text-xs text-muted-foreground">Atualiza a linha <code className="text-[10px]">config_geral</code> em <code className="text-[10px]">system_config</code>.</p>
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
            Consulte <code className="text-xs bg-muted px-1 rounded">CLAUDE.md</code> e <code className="text-xs bg-muted px-1 rounded">docs/</code> no repositório para comandos de migração, edge functions e checklist de produção.
          </p>
          <a
            href="https://supabase.com/dashboard"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-primary font-bold hover:underline w-fit"
          >
            Supabase Dashboard <ExternalLink className="w-4 h-4" />
          </a>
        </CardContent>
      </Card>
    </div>
  );
}
