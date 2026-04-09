import { useMemo, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { SignIn, useUser } from "@clerk/clerk-react";
import { Button } from "@/components/ui/button";
import { markStepUpVerified } from "@/lib/security-stepup";

export default function StepUpMfa() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user: clerkUser, isLoaded } = useUser();
  const [verifying, setVerifying] = useState(false);
  const from = useMemo(() => {
    const raw = (location.state as { from?: string } | null)?.from;
    // Only allow relative internal paths to prevent open redirect attacks.
    return raw?.startsWith("/") && !raw.startsWith("//") ? raw : "/dashboard";
  }, [location.state]);

  const supabaseUserId = localStorage.getItem("ltv_stepup_user_hint");
  if (!supabaseUserId) {
    return <Navigate to="/dashboard" replace />;
  }

  async function handleConfirmStepUp() {
    setVerifying(true);
    try {
      await markStepUpVerified(supabaseUserId);
      navigate(from, { replace: true });
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold">Verificação adicional de segurança</h1>
          <p className="text-sm text-muted-foreground">
            Para acessar esta área, valide MFA via Clerk.
          </p>
        </div>

        {!isLoaded || !clerkUser ? (
          <SignIn
            routing="path"
            path="/security/step-up"
            forceRedirectUrl="/security/step-up"
            signUpUrl="/signup"
          />
        ) : (
          <div className="border rounded-xl p-4 space-y-3">
            <p className="text-sm">
              Sessão Clerk verificada para <strong>{clerkUser.primaryEmailAddress?.emailAddress}</strong>.
            </p>
            <Button className="w-full" onClick={handleConfirmStepUp} disabled={verifying}>
              {verifying ? "Confirmando..." : "Continuar para área protegida"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
