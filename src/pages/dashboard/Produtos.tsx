import { useState, useRef, useEffect, useMemo } from "react";
import {
  ShoppingBag, Package, Star, TrendingUp, AlertCircle,
  ArrowUpRight, ArrowDownRight, Search, Filter, ChevronDown,
  MoreHorizontal, Eye, ShoppingCart, Zap, Loader2, Megaphone
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { useProductsV3 as useProdutosV3 } from "@/hooks/useLTVBoost";
import { useAuth } from "@/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import CampaignModal, { ProdutoParaCampanha } from "@/components/dashboard/CampaignModal";

// --- Skeleton Component ---
const ProductSkeleton = () => (
  <div className="p-5 space-y-4 border-b border-border/40">
    <div className="flex items-center gap-3">
      <Skeleton className="w-12 h-12 rounded-xl" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-3 w-1/4" />
      </div>
    </div>
    <div className="grid grid-cols-2 gap-4">
      <Skeleton className="h-12 rounded-xl" />
      <Skeleton className="h-12 rounded-xl" />
    </div>
  </div>
);

// Helper component for virtualized items
const ProductCard = ({ p, onCriarCampanha }: { p: any; onCriarCampanha: (p: ProdutoParaCampanha) => void }) => {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      { rootMargin: "200px" }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="min-h-[200px]">
      {isVisible ? (
        <div className="p-5 space-y-4 hover:bg-muted/10 transition-colors">
          <div className="flex items-start justify-between gap-4">
            <div className="flex gap-3">
              <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center font-bold text-[10px] text-muted-foreground shadow-inner">IMG</div>
              <div>
                <h4 className="font-bold text-sm leading-tight">{p.nome}</h4>
                <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest mt-1">{p.categoria}</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg -mt-1 -mr-2">
              <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-muted/30 p-3 rounded-xl">
              <span className="text-[9px] font-black uppercase text-muted-foreground block mb-1">Estoque</span>
              <div className={cn("text-xs font-bold", p.estoque < 5 ? "text-red-500" : "")}>
                {p.estoque} un {p.estoque < 5 && <span className="ml-1 text-[8px] bg-red-500/10 px-1 rounded uppercase">Crítico</span>}
              </div>
            </div>
            <div className="bg-muted/30 p-3 rounded-xl">
              <span className="text-[9px] font-black uppercase text-muted-foreground block mb-1">Conversão</span>
              <div className="text-xs font-bold flex items-center gap-1">
                {p.taxa_conversao_produto || 0}%
                {p.taxa_conversao_produto < 10 && <AlertCircle className="w-3 h-3 text-red-500" />}
              </div>
            </div>
            <div className="bg-muted/30 p-3 rounded-xl">
              <span className="text-[9px] font-black uppercase text-muted-foreground block mb-1">Receita 30d</span>
              <div className="text-xs font-bold text-emerald-500">R$ {p.receita_30d?.toLocaleString('pt-BR') || '0,00'}</div>
            </div>
            <div className="bg-muted/30 p-3 rounded-xl">
              <span className="text-[9px] font-black uppercase text-muted-foreground block mb-1">Avaliação</span>
              <div className="text-xs font-bold flex items-center gap-1">
                <Star className={cn("w-3 h-3 fill-current", p.media_avaliacao < 3.5 ? "text-amber-500" : "text-emerald-500")} />
                {p.media_avaliacao || '0.0'}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 h-10 rounded-xl font-bold text-xs gap-2 border-primary/20 hover:bg-primary/5">
              <Zap className="w-3.5 h-3.5 text-primary fill-primary" /> Prescrição de SKU
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-10 rounded-xl font-bold text-xs gap-1.5 border-pink-500/20 text-pink-600 hover:bg-pink-500/5"
              onClick={() => onCriarCampanha(p)}
            >
              <Megaphone className="w-3.5 h-3.5" /> Campanha
            </Button>
          </div>
        </div>
      ) : (
        <ProductSkeleton />
      )}
    </div>
  );
};

export default function Produtos() {
  const { profile } = useAuth();
  const [filter, setFilter] = useState("todos");
  const { data: produtos, isLoading } = useProdutosV3(profile?.id, filter);
  const [campaignModal, setCampaignModal] = useState<{
    open: boolean;
    products?: ProdutoParaCampanha[];
  }>({ open: false });

  function abrirCampanhaProduto(p: ProdutoParaCampanha) {
    setCampaignModal({ open: true, products: [p] });
  }

  return (
    <div className="space-y-8 pb-10">
      {campaignModal.open && (
        <CampaignModal
          onClose={() => setCampaignModal({ open: false })}
          initialProducts={campaignModal.products}
          initialObjective="lancamento"
        />
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black font-syne tracking-tighter uppercase">Inteligência de Produtos</h1>
          <p className="text-muted-foreground text-sm mt-1">Oportunidades de lucro baseadas na performance de cada SKU.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-10 font-bold gap-2 rounded-xl">
            <Filter className="w-4 h-4" /> Filtrar Categoria
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-10 font-bold gap-2 rounded-xl border-pink-500/20 text-pink-600 hover:bg-pink-500/5"
            onClick={() => setCampaignModal({ open: true, products: [] })}
          >
            <Megaphone className="w-4 h-4" /> Criar Campanha de Coleção
          </Button>
          <Button className="h-10 font-bold gap-2 rounded-xl bg-primary text-primary-foreground">
            <Zap className="w-4 h-4" /> Gerar Prescrições de Produto
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard label="Monitorados" value={produtos?.length || 0} icon={Package} />
        <MetricCard label="Estoque Crítico" value={produtos?.filter((p: any) => p.estoque < 5).length || 0} trend={+2} icon={AlertCircle} className="border-red-500/20" />
        <MetricCard label="Avaliação Baixa" value={produtos?.filter((p: any) => p.media_avaliacao < 3.5).length || 0} icon={Star} />
        <MetricCard label="Top Receita" value={isLoading ? "..." : `R$ ${Math.max(...(produtos?.map((p: any) => p.receita_30d) || [0])).toLocaleString('pt-BR')}`} icon={TrendingUp} />
      </div>

      {/* Alertas de Produto */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1 bg-red-500/10 border border-red-500/20 rounded-2xl p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center shrink-0">
            <AlertCircle className="w-5 h-5 text-red-500" />
          </div>
          <div>
            <p className="text-sm font-bold">{produtos?.filter((p: any) => p.estoque < 5).length || 0} produtos com estoque {"<"} 5 unidades</p>
            <p className="text-xs text-muted-foreground">Risco de perda iminente em vendas.</p>
          </div>
          <Button variant="link" className="ml-auto text-red-500 font-bold text-xs p-0 h-auto underline">Resolver agora</Button>
        </div>
      </div>

      <div className="bg-card border rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-border/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative max-w-sm w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Buscar por SKU ou Nome..." className="pl-9 h-10 rounded-xl bg-muted/20" />
          </div>
          <div className="flex items-center gap-2">
            <div className="bg-muted p-1 rounded-xl flex overflow-x-auto">
              {['todos', 'estoque_critico', 'baixa_cvr'].map((f) => (
                <Button
                  key={f}
                  variant={filter === f ? "secondary" : "ghost"}
                  size="sm"
                  className="h-8 text-[10px] font-black px-3 rounded-lg uppercase tracking-wider whitespace-nowrap"
                  onClick={() => setFilter(f)}
                >
                  {f.replace('_', ' ')}
                </Button>
              ))}
            </div>
          </div>
        </div>

        {/* Mobile Card Stack - VIRTUALIZED */}
        <div className="md:hidden divide-y divide-border/40">
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => <ProductSkeleton key={i} />)
          ) : produtos?.length === 0 ? (
            <div className="p-10 text-center text-muted-foreground text-sm font-bold italic">Nenhum produto encontrado com este filtro.</div>
          ) : (
            produtos?.map((p: any) => (
              <ProductCard key={p.id} p={p} onCriarCampanha={abrirCampanhaProduto} />
            ))
          )}
        </div>

        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-muted/30 border-b border-border/50">
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Produto</th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Estoque</th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Avaliação</th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Vis. → Venda</th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Receita 30d</th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground text-right">Ação</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-border/40">
                    <td className="px-6 py-4"><Skeleton className="h-10 w-48" /></td>
                    <td className="px-6 py-4"><Skeleton className="h-6 w-16" /></td>
                    <td className="px-6 py-4"><Skeleton className="h-6 w-16" /></td>
                    <td className="px-6 py-4"><Skeleton className="h-10 w-24" /></td>
                    <td className="px-6 py-4"><Skeleton className="h-6 w-32" /></td>
                    <td className="px-6 py-4 text-right"><Skeleton className="h-8 w-8 ml-auto" /></td>
                  </tr>
                ))
              ) : (
                produtos?.map((p: any) => (
                  <tr key={p.id} className="border-b border-border/40 hover:bg-muted/10 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center font-bold text-[10px] text-muted-foreground">IMG</div>
                        <div>
                          <div className="font-bold text-sm leading-none mb-1">{p.nome}</div>
                          <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">{p.categoria} | SKU: {p.sku || 'N/A'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className={cn("text-sm font-bold", p.estoque < 5 ? "text-red-500" : "")}>
                        {p.estoque} un
                      </div>
                      {p.estoque < 5 && <Badge className="bg-red-500/10 text-red-500 border-0 text-[8px] font-black uppercase p-0 h-auto">Crítico</Badge>}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1 text-sm font-bold">
                        <Star className={cn("w-3.5 h-3.5 fill-current", p.media_avaliacao < 3.5 ? "text-amber-500" : "text-emerald-500")} />
                        {p.media_avaliacao}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="flex flex-col">
                          <span className="text-sm font-bold">{p.taxa_conversao_produto || 0}%</span>
                          <div className="flex items-center gap-1 text-[9px] text-muted-foreground font-bold">
                            <Eye className="w-2.5 h-2.5" /> {p.num_visualizacoes || 0}
                          </div>
                        </div>
                        {p.taxa_conversao_produto < 10 && <AlertCircle className="w-3 h-3 text-red-500" />}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-bold">R$ {p.receita_30d?.toLocaleString('pt-BR') || '0,00'}</div>
                      <div className="text-[9px] text-muted-foreground font-bold uppercase">{p.num_vendas || 0} vendas</div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 rounded-lg text-[9px] font-black uppercase gap-1 border-pink-500/20 text-pink-600 hover:bg-pink-500/5 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => abrirCampanhaProduto(p)}
                        >
                          <Megaphone className="w-3 h-3" /> Campanha
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg">
                          <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
