import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, MessageCircle, Megaphone, Users,
  BarChart3, Settings, LogOut, Menu, X, Zap, HelpCircle, Wifi,
  ShoppingCart, Star, PieChart, Key, Palette, Link2, Gift, FileBarChart,
  Handshake, TrendingUp, Bot, ShoppingBag, Sparkles, RefreshCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import NotificationBell from "@/components/dashboard/NotificationBell";

const nav = [
  {
    section: "INTELIGÊNCIA",
    items: [
      { label: "Central",       icon: LayoutDashboard, href: "/dashboard" },
      { label: "Prescrições",   icon: Zap,             href: "/dashboard/prescricoes" },
      { label: "Funil",         icon: PieChart,        href: "/dashboard/funil" },
      { label: "Produtos",      icon: ShoppingBag,      href: "/dashboard/produtos" },
      { label: "Clientes",      icon: Users,           href: "/dashboard/contatos" },
      { label: "Forecast",      icon: TrendingUp,      href: "/dashboard/forecast" },
    ],
  },
  {
    section: "CANAIS",
    items: [
      { label: "Meus Canais",   icon: Link2,           href: "/dashboard/canais" },
    ],
  },
  {
    section: "EXECUÇÃO",
    items: [
      { label: "Em Execução",   icon: Sparkles,        href: "/dashboard/em-execucao" },
      { label: "Campanhas",     icon: Megaphone,       href: "/dashboard/campanhas" },
      { label: "Jornadas",      icon: RefreshCcw,      href: "/dashboard/automacoes" },
      { label: "Agente IA",     icon: Bot,             href: "/dashboard/chatbot" },
      { label: "Fidelidade",    icon: Gift,            href: "/dashboard/fidelidade" },
      { label: "Inbox",         icon: MessageCircle,   href: "/dashboard/inbox" },
    ],
  },
  {
    section: "CONTA",
    items: [
      { label: "Relatórios",    icon: FileBarChart,    href: "/dashboard/relatorios" },
      { label: "Integrações",   icon: Wifi,            href: "/dashboard/integracoes" },
      { label: "Configurações", icon: Settings,        href: "/dashboard/configuracoes" },
    ],
  },
];

const bottom = [
  { label: "Central de Ajuda", icon: HelpCircle,  href: "/central-de-ajuda" },
];

const planLabels: Record<string, string> = {
  starter:    "Starter",
  growth:     "Growth",
  scale:      "Scale",
  enterprise: "Enterprise",
};

const planColors: Record<string, string> = {
  starter:    "bg-muted text-muted-foreground",
  growth:     "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
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
  const { signOut, user, profile } = useAuth();
  const navigate = useNavigate();

  async function handleSignOut() {
    await signOut();
    navigate("/login", { replace: true });
  }

  const displayName = profile?.full_name || user?.email?.split("@")[0] || "Usuário";
  const companyName = profile?.company_name;
  const plan = profile?.plan ?? "starter";
  const initials = displayName.slice(0, 2).toUpperCase();

  const Sidebar = ({ mobile = false }: { mobile?: boolean }) => (
    <aside
      className={cn(
        "flex flex-col h-full bg-card border-r w-64",
        mobile && "w-full"
      )}
    >
      {/* Logo */}
      <div className="h-16 flex items-center gap-2 px-5 border-b shrink-0">
        <MessageCircle className="h-7 w-7 text-primary" />
        <span className="font-bold text-lg flex-1">LTV Boost</span>
        <NotificationBell />
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-4">
        {nav.map(({ section, items }) => (
          <div key={section}>
            <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              {section}
            </p>
            <div className="space-y-0.5">
              {items.map(({ label, icon: Icon, href }) => (
                <Link
                  key={href}
                  to={href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                    isActive(href, pathname)
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {label}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom links */}
      <div className="border-t pt-2 px-3">
        {bottom.map(({ label, icon: Icon, href }) => (
          <Link
            key={href}
            to={href}
            onClick={() => setOpen(false)}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
              isActive(href, pathname)
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <Icon className="w-4 h-4 shrink-0" />
            {label}
          </Link>
        ))}
      </div>

      {/* User profile */}
      <div className="px-3 pb-4 pt-2">
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-muted/50">
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
            <span className="text-xs font-bold text-primary">{initials}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{displayName}</p>
            {companyName && <p className="text-xs text-muted-foreground truncate">{companyName}</p>}
          </div>
          <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0", planColors[plan])}>
            {planLabels[plan]}
          </span>
        </div>
        <button
          onClick={handleSignOut}
          className="mt-1 w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          Sair
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
        <div className="md:hidden h-14 flex items-center gap-3 px-4 border-b bg-card shrink-0">
          <Button variant="ghost" size="icon" onClick={() => setOpen(true)}>
            {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </Button>
          <MessageCircle className="h-6 w-6 text-primary" />
          <span className="font-bold flex-1">LTV Boost</span>
          <NotificationBell />
        </div>

        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
