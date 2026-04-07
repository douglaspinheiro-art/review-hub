import { Navigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useDemo } from "@/contexts/DemoContext";
import { toast } from "sonner";
import { useEffect } from "react";

const planLevels = {
  starter: 0,
  growth: 1,
  scale: 2,
  enterprise: 3,
};

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredPlan?: keyof typeof planLevels;
}

export default function ProtectedRoute({ children, requiredPlan }: ProtectedRouteProps) {
  const { user, profile, loading } = useAuth();
  const { isDemo } = useDemo();
  const location = useLocation();

  useEffect(() => {
    if (!loading && user && profile && requiredPlan) {
      const currentLevel = planLevels[profile.plan] || 0;
      const neededLevel = planLevels[requiredPlan];
      if (currentLevel < neededLevel) {
        toast.error(`O recurso solicitado exige o plano ${requiredPlan.toUpperCase()} ou superior.`, {
          description: "Faça o upgrade para desbloquear o potencial total da sua loja.",
        });
      }
    }
  }, [loading, user, profile, requiredPlan]);

  if (!isDemo && loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (!isDemo && !user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (requiredPlan && profile) {
    const currentLevel = planLevels[profile.plan] || 0;
    const neededLevel = planLevels[requiredPlan];
    if (currentLevel < neededLevel) {
      return <Navigate to="/planos" replace />;
    }
  }

  return <>{children}</>;
}
