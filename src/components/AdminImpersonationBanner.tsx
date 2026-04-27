import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Shield, LogOut, Eye, Pencil, Loader2 } from "lucide-react";
import { useStoreScope } from "@/contexts/StoreScopeContext";
import { useIsAdmin } from "@/hooks/useAdminCheck";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

function formatRemaining(expiresAtIso: string): string {
  const ms = new Date(expiresAtIso).getTime() - Date.now();
  if (ms <= 0) return "expirada";
  const min = Math.floor(ms / 60_000);
  if (min >= 60) return `${Math.floor(min / 60)}h ${min % 60}min`;
  return `${min}min`;
}

export function AdminImpersonationBanner() {
  const { adminImpersonating, adminExitStore, adminSetWriteMode } = useStoreScope();
  const { data: isAdmin } = useIsAdmin();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!adminImpersonating) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 30_000);
    return () => window.clearInterval(id);
  }, [adminImpersonating]);

  if (!adminImpersonating || !isAdmin) return null;

  const writeOn = adminImpersonating.writeEnabled;

  const handleExit = async () => {
    setBusy(true);
    try {
      await adminExitStore();
      toast.success("Sessão de admin encerrada");
      navigate("/admin");
    } catch (e) {
      toast.error("Falha ao sair", { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const handleToggleWrite = async (next: boolean) => {
    setBusy(true);
    try {
      await adminSetWriteMode(next);
      toast.success(next ? "Modo edição ATIVADO" : "Voltou para modo visualização");
    } catch (e) {
      toast.error("Falha ao alterar modo", { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={cn(
        "mb-4 rounded-xl border-2 px-4 py-3 flex flex-wrap items-center gap-3",
        writeOn
          ? "border-red-500 bg-red-500/10 text-red-100"
          : "border-amber-500 bg-amber-500/10 text-amber-100",
      )}
      role="alert"
    >
      <Shield className={cn("w-5 h-5 shrink-0", writeOn ? "text-red-400" : "text-amber-400")} />
      <div className="flex flex-col text-sm leading-tight">
        <span className="font-bold">
          Modo admin · Loja: <span className="text-white">{adminImpersonating.storeName}</span>
        </span>
        <span className="text-xs opacity-80">
          Expira em {formatRemaining(adminImpersonating.expiresAt)} · Toda ação é registrada em audit_logs
        </span>
      </div>

      <div className="flex items-center gap-2 ml-auto">
        {writeOn ? (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void handleToggleWrite(false)}
            className="border-red-500/60 hover:bg-red-500/20 text-red-100 gap-1.5"
          >
            <Eye className="w-4 h-4" /> Voltar para visualização
          </Button>
        ) : (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                className="border-amber-500/60 hover:bg-amber-500/20 text-amber-100 gap-1.5"
              >
                <Pencil className="w-4 h-4" /> Ativar modo edição
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Ativar modo edição?</AlertDialogTitle>
                <AlertDialogDescription>
                  Suas ações afetarão dados reais da loja <strong>{adminImpersonating.storeName}</strong>.
                  Cada ação fica registrada em audit_logs com seu user_id de admin.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={() => void handleToggleWrite(true)}>
                  Ativar edição
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}

        <Button
          size="sm"
          variant="ghost"
          onClick={() => void handleExit()}
          disabled={busy}
          className="hover:bg-white/10 gap-1.5"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
          Sair
        </Button>
      </div>
    </div>
  );
}

export default AdminImpersonationBanner;