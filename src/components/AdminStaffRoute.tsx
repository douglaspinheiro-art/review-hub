import { useEffect, useRef } from "react";
import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import ProtectedRoute from "@/components/ProtectedRoute";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { RouteErrorBoundary } from "@/components/ErrorBoundary";
import { useIsAdmin } from "@/hooks/useAdminCheck";
import { toast } from "sonner";

/**
 * Área exclusiva de staff da plataforma (`user_roles` + RPC `has_role(..., 'admin')`).
 * Não confundir com administrador da loja (`profiles.role`).
 */
export default function AdminStaffRoute({
  children,
  routeLabel,
}: {
  children: React.ReactNode;
  routeLabel?: string;
}) {
  const { data: isAdmin, isLoading } = useIsAdmin();
  const toastShown = useRef(false);

  useEffect(() => {
    if (isLoading || isAdmin !== false || toastShown.current) return;
    toastShown.current = true;
    toast.error("Acesso restrito", {
      description: "Esta área é exclusiva da equipa da plataforma.",
    });
  }, [isLoading, isAdmin]);

  return (
    <ProtectedRoute>
      {isLoading ? (
        <div className="flex items-center justify-center min-h-screen bg-background">
          <Loader2 className="w-8 h-8 text-primary animate-spin" aria-label="A carregar" />
        </div>
      ) : isAdmin ? (
        <DashboardLayout>
          <RouteErrorBoundary routeLabel={routeLabel}>{children}</RouteErrorBoundary>
        </DashboardLayout>
      ) : (
        <Navigate to="/dashboard" replace />
      )}
    </ProtectedRoute>
  );
}
