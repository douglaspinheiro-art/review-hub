import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, MessageSquare, TrendingDown, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

const schema = z.object({
  full_name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  company_name: z.string().min(2, "Nome da empresa obrigatório"),
  email: z.string().email("E-mail inválido"),
  password: z.string().min(8, "Senha deve ter pelo menos 8 caracteres"),
});

type FormData = z.infer<typeof schema>;

export default function Signup() {
  const [loading, setLoading] = useState(false);
  const [searchParams] = useSearchParams();
  const perda = searchParams.get("perda");
  const { signUp, user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  // Fix 4: redirect already-authenticated users
  useEffect(() => {
    if (!authLoading && user) {
      navigate("/dashboard", { replace: true });
    }
  }, [user, authLoading, navigate]);

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  async function onSubmit(data: FormData) {
    setLoading(true);
    const { error } = await signUp(data.email, data.password, {
      full_name: data.full_name,
      company_name: data.company_name,
    });
    setLoading(false);
    if (error) {
      toast({
        title: "Erro ao criar conta",
        description: error.message,
        variant: "destructive",
      });
      return;
    }
    navigate(`/onboarding${perda ? `?perda=${perda}` : ""}`, { replace: true });
  }

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      {/* Left Side: Context & Loss */}
      <div className="hidden md:flex md:w-[40%] bg-primary/5 border-r items-center justify-center p-12">
        <div className="max-w-sm space-y-8">
          <div className="inline-flex items-center gap-2 text-primary font-black text-2xl tracking-tighter">
            <MessageSquare className="w-8 h-8 fill-primary" />
            LTV Boost
          </div>
          
          {perda ? (
            <div className="space-y-6">
              <div className="space-y-2">
                <h2 className="text-3xl font-black font-syne leading-tight tracking-tight">
                  Vamos recuperar seus <br />
                  <span className="text-red-500 italic">R$ {Number(perda).toLocaleString('pt-BR')}</span>/mês.
                </h2>
                <p className="text-muted-foreground font-medium">
                  Seu diagnóstico personalizado está pronto. Só precisamos de alguns dados para criar seu painel.
                </p>
              </div>
              <div className="bg-white dark:bg-card border rounded-2xl p-6 shadow-sm space-y-4">
                <div className="flex items-center gap-3 text-emerald-500 font-bold text-sm">
                  <Sparkles className="w-5 h-5 fill-emerald-500" />
                  Potencial identificado
                </div>
                <div className="space-y-2">
                  <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 w-[70%] animate-pulse" />
                  </div>
                  <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest text-center">IA analisando benchmarks...</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <h2 className="text-3xl font-black font-syne leading-tight tracking-tight">
                Aumente o lucro da sua loja com <span className="text-primary italic">IA.</span>
              </h2>
              <p className="text-muted-foreground font-medium">
                Monitore, prescreva e execute ações de recuperação em todos os seus canais de venda.
              </p>
            </div>
          )}

          <div className="space-y-4 pt-8">
            <div className="flex items-center gap-3 text-sm font-bold text-muted-foreground">
              <CheckCircle2 className="w-5 h-5 text-emerald-500" /> 14 dias de teste grátis
            </div>
            <div className="flex items-center gap-3 text-sm font-bold text-muted-foreground">
              <CheckCircle2 className="w-5 h-5 text-emerald-500" /> Sem cartão de crédito
            </div>
            <div className="flex items-center gap-3 text-sm font-bold text-muted-foreground">
              <CheckCircle2 className="w-5 h-5 text-emerald-500" /> Conecta com Nuvemshop, ML e mais
            </div>
          </div>
        </div>
      </div>

      {/* Right Side: Form */}
      <div className="flex-1 flex items-center justify-center p-6 bg-card md:bg-background">
        <div className="w-full max-w-sm space-y-8">
          <div className="space-y-2">
            <h1 className="text-3xl font-black font-syne tracking-tighter">Criar sua conta</h1>
            <p className="text-muted-foreground text-sm font-medium">
              Já tem conta?{" "}
              <Link to="/login" className="text-primary hover:underline font-bold">
                Entrar agora
              </Link>
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="full_name" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Seu nome</Label>
              <Input
                id="full_name"
                placeholder="João Silva"
                className="h-12 rounded-xl bg-muted/30 border-border/50"
                {...register("full_name")}
              />
              {errors.full_name && (
                <p className="text-xs text-destructive font-bold">{errors.full_name.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="company_name" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Nome da sua loja</Label>
              <Input
                id="company_name"
                placeholder="Minha Loja Online"
                className="h-12 rounded-xl bg-muted/30 border-border/50"
                {...register("company_name")}
              />
              {errors.company_name && (
                <p className="text-xs text-destructive font-bold">{errors.company_name.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">E-mail de acesso</Label>
              <Input
                id="email"
                type="email"
                placeholder="voce@empresa.com"
                className="h-12 rounded-xl bg-muted/30 border-border/50"
                {...register("email")}
              />
              {errors.email && (
                <p className="text-xs text-destructive font-bold">{errors.email.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" title="Mínimo 8 caracteres" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Senha</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                className="h-12 rounded-xl bg-muted/30 border-border/50"
                {...register("password")}
              />
              {errors.password && (
                <p className="text-xs text-destructive font-bold">{errors.password.message}</p>
              )}
            </div>

            <Button type="submit" className="w-full h-14 text-lg font-black bg-primary text-primary-foreground rounded-xl shadow-lg shadow-primary/20 hover:scale-[1.02] transition-all" disabled={loading}>
              {loading ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : "Começar Recuperação Grátis"}
            </Button>
          </form>

          <p className="text-center text-[10px] text-muted-foreground font-medium px-6">
            Ao criar sua conta, você concorda com nossos{" "}
            <Link to="/termos" className="hover:underline text-foreground font-bold">Termos</Link>
            {" "}e{" "}
            <Link to="/privacidade" className="hover:underline text-foreground font-bold">Privacidade</Link>.
          </p>
        </div>
      </div>
    </div>
  );
}
