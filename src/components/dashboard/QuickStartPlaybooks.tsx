import type { ElementType } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Zap, ArrowRight, ShoppingCart, Repeat, MessageSquareText, Star, Wallet } from "lucide-react";
import { trackMoatEvent } from "@/lib/moat-telemetry";
import { loadStrategyProfile } from "@/lib/strategy-profile";

type Playbook = {
  id: string;
  title: string;
  eta: string;
  impact: string;
  route: string;
  icon: ElementType;
};

const PLAYBOOKS: Playbook[] = [
  {
    id: "cart-recovery",
    title: "Carrinho abandonado com incentivo progressivo",
    eta: "15 min",
    impact: "Recuperar caixa em 24h",
    route: "/dashboard/automacoes",
    icon: ShoppingCart,
  },
  {
    id: "reactivation-rfm",
    title: "Reativacao por segmento RFM",
    eta: "10 min",
    impact: "Aumentar recompra em 7 dias",
    route: "/dashboard/newsletter",
    icon: Repeat,
  },
  {
    id: "inbox-sla",
    title: "Ritual diario de Inbox e SLA",
    eta: "5 min",
    impact: "Reduzir perdas por atraso",
    route: "/dashboard/inbox",
    icon: MessageSquareText,
  },
  {
    id: "reviews-post-purchase",
    title: "Fluxo pos-compra de reviews com IA",
    eta: "12 min",
    impact: "Gerar prova social e conversao",
    route: "/dashboard/reviews",
    icon: Star,
  },
  {
    id: "pix-boleto-recovery",
    title: "Recuperacao de PIX e boleto pendente",
    eta: "8 min",
    impact: "Capturar receita em risco imediato",
    route: "/dashboard/carrinho-abandonado",
    icon: Wallet,
  },
];

export function QuickStartPlaybooks() {
  const profile = loadStrategyProfile();
  const filtered = PLAYBOOKS.filter((playbook) => {
    if (!profile) return true;
    if (profile.objective === "recover") return playbook.id === "cart-recovery" || playbook.id === "pix-boleto-recovery" || playbook.id === "inbox-sla";
    if (profile.objective === "repeat") return playbook.id === "reactivation-rfm" || playbook.id === "reviews-post-purchase" || playbook.id === "inbox-sla";
    return playbook.id === "reactivation-rfm" || playbook.id === "inbox-sla" || playbook.id === "cart-recovery";
  });

  return (
    <Card className="p-5 rounded-2xl border-primary/20 bg-primary/5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-primary">Go-live em 24h</p>
          <h3 className="text-base font-black">
            {profile ? "Playbooks alinhados ao seu objetivo" : "Playbooks prontos para gerar resultado rapido"}
          </h3>
        </div>
        <Zap className="w-4 h-4 text-primary shrink-0" />
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        {filtered.map((playbook) => {
          const Icon = playbook.icon;
          return (
            <a
              key={playbook.id}
              href={playbook.route}
              onClick={() => {
                void trackMoatEvent("playbook_applied", { playbook: playbook.id });
              }}
              className="flex items-center gap-3 rounded-xl border bg-card p-3 hover:border-primary/40 transition-colors"
            >
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Icon className="w-4 h-4 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate">{playbook.title}</p>
                <p className="text-[11px] text-muted-foreground">
                  Setup: <strong>{playbook.eta}</strong> · {playbook.impact}
                </p>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
            </a>
          );
        })}
      </div>
      <Button asChild variant="outline" size="sm" className="mt-4 h-8 text-xs">
        <a href="/dashboard/automacoes">Ver biblioteca completa de playbooks</a>
      </Button>
    </Card>
  );
}
