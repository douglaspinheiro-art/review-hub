import { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, MessageSquare, ArrowLeft, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";

const loginSchema = z.object({
  email: z.string().email("E-mail inválido"),
  password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
});

const recoverySchema = z.object({
  email: z.string().email("E-mail inválido"),
});

type LoginData = z.infer<typeof loginSchema>;
type RecoveryData = z.infer<typeof recoverySchema>;

export default function Login() {
  const [loading, setLoading] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);
  const [recoverySent, setRecoverySent] = useState(false);
  const { signIn, user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string })?.from ?? "/dashboard";

  // Fix 4: redirect already-authenticated users
  useEffect(() => {
    if (!authLoading && user) {
      navigate("/dashboard", { replace: true });
    }
  }, [user, authLoading, navigate]);

  const { register, handleSubmit, formState: { errors } } = useForm<LoginData>({
    resolver: zodResolver(loginSchema),
  });

  const { register: registerRecovery, handleSubmit: handleRecovery, formState: { errors: recoveryErrors } } = useForm<RecoveryData>({
    resolver: zodResolver(recoverySchema),
  });

  async function onSubmit(data: LoginData) {
    setLoading(true);
    const { error } = await signIn(data.email, data.password);
    setLoading(false);
    if (error) {
      toast({
        title: "Erro ao entrar",
        description: error.message === "Invalid login credentials"
          ? "E-mail ou senha incorretos."
          : error.message,
        variant: "destructive",
      });
      return;
    }
    navigate(from, { replace: true });
  }

  // Fix 2: password recovery via Supabase
  async function onRecovery(data: RecoveryData) {
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(data.email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) {
      toast({ title: "Erro ao enviar e-mail", description: error.message, variant: "destructive" });
      return;
    }
    setRecoverySent(true);
  }

  if (authLoading) return null;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <Link to="/" className="inline-flex items-center gap-2 text-primary font-bold text-xl">
            <MessageSquare className="w-6 h-6" />
            LTV Boost
          </Link>

          {showRecovery ? (
            <>
              <h1 className="text-2xl font-bold">Recuperar senha</h1>
              <p className="text-muted-foreground text-sm">
                Informe seu e-mail e enviaremos um link para redefinir sua senha.
              </p>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold">Entrar na sua conta</h1>
              <p className="text-muted-foreground text-sm">
                Não tem conta?{" "}
                <Link to="/signup" className="text-primary hover:underline font-medium">
                  Criar grátis
                </Link>
              </p>
            </>
          )}
        </div>

        {/* Recovery sent confirmation */}
        {recoverySent ? (
          <div className="bg-green-50 border border-green-200 rounded-xl p-5 text-center space-y-3">
            <Mail className="w-8 h-8 text-green-600 mx-auto" />
            <div>
              <p className="font-semibold text-green-800">E-mail enviado!</p>
              <p className="text-sm text-green-700 mt-1">
                Verifique sua caixa de entrada e clique no link para redefinir sua senha.
              </p>
            </div>
            <button
              onClick={() => { setShowRecovery(false); setRecoverySent(false); }}
              className="text-sm text-primary hover:underline flex items-center gap-1 mx-auto"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Voltar para o login
            </button>
          </div>
        ) : showRecovery ? (
          /* Recovery form */
          <form onSubmit={handleRecovery(onRecovery)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="recovery-email">E-mail</Label>
              <Input
                id="recovery-email"
                type="email"
                placeholder="voce@empresa.com"
                autoComplete="email"
                autoFocus
                {...registerRecovery("email")}
              />
              {recoveryErrors.email && (
                <p className="text-xs text-destructive">{recoveryErrors.email.message}</p>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Enviar link de recuperação
            </Button>
            <button
              type="button"
              onClick={() => setShowRecovery(false)}
              className="w-full text-sm text-muted-foreground hover:text-foreground flex items-center justify-center gap-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Voltar para o login
            </button>
          </form>
        ) : (
          /* Login form */
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                placeholder="voce@empresa.com"
                autoComplete="email"
                {...register("email")}
              />
              {errors.email && (
                <p className="text-xs text-destructive">{errors.email.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Senha</Label>
                <button
                  type="button"
                  onClick={() => setShowRecovery(true)}
                  className="text-xs text-primary hover:underline"
                >
                  Esqueceu a senha?
                </button>
              </div>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                autoComplete="current-password"
                {...register("password")}
              />
              {errors.password && (
                <p className="text-xs text-destructive">{errors.password.message}</p>
              )}
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Entrar
            </Button>
          </form>
        )}

        <p className="text-center text-xs text-muted-foreground">
          Ao entrar, você concorda com nossos{" "}
          <Link to="/termos" className="hover:underline">Termos</Link>
          {" "}e{" "}
          <Link to="/privacidade" className="hover:underline">Privacidade</Link>.
        </p>
      </div>
    </div>
  );
}
