import { Navigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useDemo } from "@/contexts/DemoContext";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { hasValidStepUp } from "@/lib/security-stepup";
import { logSecurityEvent } from "@/lib/security-logger";
import { supabase } from "@/lib/supabase";
import { PLAN_LEVELS, type PlanTier } from "@/lib/pricing-constants";

const PASSWORD_ROTATION_CACHE_KEY = "ltv_pw_rotation_v1";
const PASSWORD_ROTATION_CACHE_TTL_MS = 10 * 60 * 1000;

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredPlan?: PlanTier;
  requireStepUp?: boolean;
}

export default function ProtectedRoute({ children, requiredPlan, requireStepUp }: ProtectedRouteProps) {
  const { user, profile, loading } = useAuth();
  const { isDemo } = useDemo();
  const location = useLocation();
  const [stepUpOk, setStepUpOk] = useState(false);
  const [stepUpChecked, setStepUpChecked] = useState(false);
  const [passwordCheckDone, setPasswordCheckDone] = useState(false);
  const [passwordRotationDue, setPasswordRotationDue] = useState(false);

  useEffect(() => {
    if (!loading && user && profile && requiredPlan) {
      const currentLevel = profile.plan in PLAN_LEVELS ? PLAN_LEVELS[profile.plan as PlanTier] : 0;
      const neededLevel = PLAN_LEVELS[requiredPlan];
      if (currentLevel < neededLevel) {
        toast.error(`O recurso solicitado exige o plano ${requiredPlan.toUpperCase()} ou superior.`, {
          description: "Faça o upgrade para desbloquear o potencial total da sua loja.",
        });
      }
    }
  }, [loading, user, profile, requiredPlan]);

  useEffect(() => {
    let cancelled = false;
    async function checkStepUp() {
      if (!requireStepUp || !user) {
        setStepUpOk(true);
        setStepUpChecked(true);
        return;
      }
      const valid = await hasValidStepUp(user.id);
      if (!cancelled) {
        setStepUpOk(valid);
        setStepUpChecked(true);
      }
    }
    checkStepUp();
    return () => {
      cancelled = true;
    };
  }, [requireStepUp, user]);

  useEffect(() => {
    let cancelled = false;
    async function checkPasswordRotation() {
      if (!user) {
        setPasswordCheckDone(true);
        return;
      }
      const cacheKey = `${PASSWORD_ROTATION_CACHE_KEY}:${user.id}`;
      try {
        const raw = sessionStorage.getItem(cacheKey);
        if (raw) {
          const parsed = JSON.parse(raw) as { due?: boolean; at?: number };
          if (
            typeof parsed?.due === "boolean" &&
            typeof parsed?.at === "number" &&
            Date.now() - parsed.at < PASSWORD_ROTATION_CACHE_TTL_MS
          ) {
            if (!cancelled) {
              setPasswordRotationDue(parsed.due);
              setPasswordCheckDone(true);
            }
            return;
          }
        }
      } catch {
        /* ignore cache parse errors */
      }

      const { data } = await supabase.rpc("is_password_rotation_due", {
        _user_id: user.id,
      });
      const due = data === true;
      try {
        sessionStorage.setItem(cacheKey, JSON.stringify({ due, at: Date.now() }));
      } catch {
        /* ignore quota / private mode */
      }
      if (!cancelled) {
        setPasswordRotationDue(due);
        setPasswordCheckDone(true);
      }
    }
    checkPasswordRotation();
    return () => {
      cancelled = true;
    };
  }, [user]);

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

  if (!passwordCheckDone) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (passwordRotationDue && location.pathname !== "/reset-password") {
    return <Navigate to="/reset-password" replace />;
  }

  if (requireStepUp && !stepUpChecked) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (requireStepUp && !stepUpOk) {
    logSecurityEvent({
      action: "step_up_required",
      resource: location.pathname,
      result: "failure",
    });
    return <Navigate to="/security/step-up" state={{ from: location.pathname }} replace />;
  }

  if (requiredPlan) {
    // Fail-safe: if we cannot resolve profile, never allow paid features.
    if (!profile) {
      return <Navigate to="/planos" replace />;
    }
    const currentLevel = profile.plan in PLAN_LEVELS ? PLAN_LEVELS[profile.plan as PlanTier] : 0;
    const neededLevel = PLAN_LEVELS[requiredPlan];
    if (currentLevel < neededLevel) {
      return <Navigate to="/planos" replace />;
    }
  }

  return <>{children}</>;
}
