import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, ShoppingCart, Star, Megaphone, CreditCard, Users, Zap, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

type Notification = {
  id: string;
  type: "cart_recovered" | "new_review" | "campaign_done" | "payment" | "team_invite" | "system" | "low_credits" | "new_contact";
  title: string;
  body: string | null;
  action_url: string | null;
  read_at: string | null;
  created_at: string;
};

const TYPE_CONFIG: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  cart_recovered: { icon: ShoppingCart, color: "text-green-600",  bg: "bg-green-100" },
  new_review:     { icon: Star,         color: "text-yellow-600", bg: "bg-yellow-100" },
  campaign_done:  { icon: Megaphone,    color: "text-blue-600",   bg: "bg-blue-100" },
  payment:        { icon: CreditCard,   color: "text-purple-600", bg: "bg-purple-100" },
  team_invite:    { icon: Users,        color: "text-indigo-600", bg: "bg-indigo-100" },
  system:         { icon: Zap,          color: "text-orange-600", bg: "bg-orange-100" },
  low_credits:    { icon: Zap,          color: "text-red-600",    bg: "bg-red-100" },
  new_contact:    { icon: Users,        color: "text-teal-600",   bg: "bg-teal-100" },
};

// Demo notifications for first-time users
const DEMO: Notification[] = [
  { id: "d1", type: "cart_recovered",  title: "Carrinho recuperado!",        body: "Maria Silva completou a compra após receber seu WhatsApp. +R$ 247,00", action_url: "/dashboard/carrinho-abandonado", read_at: null, created_at: new Date(Date.now() - 5 * 60000).toISOString() },
  { id: "d2", type: "new_review",      title: "Nova avaliação 5★ no Google", body: "João Pereira deixou uma avaliação positiva sobre sua loja.",            action_url: "/dashboard/reviews",   read_at: null, created_at: new Date(Date.now() - 30 * 60000).toISOString() },
  { id: "d3", type: "campaign_done",   title: "Campanha concluída",           body: "\"Promoção Inverno\" foi enviada para 1.240 contatos. Taxa de leitura: 71%", action_url: "/dashboard/campanhas", read_at: null, created_at: new Date(Date.now() - 2 * 3600000).toISOString() },
  { id: "d4", type: "system",          title: "Bem-vindo ao LTV Boost!",    body: "Configure sua instância WhatsApp para começar a disparar campanhas.",  action_url: "/dashboard/whatsapp",  read_at: new Date().toISOString(), created_at: new Date(Date.now() - 24 * 3600000).toISOString() },
];

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "agora";
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: notifications = DEMO } = useQuery({
    queryKey: ["notifications", user?.id],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("notifications")
          .select("*")
          .eq("user_id", user!.id)
          .order("created_at", { ascending: false })
          .limit(20);
        if (error || !data?.length) return DEMO;
        return data as Notification[];
      } catch {
        return DEMO;
      }
    },
    enabled: !!user,
    refetchInterval: 30_000,
  });

  const markReadMutation = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications", user?.id] }),
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("user_id", user!.id)
        .is("read_at", null);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications", user?.id] }),
  });

  const unread = notifications.filter((n) => !n.read_at).length;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      >
        <Bell className="w-5 h-5" />
        {unread > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

          {/* Panel */}
          <div className="absolute right-0 top-full mt-2 w-80 bg-card border rounded-xl shadow-xl z-50 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-primary" />
                <span className="font-semibold text-sm">Notificações</span>
                {unread > 0 && (
                  <span className="bg-red-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5">
                    {unread}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {unread > 0 && (
                  <button
                    onClick={() => markAllReadMutation.mutate()}
                    className="text-xs text-primary hover:underline"
                  >
                    Marcar tudo lido
                  </button>
                )}
                <button onClick={() => setOpen(false)} className="p-1 rounded hover:bg-muted ml-1">
                  <X className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              </div>
            </div>

            <div className="max-h-96 overflow-y-auto divide-y">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
                  <Bell className="w-8 h-8 opacity-20" />
                  <p className="text-sm">Nenhuma notificação</p>
                </div>
              ) : (
                notifications.map((n) => {
                  const cfg = TYPE_CONFIG[n.type] ?? TYPE_CONFIG.system;
                  const Icon = cfg.icon;
                  return (
                    <div
                      key={n.id}
                      onClick={() => {
                        if (!n.read_at) markReadMutation.mutate(n.id);
                        if (n.action_url) window.location.href = n.action_url;
                        setOpen(false);
                      }}
                      className={cn(
                        "flex gap-3 px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors",
                        !n.read_at && "bg-primary/5"
                      )}
                    >
                      <div className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0", cfg.bg)}>
                        <Icon className={cn("w-4 h-4", cfg.color)} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={cn("text-sm", !n.read_at && "font-semibold")}>{n.title}</p>
                        {n.body && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>}
                        <p className="text-xs text-muted-foreground mt-1">{timeAgo(n.created_at)}</p>
                      </div>
                      {!n.read_at && (
                        <div className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1.5" />
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
