import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, MessageCircle, Megaphone, Users,
  Settings, LogOut, Menu, X, Zap, HelpCircle, Wifi,
  PieChart, FileBarChart, RefreshCcw, Sparkles, CreditCard,
  Clock, ArrowRight, Smartphone, ShoppingCart, BarChart3, TrendingUp,
  Bot, Gift, Star, Mail, Target,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { useDemo } from "@/contexts/DemoContext";
import NotificationBell from "@/components/dashboard/NotificationBell";

const nav = [
  {
    section: "INÍCIO",
    items: [
      { label: "Diagnóstico",   icon: Sparkles,       href: "/diagnostico",            highlight: true },
      { label: "Radar de Lucro", icon: LayoutDashboard, href: "/dashboard" },
      { label: "Prescrições",    icon: Zap,             href: "/dashboard/prescricoes", dot: true },
    ],
  },
  {
    section: "ANÁLISE",
    items: [
      { label: "Funil",          icon: PieChart,        href: "/dashboard/funil" },
      { label: "Clientes",       icon: Users,           href: "/dashboard/contatos" },
      { label: "RFM",            icon: BarChart3,       href: "/dashboard/rfm" },
      { label: "Forecast",       icon: TrendingUp,      href: "/dashboard/forecast" },
      { label: "Reviews",        icon: Star,            href: "/dashboard/reviews" },
      { label: "Atribuição",     icon: Target,          href: "/dashboard/atribuicao" },
      { label: "Relatórios",     icon: FileBarChart,    href: "/dashboard/relatorios" },
    ],
  },
  {
    section: "MARKETING",
    items: [
      { label: "Agente IA",      icon: Bot,             href: "/dashboard/agente-ia" },
      { label: "Campanhas",      icon: Megaphone,       href: "/dashboard/campanhas" },
      { label: "Newsletter",     icon: Mail,            href: "/dashboard/newsletter" },
      { label: "Automações",     icon: RefreshCcw,      href: "/dashboard/automacoes" },
      { label: "Fidelidade",     icon: Gift,            href: "/dashboard/fidelidade" },
      { label: "Carrinho",       icon: ShoppingCart,    href: "/dashboard/carrinho-abandonado" },
      { label: "Inbox",          icon: MessageCircle,   href: "/dashboard/inbox" },
    ],
  },
  {
    section: "CONTA",
    items: [
      { label: "Planos",         icon: CreditCard,      href: "/planos" },
      { label: "WhatsApp",       icon: Smartphone,      href: "/dashboard/whatsapp" },
      { label: "Configurações",  icon: Settings,        href: "/dashboard/configuracoes" },
      { label: "Integrações",    icon: Wifi,            href: "/dashboard/integracoes" },
    ],
  },
];

const planLabels: Record<string, string> = {
  starter:    "Starter",
  growth:     "Growth",
  scale:      "Scale",
  enterprise: "Enterprise",
};

const planColors: Record<string, string> = {
  starter:    "bg-muted text-muted-foreground",
  growth:     "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  scale:      "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
  enterprise: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
};

function isActive(href: string, pathname: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname.startsWith(href);
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const { signOut, user, profile, isTrialActive } = useAuth();

  const trialDaysLeft = profile?.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(profile.trial_ends_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;
  const { isDemo, demoProfile } = useDemo();
  const navigate = useNavigate();

  const activeProfile = isDemo ? demoProfile : profile;

  // In demo mode, rewrite /dashboard/* → /demo/* for navigation
  const demoNav = isDemo
    ? nav.map(section => ({
        ...section,
        items: section.items.map(item => ({
          ...item,
          href: item.href.startsWith("/dashboard")
            ? item.href.replace("/dashboard", "/demo")
            : item.href,
        })),
      }))
    : nav;

  async function handleSignOut() {
    if (isDemo) { navigate("/", { replace: true }); return; }
    await signOut();
    navigate("/login", { replace: true });
  }

  const displayName = activeProfile?.full_name || user?.email?.split("@")[0] || "Usuário";
  const plan = activeProfile?.plan ?? "starter";
  const initials = displayName.slice(0, 2).toUpperCase();

  const Sidebar = ({ mobile = false }: { mobile?: boolean }) => (
    <aside
      className={cn(
        "flex flex-col h-full bg-card/50 backdrop-blur-xl border-r w-64",
        mobile && "w-full"
      )}
    >
      {/* Logo */}
      <div className="h-20 flex items-center gap-3 px-6 border-b border-border/10 shrink-0">
        <div className="w-10 h-10 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
          <Zap className="h-6 w-6 text-primary-foreground fill-primary-foreground" />
        </div>
        <div className="flex flex-col">
          <span className="font-black text-lg tracking-tighter leading-none">LTV BOOST</span>
          <span className="text-[10px] font-bold text-primary tracking-[0.2em] uppercase mt-1">Intelligence</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-6 px-4 space-y-6">
        {demoNav.map(({ section, items }) => (
          <div key={section}>
            <p className="px-4 mb-3 text-[9px] font-black uppercase tracking-[0.3em] text-muted-foreground/40">
              {section}
            </p>
            <div className="space-y-1">
              {items.map((item: any) => (
                <Link
                  key={item.href}
                  to={item.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex items-center justify-between px-4 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 group",
                    isActive(item.href, pathname)
                      ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                      : "text-muted-foreground hover:bg-primary/5 hover:text-primary"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <item.icon className={cn("w-4 h-4 shrink-0 transition-transform group-hover:scale-110", isActive(item.href, pathname) ? "" : "opacity-70")} />
                    {item.label}
                  </div>
                  {item.dot && !isActive(item.href, pathname) && (
                    <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                  )}
                  {item.highlight && !isActive(item.href, pathname) && (
                    <span className="text-[8px] font-black bg-primary/10 text-primary px-1.5 py-0.5 rounded border border-primary/20">
                      NOVO
                    </span>
                  )}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Upgrade CTA — trial users */}
      {(isTrialActive || plan === "starter") && activeProfile && !isDemo && (
        <div className="px-4 pb-2">
          <div className={cn(
            "p-4 rounded-2xl border space-y-2.5",
            isTrialActive
              ? "bg-amber-500/5 border-amber-500/20"
              : "bg-primary/5 border-primary/20"
          )}>
            {isTrialActive && trialDaysLeft > 0 ? (
              <div className="flex items-center gap-1.5">
                <Clock className="w-3 h-3 text-amber-500 shrink-0" />
                <p className="text-[10px] font-black uppercase tracking-widest text-amber-500">
                  {trialDaysLeft} {trialDaysLeft === 1 ? "dia" : "dias"} restantes
                </p>
              </div>
            ) : (
              <p className="text-[10px] font-black uppercase tracking-widest text-primary">Plano Starter</p>
            )}
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Ative agora para liberar campanhas, automações e o Agente IA.
            </p>
            <Button
              size="sm"
              className={cn(
                "w-full h-8 text-[10px] font-black rounded-xl gap-1",
                isTrialActive && "bg-amber-500 hover:bg-amber-400 text-black"
              )}
              onClick={() => navigate('/upgrade')}
            >
              Ativar plano <ArrowRight className="w-3 h-3" />
            </Button>
          </div>
        </div>
      )}

      {/* User profile */}
      <div className="px-4 pb-6 pt-4 border-t border-border/10">
        <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-muted/30 border border-border/10">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20">
            <span className="text-xs font-black text-primary font-mono">{initials}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black truncate tracking-tight">{displayName}</p>
            <span className={cn("text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-widest", planColors[plan])}>
              {planLabels[plan]}
            </span>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          className="mt-2 w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-bold text-muted-foreground/60 hover:bg-red-500/5 hover:text-red-500 transition-all duration-300"
        >
          <LogOut className="w-3.5 h-3.5 shrink-0" />
          Encerrar Sessão
        </button>
      </div>
    </aside>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar desktop */}
      <div className="hidden md:flex shrink-0">
        <Sidebar />
      </div>

      {/* Mobile overlay */}
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-64 z-50">
            <Sidebar mobile />
          </div>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar mobile */}
        <div className="md:hidden h-14 flex items-center gap-3 px-4 border-b bg-card shrink-0 sticky top-0 z-30">
          <Button variant="ghost" size="icon" onClick={() => setOpen(true)}>
            {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </Button>
          <div className="flex-1 flex items-center gap-2">
            <span className="font-black text-xs uppercase tracking-tighter italic">LTV Boost</span>
            <Badge className="bg-emerald-500/10 text-emerald-600 border-none text-[9px] font-black">
              R$ 47.3k rec.
            </Badge>
          </div>
          <NotificationBell />
        </div>

        {/* Trial countdown bar */}
        {isTrialActive && !isDemo && (
          <div className={cn(
            "shrink-0 px-6 py-2 flex items-center justify-between gap-4 border-b text-xs font-bold",
            trialDaysLeft <= 2
              ? "bg-red-500/10 border-red-500/20 text-red-600"
              : trialDaysLeft <= 5
              ? "bg-amber-500/10 border-amber-500/20 text-amber-600"
              : "bg-primary/5 border-primary/10 text-primary"
          )}>
            <div className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 shrink-0" />
              <span>
                Acesso demonstração —{" "}
                <span className="font-black">{trialDaysLeft} {trialDaysLeft === 1 ? "dia restante" : "dias restantes"}</span>.
                {" "}Execute ações ilimitadas ao ativar um plano.
              </span>
            </div>
            <button
              onClick={() => navigate("/upgrade")}
              className="shrink-0 underline font-black hover:no-underline"
            >
              Ativar agora →
            </button>
          </div>
        )}

        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
