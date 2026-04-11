import { Navigate, useLocation } from "react-router-dom";
import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useDemo } from "@/contexts/DemoContext";
import { useTeamAccess, teamNavItemHidden } from "@/hooks/useTeamAccess";

/**
 * Bloqueia URLs do dashboard que o menu já esconde para colaboradores (ex.: viewer em Campanhas).
 */
export function TeamCollaboratorPageGuard({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const { isDemo } = useDemo();
  const { data: access, isLoading } = useTeamAccess();
  const showedToast = useRef(false);

  const blocked = !isDemo && teamNavItemHidden(pathname, access);

  useEffect(() => {
    if (blocked && !showedToast.current) {
      showedToast.current = true;
      toast.message("Sem permissão", {
        description: "O proprietário da conta não lhe atribuiu acesso a esta área.",
      });
    }
  }, [blocked]);

  if (isDemo) return <>{children}</>;

  if (isLoading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="w-7 h-7 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (blocked) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
