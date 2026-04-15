import { useEffect, useRef } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { isDashboardPathBlockedInBetaScope } from "@/lib/beta-scope";

export function BetaLimitedPageGuard({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const showedToast = useRef(false);

  const blocked = isDashboardPathBlockedInBetaScope(pathname);

  useEffect(() => {
    if (blocked && !showedToast.current) {
      showedToast.current = true;
      toast.message("Indisponível nesta fase do beta", {
        description: "Recursos de envio por canais serão liberados em breve.",
      });
    }
  }, [blocked]);

  if (blocked) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
