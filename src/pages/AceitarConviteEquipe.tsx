import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";

export default function AceitarConviteEquipe() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const { user, loading } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const returnPath = token ? `/aceitar-convite?token=${encodeURIComponent(token)}` : "/aceitar-convite";

  async function accept() {
    if (!token || !user) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("team-accept-invite", {
        body: { token },
      });
      if (error) throw new Error(error.message);
      const body = data as { ok?: boolean; error?: string };
      if (!body?.ok) throw new Error(body?.error ?? "Não foi possível aceitar o convite.");
      toast({ title: "Convite aceite", description: "Aceda ao dashboard da equipa." });
      navigate("/dashboard", { replace: true });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erro ao aceitar.";
      toast({ title: "Erro", description: msg, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-4">
          <p className="text-muted-foreground text-sm">Link de convite inválido (sem token).</p>
          <Button asChild variant="outline">
            <Link to="/login">Ir para o login</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-6 text-center">
          <Link to="/" className="inline-flex items-center gap-2 text-primary font-bold text-xl justify-center">
            <MessageSquare className="w-6 h-6" />
            LTV Boost
          </Link>
          <p className="text-sm text-muted-foreground">
            Inicie sessão com o mesmo e-mail para o qual o convite foi enviado. Depois voltará aqui para aceitar.
          </p>
          <Button asChild className="w-full">
            <Link to="/login" state={{ from: returnPath }}>
              Entrar
            </Link>
          </Button>
          <Button asChild variant="outline" className="w-full">
            <Link to="/signup">Criar conta</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6 text-center">
        <Link to="/" className="inline-flex items-center gap-2 text-primary font-bold text-xl justify-center">
          <MessageSquare className="w-6 h-6" />
          LTV Boost
        </Link>
        <h1 className="text-xl font-bold">Convite para equipa</h1>
        <p className="text-sm text-muted-foreground">
          Sessão: <span className="font-mono text-foreground">{user.email}</span>
        </p>
        <Button className="w-full gap-2" onClick={() => void accept()} disabled={busy}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Aceitar convite
        </Button>
        <Button asChild variant="ghost" className="w-full">
          <Link to="/dashboard">Ir para o dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
