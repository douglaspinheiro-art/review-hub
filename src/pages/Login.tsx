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
import { getPostLoginRoute } from "@/lib/post-login-route";

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
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);
  const [recoverySent, setRecoverySent] = useState(false);
  const { signIn, user, profile, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const rawFrom = (location.state as { from?: string } | null)?.from;
  const from = rawFrom?.startsWith("/") && !rawFrom.startsWith("//") ? rawFrom : null;

  // Resolve "next step" centrally so we don't drop a paying user back into onboarding
  // and don't dump a diagnostic-only user into /dashboard.
  async function resolveAndNavigate(userId: string) {
    const next = from ?? (await getPostLoginRoute(userId, profile));
    navigate(next, { replace: true });
  }

  useEffect(() => {
    if (!authLoading && user) {
      void resolveAndNavigate(user.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading, profile?.subscription_status, profile?.onboarding_completed]);

  const { register, handleSubmit, formState: { errors } } = useForm<LoginData>({
    resolver: zodResolver(loginSchema),
  });

  const { register: registerRecovery, handleSubmit: handleRecovery, formState: { errors: recoveryErrors } } = useForm<RecoveryData>({
    resolver: zodResolver(recoverySchema),
  });

  async function onSubmit(data: LoginData) {
    setLoading(true);
    const { error, data: signInData } = await signIn(data.email, data.password);
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
    if (signInData?.user?.id) {
      await resolveAndNavigate(signInData.user.id);
    }
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

  async function handleGoogleSignIn() {
    setGoogleLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/login` },
    });
    if (error) {
      setGoogleLoading(false);
      toast({ title: "Erro com Google", description: error.message, variant: "destructive" });
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-4 text-center">
          <h1 className="text-2xl font-bold">Entrar na sua conta</h1>
          <div className="inline-flex items-center gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Carregando autenticação...</span>
          </div>
        </div>
      </div>
    );
  }

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
            <Button
              type="button"
              variant="outline"
              className="w-full gap-2"
              onClick={handleGoogleSignIn}
              disabled={googleLoading}
            >
              {googleLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                <svg className="w-4 h-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.99 10.99 0 0 0 1 12c0 1.78.43 3.46 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              )}
              Continuar com Google
            </Button>
            <div className="relative">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border/50" /></div>
              <div className="relative flex justify-center text-[10px] uppercase tracking-widest"><span className="bg-background px-2 text-muted-foreground">ou</span></div>
            </div>
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
