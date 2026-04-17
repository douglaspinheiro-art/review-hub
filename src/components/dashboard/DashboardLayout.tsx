import { useState, useEffect, useMemo, type ComponentType } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, MessageCircle, Megaphone, Users,
  Settings, LogOut, Menu, X, Zap, HelpCircle, Wifi,
  PieChart, FileBarChart, RefreshCcw, Sparkles, CreditCard,
  Clock, ArrowRight, Smartphone, ShoppingCart, BarChart3, TrendingUp,
  Bot, Gift, Star, Mail, Target, Lock, Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { useTeamAccess, teamNavItemHidden } from "@/hooks/useTeamAccess";

import NotificationBell from "@/components/dashboard/NotificationBell";
import { TeamCollaboratorPageGuard } from "@/components/TeamCollaboratorPageGuard";
import {
  BETA_LIMITED_BANNER_PT,
  isBetaLimitedScope,
  shouldHideNavItemHref,
} from "@/lib/beta-scope";
import { useIsAdmin } from "@/hooks/useAdminCheck";
import { StoreScopeProvider } from "@/contexts/StoreScopeContext";
import { StoreSwitcher } from "@/components/dashboard/StoreSwitcher";
import ErrorBoundary from "@/components/ErrorBoundary";

const planLevels = { starter: 0, growth: 1, scale: 2, enterprise: 3 } as const;
type MinPlan = keyof typeof planLevels;

type NavItem = {
  label: string;
  icon: ComponentType<{ className?: string }>;
  href: string;
  dot?: boolean;
  highlight?: boolean;
  /** Plano mínimo para acessar sem upgrade (alinha a rotas `requiredPlan`). */
  minPlan?: MinPlan;
  /** Só para staff da plataforma (`has_role` admin em `user_roles`). */
  platformStaffOnly?: boolean;
};

function planLevel(plan: string | undefined): number {
  if (!plan) return 0;
  return planLevels[plan as MinPlan] ?? 0;
}

function hasPlanAccess(userPlan: string | undefined, minPlan: MinPlan | undefined): boolean {
  if (!minPlan) return true;
  return planLevel(userPlan) >= planLevels[minPlan];
}



const nav: { section: string; items: NavItem[] }[] = [
  {
    section: "INÍCIO",
    items: [
      { label: "Simulador de receita", icon: Sparkles, href: "/dashboard/diagnostico", highlight: true },
      { label: "Radar de Lucro", icon: LayoutDashboard, href: "/dashboard" },
      { label: "Prescrições",    icon: Zap,             href: "/dashboard/prescricoes", dot: true },
    ],
  },
  {
    section: "OPERAÇÃO DIÁRIA",
    items: [
      { label: "Funil",          icon: PieChart,        href: "/dashboard/funil" },
      { label: "Clientes",       icon: Users,           href: "/dashboard/contatos" },
      { label: "Inbox",          icon: MessageCircle,   href: "/dashboard/inbox" },
      { label: "Campanhas",      icon: Megaphone,       href: "/dashboard/campanhas" },
      { label: "Em Execução",    icon: RefreshCcw,      href: "/dashboard/em-execucao" },
      { label: "Relatórios",     icon: FileBarChart,    href: "/dashboard/relatorios" },
      { label: "Analytics",      icon: FileBarChart,    href: "/dashboard/analytics" },
      { label: "Benchmark",      icon: TrendingUp,      href: "/dashboard/benchmark" },
      { label: "RFM",            icon: BarChart3,       href: "/dashboard/rfm" },
      { label: "Previsão",       icon: TrendingUp,      href: "/dashboard/forecast", minPlan: "growth" },
      { label: "Reviews",        icon: Star,            href: "/dashboard/reviews" },
      { label: "Atribuição",     icon: Target,          href: "/dashboard/atribuicao" },
    ],
  },
  {
    section: "MARKETING E RETENÇÃO",
    items: [
      { label: "Agente IA",      icon: Bot,             href: "/dashboard/agente-ia" },
      { label: "Newsletter",     icon: Mail,            href: "/dashboard/newsletter" },
      { label: "Automações",     icon: RefreshCcw,      href: "/dashboard/automacoes" },
      { label: "Fidelidade",     icon: Gift,            href: "/dashboard/fidelidade" },
      { label: "Carrinho",       icon: ShoppingCart,    href: "/dashboard/carrinho-abandonado" },
      { label: "Produtos",       icon: ShoppingCart,    href: "/dashboard/produtos" },
      { label: "Canais",         icon: Wifi,            href: "/dashboard/canais" },
    ],
  },
  {
    section: "CONTA",
    items: [
      { label: "Planos",         icon: CreditCard,      href: "/dashboard/planos" },
      { label: "Billing",        icon: CreditCard,      href: "/dashboard/billing" },
      { label: "Configurações",  icon: Settings,        href: "/dashboard/configuracoes" },
      { label: "Integrações",    icon: Wifi,            href: "/dashboard/integracoes" },
      { label: "WhatsApp",       icon: Smartphone,      href: "/dashboard/whatsapp" },
    ],
  },
  {
    section: "ADMIN E TÉCNICO",
    items: [
      { label: "Equipe",         icon: Users,           href: "/dashboard/equipe" },
      { label: "API Keys",       icon: Lock,            href: "/dashboard/api-keys" },
      { label: "White Label",    icon: Star,            href: "/dashboard/white-label" },
      { label: "Operações",      icon: Zap,             href: "/dashboard/operacoes" },
      { label: "Afiliados",      icon: Target,          href: "/dashboard/afiliados" },
      { label: "Plataforma",     icon: Shield,          href: "/admin", platformStaffOnly: true },
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
  const { signOut, user, profile, profileFallbackUsed } = useAuth();
  const { data: teamAccess } = useTeamAccess();
  const { data: isPlatformStaff } = useIsAdmin();

  // Paywall state — só active libera o produto completo.
  const requiresPayment = !!profile && profile.subscription_status !== "active";
  const navigate = useNavigate();

  const activeProfile = profile;

  const visibleNav = useMemo(() => {
    const base = !isBetaLimitedScope
      ? nav
      : nav
          .map((section) => ({
            ...section,
            items: section.items.filter((item) => !shouldHideNavItemHref(item.href)),
          }))
          .filter((section) => section.items.length > 0);

    return base
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => {
          if (item.platformStaffOnly && !isPlatformStaff) return false;
          return !teamNavItemHidden(item.href, teamAccess);
        }),
      }))
      .filter((section) => section.items.length > 0);
  }, [teamAccess, isPlatformStaff]);

  const dashboardHome = "/dashboard";
  const settingsHref = "/dashboard/configuracoes";
  const profileHref = settingsHref;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function handleSignOut() {
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
        <Link
          to={dashboardHome}
          onClick={() => setOpen(false)}
          className="flex items-center gap-3 min-w-0 rounded-xl outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-primary"
        >
          <div className="w-10 h-10 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20 shrink-0">
            <Zap className="h-6 w-6 text-primary-foreground fill-primary-foreground" />
          </div>
          <div className="flex flex-col min-w-0 text-left">
            <span className="font-black text-lg tracking-tighter leading-none">LTV BOOST</span>
            <span className="text-[10px] font-bold text-primary tracking-[0.2em] uppercase mt-1">Intelligence</span>
          </div>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-6 px-4 space-y-6">
        {visibleNav.map(({ section, items }) => (
          <div key={section}>
            <p className="px-4 mb-3 text-[9px] font-black uppercase tracking-[0.3em] text-muted-foreground/40">
              {section}
            </p>
            <div className="space-y-1">
              {items.map((item) => {
                const unlocked = hasPlanAccess(activeProfile?.plan, item.minPlan);
                const target = unlocked ? item.href : "/upgrade";
                const active = unlocked && isActive(item.href, pathname);
                return (
                  <Link
                    key={item.href}
                    to={target}
                    onClick={() => setOpen(false)}
                    title={!unlocked && item.minPlan ? `Disponível a partir do plano ${planLabels[item.minPlan]}` : undefined}
                    className={cn(
                      "flex items-center justify-between px-4 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 group",
                      active
                        ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                        : "text-muted-foreground hover:bg-primary/5 hover:text-primary",
                      !unlocked && "opacity-80",
                    )}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <item.icon className={cn("w-4 h-4 shrink-0 transition-transform group-hover:scale-110", active ? "" : "opacity-70")} />
                      <span className="truncate">{item.label}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {!unlocked && (
                        <Lock className="w-3.5 h-3.5 text-muted-foreground" aria-hidden />
                      )}
                      {item.dot && unlocked && !active && (
                        <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                      )}
                      {item.highlight && unlocked && !active && (
                        <span className="text-[8px] font-black bg-primary/10 text-primary px-1.5 py-0.5 rounded border border-primary/20">
                          NOVO
                        </span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Upgrade CTA — usuários sem plano ativo */}
      {requiresPayment && activeProfile && (
        <div className="px-4 pb-2">
          <div className="p-4 rounded-2xl border space-y-2.5 bg-amber-500/5 border-amber-500/20">
            <p className="text-[10px] font-black uppercase tracking-widest text-amber-500">
              Plano não ativo
            </p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Ative seu plano para liberar campanhas, automações e o Agente IA.
            </p>
            <Button
              size="sm"
              className="w-full h-8 text-[10px] font-black rounded-xl gap-1 bg-amber-500 hover:bg-amber-400 text-black"
              onClick={() => navigate('/planos')}
            >
              Ver planos <ArrowRight className="w-3 h-3" />
            </Button>
          </div>
        </div>
      )}

      {/* User profile */}
      <div className="px-4 pb-6 pt-4 border-t border-border/10">
        <Link
          to={profileHref}
          onClick={() => setOpen(false)}
          className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-muted/30 border border-border/10 hover:bg-muted/50 transition-colors outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-primary"
        >
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20">
            <span className="text-xs font-black text-primary font-mono">{initials}</span>
          </div>
          <div className="flex-1 min-w-0 text-left">
            <p className="text-sm font-black truncate tracking-tight">{displayName}</p>
            <span className={cn("text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-widest", planColors[plan])}>
              {planLabels[plan]}
            </span>
          </div>
        </Link>
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
    <ErrorBoundary>
      <StoreScopeProvider>
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
            {/* Topbar desktop */}
            <div className="hidden md:flex h-14 shrink-0 items-center justify-between gap-3 px-6 border-b bg-card/50 backdrop-blur-sm">
              <div className="flex items-center min-w-0 flex-1">
                <StoreSwitcher />
              </div>
              <div className="flex items-center gap-1 shrink-0">
              <Button variant="ghost" size="sm" className="h-9 gap-2 text-muted-foreground font-bold text-xs" asChild>
                <Link to="/central-de-ajuda">
                  <HelpCircle className="w-4 h-4" />
                  Ajuda
                </Link>
              </Button>
              <NotificationBell />
              </div>
            </div>

            {/* Topbar mobile */}
            <div className="md:hidden h-14 flex items-center gap-3 px-4 border-b bg-card shrink-0 sticky top-0 z-30">
              <Button variant="ghost" size="icon" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={open ? "Fechar menu" : "Abrir menu"}>
                {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </Button>
              <div className="flex-1 flex items-center gap-2 min-w-0">
                <span className="font-black text-xs uppercase tracking-tighter italic truncate">LTV Boost</span>
                {activeProfile && (
                  <Badge variant="outline" className={cn("shrink-0 text-[9px] font-black border-none", planColors[plan])}>
                    {planLabels[plan]}
                  </Badge>
                )}
                <StoreSwitcher />
              </div>
              <NotificationBell />
            </div>

            {/* Banner: plano não ativo (raro — guard normalmente bloqueia antes) */}
            {requiresPayment && (
              <div className="shrink-0 px-6 py-2 flex items-center justify-between gap-4 border-b text-xs font-bold bg-amber-500/10 border-amber-500/20 text-amber-600">
                <div className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    Seu plano não está ativo. Ative para liberar campanhas, automações e Agente IA.
                  </span>
                </div>
                <button
                  onClick={() => navigate("/planos")}
                  className="shrink-0 underline font-black hover:no-underline"
                >
                  Ver planos →
                </button>
              </div>
            )}

            {isBetaLimitedScope && (
              <div className="shrink-0 px-4 md:px-6 py-2 border-b bg-blue-500/10 border-blue-500/20 text-blue-700 dark:text-blue-300 text-[11px] md:text-xs font-semibold leading-snug">
                {BETA_LIMITED_BANNER_PT}
              </div>
            )}

            <main className="flex-1 overflow-y-auto p-4 md:p-6">
              {profileFallbackUsed && (
                <div className="mb-4 rounded-md border border-yellow-500/50 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-300">
                  Não foi possível carregar seu perfil. Algumas informações podem estar incompletas.{" "}
                  <button
                    className="underline hover:text-yellow-100"
                    onClick={() => window.location.reload()}
                  >
                    Recarregar página
                  </button>
                </div>
              )}
              <div className="max-w-7xl mx-auto">
                <TeamCollaboratorPageGuard>{children}</TeamCollaboratorPageGuard>
              </div>
            </main>
          </div>
        </div>
      </StoreScopeProvider>
    </ErrorBoundary>
  );
}
