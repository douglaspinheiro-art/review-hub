import { useInView } from "@/hooks/useInView";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight, Store, Users, Handshake, MessageCircle } from "lucide-react";

const ICP_SEGMENTS = [
  { title: "Moda e Beleza", profile: "Operações de R$80k a R$500k/mês", win: "Recompra e lançamentos por coleção" },
  { title: "Saúde e Suplementos", profile: "Ticket médio acima de R$120", win: "Reposição e recorrência guiada por janela" },
  { title: "Casa e Lifestyle", profile: "Catálogo amplo e alta sazonalidade", win: "Cross-sell e pós-venda com prova social" },
];

export default function CategoryPositioning() {
  const { ref, inView } = useInView();

  return (
    <section ref={ref} className="py-16 md:py-20">
      <div className="container mx-auto px-4 space-y-8">
        <div
          className={cn(
            "rounded-3xl border border-primary/20 bg-primary/5 p-6 md:p-8 transition-all duration-700",
            inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          )}
        >
          <div className="flex flex-col lg:flex-row gap-5 lg:items-center justify-between">
            <div className="space-y-2">
              <Badge className="bg-primary/10 text-primary border-primary/20">Categoria</Badge>
              <h2 className="text-2xl md:text-3xl font-display font-bold">
                O Sistema Operacional de Retenção para e-commerce no Brasil
              </h2>
              <p className="text-sm text-muted-foreground max-w-3xl">
                Voce nao compra automacao isolada. Voce liga um ritmo diario de receita, com playbooks, operacao de inbox, IA
                de decisao e atribuicao de impacto no mesmo lugar.
              </p>
            </div>
            <Button asChild className="h-11 px-6 gap-1.5">
              <a href="/signup">
                Ver demo para meu nicho <ArrowRight className="w-4 h-4" />
              </a>
            </Button>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          {ICP_SEGMENTS.map((segment) => (
            <div key={segment.title} className="rounded-2xl border bg-card p-5 space-y-2">
              <div className="flex items-center gap-2 text-primary">
                <Store className="w-4 h-4" />
                <p className="text-sm font-semibold">{segment.title}</p>
              </div>
              <p className="text-xs text-muted-foreground">{segment.profile}</p>
              <p className="text-xs font-medium">{segment.win}</p>
            </div>
          ))}
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          <div className="rounded-2xl border bg-card p-5 space-y-2">
            <div className="flex items-center gap-2">
              <Handshake className="w-4 h-4 text-primary" />
              <p className="text-sm font-semibold">Programa de parceiros</p>
            </div>
            <p className="text-xs text-muted-foreground">Playbooks co-criados com agências e operadores certificados.</p>
          </div>
          <div className="rounded-2xl border bg-card p-5 space-y-2">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              <p className="text-sm font-semibold">Comunidade de operadores</p>
            </div>
            <p className="text-xs text-muted-foreground">Benchmark mensal por nicho com clínica de otimização.</p>
          </div>
          <div className="rounded-2xl border bg-card p-5 space-y-2">
            <div className="flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-primary" />
              <p className="text-sm font-semibold">Distribuição orientada a casos</p>
            </div>
            <p className="text-xs text-muted-foreground">Teardowns reais de campanhas para escalar aquisição com prova.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
