import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, MessageSquare, Sparkles, CheckCircle2, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { ECOMMERCE_PLATFORMAS } from "@/lib/ecommerce-platforms";

const schema = z.object({
  full_name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  email: z.string().email("E-mail inválido"),
  password: z.string().min(8, "Senha deve ter pelo menos 8 caracteres"),
  whatsapp: z
    .string()
    .min(10, "WhatsApp inválido")
    .regex(/^[\d\s()+-]+$/, "Use apenas números, espaços, parênteses, + ou -"),
  plataforma: z.string().min(1, "Selecione sua plataforma"),
});

type FormData = z.infer<typeof schema>;

export default function Signup() {
  const [loading, setLoading] = useState(false);
  const [searchParams] = useSearchParams();
  const perda = searchParams.get("perda");
  const refParam = searchParams.get("ref");
  const isPilot = refParam === "pilot";
  const { signUp, user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  // If already logged in, do NOT just push to /dashboard — could throw a paying
  // user back into a paywall loop or skip onboarding. Send them to /login which
  // resolves the right next step.
  useEffect(() => {
    if (!authLoading && user) {
      navigate("/login", { replace: true });
    }
  }, [user, authLoading, navigate]);

  const { register, handleSubmit, control, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  async function onSubmit(data: FormData) {
    setLoading(true);
    const { error } = await signUp(data.email, data.password, {
      full_name: data.full_name,
      plataforma: data.plataforma,
      whatsapp: data.whatsapp,
      ...(isPilot ? { pilot: true } : {}),
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
    sessionStorage.setItem("ltv_show_community", "1");
    navigate("/onboarding", { replace: true });
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

          <div className="space-y-4 pt-4">
            <div className="flex items-center gap-3 text-sm font-bold text-muted-foreground">
              <CheckCircle2 className="w-5 h-5 text-emerald-500" /> Diagnóstico gratuito e personalizado
            </div>
            <div className="flex items-center gap-3 text-sm font-bold text-muted-foreground">
              <CheckCircle2 className="w-5 h-5 text-emerald-500" /> Sem cartão de crédito
            </div>
            <div className="flex items-center gap-3 text-sm font-bold text-muted-foreground">
              <CheckCircle2 className="w-5 h-5 text-emerald-500" /> Resultado em menos de 1 minuto
            </div>
          </div>

          {/* Social proof */}
          <div className="pt-4 border-t border-border/40">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/50 mb-4">O que dizem nossos clientes</p>
            <div className="space-y-3">
              <div className="bg-white dark:bg-card/60 border border-border/40 rounded-xl p-4">
                <div className="flex gap-0.5 mb-2">
                  {Array(5).fill(0).map((_, i) => (
                    <Star key={i} className="w-3 h-3 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <p className="text-xs text-muted-foreground italic leading-relaxed">
                  "Recuperamos R$ 38k na primeira semana. Melhor investimento de marketing que já fizemos."
                </p>
                <p className="text-[10px] font-bold text-muted-foreground/60 mt-2">— Lucas M., ModaFit</p>
              </div>
              <div className="bg-white dark:bg-card/60 border border-border/40 rounded-xl p-4">
                <div className="flex gap-0.5 mb-2">
                  {Array(5).fill(0).map((_, i) => (
                    <Star key={i} className="w-3 h-3 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <p className="text-xs text-muted-foreground italic leading-relaxed">
                  "19% de recuperação de carrinho via WhatsApp. E-mail nunca passou de 3%."
                </p>
                <p className="text-[10px] font-bold text-muted-foreground/60 mt-2">— Ana P., Glowskin</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Side: Form */}
      <div className="flex-1 flex items-center justify-center p-6 bg-card md:bg-background">
        <div className="w-full max-w-sm space-y-8">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3">
              <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[9px] font-black">1</span>
              Passo 1 de 3 — Criar conta
            </div>
            <h1 className="text-3xl font-black font-syne tracking-tighter">Faça seu diagnóstico grátis</h1>
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
              <Label htmlFor="whatsapp" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">WhatsApp</Label>
              <Input
                id="whatsapp"
                type="tel"
                placeholder="(11) 98765-4321"
                className="h-12 rounded-xl bg-muted/30 border-border/50"
                {...register("whatsapp")}
              />
              {errors.whatsapp && (
                <p className="text-xs text-destructive font-bold">{errors.whatsapp.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Sua plataforma</Label>
              <Controller
                name="plataforma"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="h-12 rounded-xl bg-muted/30 border-border/50 font-medium">
                      <SelectValue placeholder="Shopify, Nuvemshop, VTEX..." />
                    </SelectTrigger>
                    <SelectContent>
                      {ECOMMERCE_PLATFORMAS.map((p) => (
                        <SelectItem key={p} value={p}>{p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.plataforma && (
                <p className="text-xs text-destructive font-bold">{errors.plataforma.message}</p>
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
              {loading ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : "Fazer diagnóstico grátis →"}
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
