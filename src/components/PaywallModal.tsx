import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface PaywallModalProps {
  /** Path to navigate to after the user dismisses or auto-redirect timer expires. */
  redirectTo: string;
  /** Auto-redirect delay in ms. Default 2500. */
  autoRedirectMs?: number;
}

/**
 * Shown by ProtectedRoute when a user with diagnostic-only access tries to
 * reach a paid surface. Explains the paywall instead of dumping them on /planos.
 */
export default function PaywallModal({ redirectTo, autoRedirectMs = 2500 }: PaywallModalProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => navigate(redirectTo, { replace: true }), autoRedirectMs);
    return () => clearTimeout(t);
  }, [navigate, redirectTo, autoRedirectMs]);

  return (
    <div className="min-h-screen bg-background">
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) navigate(redirectTo, { replace: true }); }}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-2">
              <Lock className="w-6 h-6 text-primary" />
            </div>
            <DialogTitle className="text-center font-black text-xl">
              Seu diagnóstico está pronto 🎉
            </DialogTitle>
            <DialogDescription className="text-center">
              Para acessar o dashboard e ativar campanhas, escolha um plano.
              Sem teste grátis no produto completo — ative e comece já.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 mt-2">
            <Button
              className="font-black rounded-xl gap-2"
              onClick={() => navigate(redirectTo, { replace: true })}
            >
              Ver planos <ArrowRight className="w-4 h-4" />
            </Button>
            <p className="text-center text-[10px] text-muted-foreground">
              Redirecionamento automático em instantes…
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
