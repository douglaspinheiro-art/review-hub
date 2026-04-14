import { useState, useRef, useEffect, useMemo, useCallback, memo } from "react";
import {
  Package,
  Star,
  TrendingUp,
  AlertCircle,
  Search,
  Filter,
  MoreHorizontal,
  Eye,
  Zap,
  Megaphone,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { useProductsV3 as useProdutosV3, type ProductRow } from "@/hooks/useLTVBoost";
import { useLoja } from "@/hooks/useConvertIQ";
import { Skeleton } from "@/components/ui/skeleton";
import CampaignModal, { ProdutoParaCampanha } from "@/components/dashboard/CampaignModal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  isDashboardPathBlockedInBetaScope,
  BETA_LIMITED_BANNER_PT,
} from "@/lib/beta-scope";

const FILTER_LABELS: Record<string, string> = {
  todos: "Todos",
  estoque_critico: "Estoque crítico",
  baixa_cvr: "Baixa CVR",
};

function estoqueN(p: ProductRow) {
  return Number(p.estoque ?? 0);
}

function mediaAval(p: ProductRow) {
  return Number(p.media_avaliacao ?? 0);
}

function taxaCvr(p: ProductRow) {
  return Number(p.taxa_conversao_produto ?? 0);
}

function receitaN(p: ProductRow) {
  return Number(p.receita_30d ?? 0);
}

function toProdutoCampanha(p: ProductRow): ProdutoParaCampanha {
  return {
    id: p.id,
    nome: p.nome,
    sku: p.sku,
    preco: p.preco,
    estoque: p.estoque,
  };
}

function ProductThumb({
  url,
  alt,
  className,
}: {
  url: string | null | undefined;
  alt: string;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  if (url && !broken) {
    return (
      <img
        src={url}
        alt={alt}
        className={cn("object-cover rounded-xl bg-muted", className)}
        onError={() => setBroken(true)}
      />
    );
  }
  return (
    <div
      className={cn(
        "rounded-xl bg-muted flex items-center justify-center font-bold text-[10px] text-muted-foreground shadow-inner",
        className
      )}
    >
      SKU
    </div>
  );
}

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

const ProductCard = memo(({
  p,
  onCriarCampanha,
  onPrescricaoSku,
  campanhasBlocked,
}: {
  p: ProductRow;
  onCriarCampanha: (p: ProdutoParaCampanha) => void;
  onPrescricaoSku: (p: ProductRow) => void;
  campanhasBlocked: boolean;
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const est = estoqueN(p);
  const cvr = taxaCvr(p);
  const media = mediaAval(p);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setIsVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="min-h-[200px]">
      {isVisible ? (
        <div className="p-5 space-y-4 hover:bg-muted/10 transition-colors">
          <div className="flex items-start justify-between gap-4">
            <div className="flex gap-3 min-w-0">
              <ProductThumb url={p.imagem_url} alt={p.nome ? `Foto: ${p.nome}` : "Produto"} className="w-12 h-12 shrink-0" />
              <div className="min-w-0">
                <h4 className="font-bold text-sm leading-tight truncate">{p.nome}</h4>
                <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest mt-1 truncate">
                  {p.categoria || "—"}
                </p>
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg -mt-1 -mr-2 shrink-0">
                  <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onPrescricaoSku(p)}>Prescrição de SKU</DropdownMenuItem>
                {!campanhasBlocked ? (
                  <DropdownMenuItem onClick={() => onCriarCampanha(toProdutoCampanha(p))}>Campanha</DropdownMenuItem>
                ) : (
                  <DropdownMenuItem disabled>Campanha (indisponível no beta)</DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-muted/30 p-3 rounded-xl">
              <span className="text-[9px] font-black uppercase text-muted-foreground block mb-1">Estoque</span>
              <div className={cn("text-xs font-bold", est < 5 ? "text-red-500" : "")}>
                {est} un{" "}
                {est < 5 && (
                  <span className="ml-1 text-[8px] bg-red-500/10 px-1 rounded uppercase">Crítico</span>
                )}
              </div>
            </div>
            <div className="bg-muted/30 p-3 rounded-xl">
              <span className="text-[9px] font-black uppercase text-muted-foreground block mb-1">Conversão</span>
              <div className="text-xs font-bold flex items-center gap-1">
                {cvr}%
                {cvr < 10 && <AlertCircle className="w-3 h-3 text-red-500" />}
              </div>
            </div>
            <div className="bg-muted/30 p-3 rounded-xl">
              <span className="text-[9px] font-black uppercase text-muted-foreground block mb-1">Receita 30d</span>
              <div className="text-xs font-bold text-emerald-500">
                R$ {receitaN(p).toLocaleString("pt-BR")}
              </div>
            </div>
            <div className="bg-muted/30 p-3 rounded-xl">
              <span className="text-[9px] font-black uppercase text-muted-foreground block mb-1">Avaliação</span>
              <div className="text-xs font-bold flex items-center gap-1">
                <Star
                  className={cn("w-3 h-3 fill-current", media < 3.5 ? "text-amber-500" : "text-emerald-500")}
                />
                {media.toFixed(1)}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1 h-10 rounded-xl font-bold text-xs gap-2 border-primary/20 hover:bg-primary/5"
              onClick={() => onPrescricaoSku(p)}
            >
              <Zap className="w-3.5 h-3.5 text-primary fill-primary" /> Prescrição de SKU
            </Button>
            {campanhasBlocked ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex flex-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled
                        className="h-10 w-full rounded-xl font-bold text-xs gap-1.5 border-pink-500/20 text-pink-600 opacity-60"
                      >
                        <Megaphone className="w-3.5 h-3.5" /> Campanha
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs text-xs">{BETA_LIMITED_BANNER_PT}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-10 rounded-xl font-bold text-xs gap-1.5 border-pink-500/20 text-pink-600 hover:bg-pink-500/5"
                onClick={() => onCriarCampanha(toProdutoCampanha(p))}
              >
                <Megaphone className="w-3.5 h-3.5" /> Campanha
              </Button>
            )}
          </div>
        </div>
      ) : (
        <ProductSkeleton />
      )}
    </div>
  );
});

const PAGE_SIZE = 48;

const emptyListMessage = (
  <div className="p-10 text-center text-muted-foreground text-sm font-bold italic">
    Nenhum produto encontrado com este filtro.
  </div>
);

export default function Produtos() {
  const navigate = useNavigate();
  const loja = useLoja();
  const storeId = loja.data?.id;
  const [filter, setFilter] = useState("todos");
  const [page, setPage] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 400);
    return () => clearTimeout(t);
  }, [searchQuery]);
  useEffect(() => {
    setPage(0);
  }, [filter, debouncedSearch, storeId]);

  const serverSearch = debouncedSearch.length >= 2 ? debouncedSearch : "";
  const {
    data: productsPage,
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useProdutosV3(storeId, { filter, page, pageSize: PAGE_SIZE, search: serverSearch });
  const produtos = useMemo(() => productsPage?.rows ?? [], [productsPage]);
  const totalCatalog = productsPage?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCatalog / PAGE_SIZE));

  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [campaignModal, setCampaignModal] = useState<{
    open: boolean;
    products?: ProdutoParaCampanha[];
  }>({ open: false });
  const listaRef = useRef<HTMLDivElement>(null);

  const campanhasBlocked = isDashboardPathBlockedInBetaScope("/dashboard/campanhas");

  const categorias = useMemo(() => {
    const set = new Set<string>();
    for (const p of produtos) {
      const c = (p.categoria || "").trim();
      if (c) set.add(c);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [produtos]);

  const displayed = useMemo(() => {
    let rows = produtos;
    if (categoryFilter) {
      rows = rows.filter((p) => (p.categoria || "").trim() === categoryFilter);
    }
    if (!serverSearch) {
      const q = searchQuery.trim().toLowerCase();
      if (q) {
        rows = rows.filter(
          (p) =>
            (p.nome || "").toLowerCase().includes(q) ||
            (p.sku || "").toLowerCase().includes(q),
        );
      }
    }
    return rows;
  }, [produtos, categoryFilter, searchQuery, serverSearch]);

  const abrirCampanhaProduto = useCallback((p: ProdutoParaCampanha) => {
    if (campanhasBlocked) return;
    setCampaignModal({ open: true, products: [p] });
  }, [campanhasBlocked]);

  const irPrescricaoSku = useCallback(
    (p: ProductRow) => {
      const sku = (p.sku || "").trim();
      if (sku) navigate(`/dashboard/prescricoes?sku=${encodeURIComponent(sku)}`);
      else navigate("/dashboard/prescricoes");
    },
    [navigate]
  );

  const irPrescricoes = useCallback(() => {
    navigate("/dashboard/prescricoes");
  }, [navigate]);

  const resolverEstoque = useCallback(() => {
    setFilter("estoque_critico");
    setSearchQuery("");
    setCategoryFilter("");
    requestAnimationFrame(() => {
      listaRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  const criticoCount = useMemo(() => produtos.filter((p) => estoqueN(p) < 5).length, [produtos]);
  const baixaAvalCount = useMemo(
    () => produtos.filter((p) => mediaAval(p) > 0 && mediaAval(p) < 3.5).length,
    [produtos],
  );

  const topReceitaLabel = useMemo(() => {
    if (isLoading) return "...";
    const nums = produtos.map((p) => receitaN(p));
    if (!nums.length) return "—";
    return `R$ ${Math.max(...nums).toLocaleString("pt-BR")}`;
  }, [isLoading, produtos]);

  if (loja.isLoading) {
    return (
      <div className="space-y-8 pb-10">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-4 w-96 max-w-full" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-[400px] rounded-2xl" />
      </div>
    );
  }

  if (!loja.data) {
    return (
      <div className="space-y-6 pb-10 max-w-lg">
        <div>
          <h1 className="text-3xl font-black font-syne tracking-tighter uppercase">Inteligência de Produtos</h1>
          <p className="text-muted-foreground text-sm mt-2">
            Cadastre ou vincule uma loja para carregar o catálogo e métricas por SKU.
          </p>
        </div>
        <Button asChild className="rounded-xl font-bold">
          <Link to="/onboarding">Concluir configuração da loja</Link>
        </Button>
      </div>
    );
  }

  const showFilteredEmpty = !isLoading && displayed.length === 0 && produtos.length > 0;
  const showApiEmpty = !isLoading && totalCatalog === 0;

  return (
    <div className="space-y-8 pb-10">
      {campaignModal.open && (
        <CampaignModal
          onClose={() => setCampaignModal({ open: false })}
          initialProducts={campaignModal.products}
          initialObjective="lancamento"
        />
      )}

      {campanhasBlocked && (
        <p className="text-xs text-muted-foreground border border-border/60 rounded-xl px-4 py-3 bg-muted/20">
          {BETA_LIMITED_BANNER_PT}
        </p>
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black font-syne tracking-tighter uppercase">Inteligência de Produtos</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Oportunidades de lucro baseadas na performance de cada SKU.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-10 font-bold gap-2 rounded-xl">
                <Filter className="w-4 h-4" />
                {categoryFilter ? categoryFilter : "Filtrar categoria"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[200px]">
              <DropdownMenuRadioGroup
                value={categoryFilter || "__all__"}
                onValueChange={(v) => setCategoryFilter(v === "__all__" ? "" : v)}
              >
                <DropdownMenuRadioItem value="__all__">Todas as categorias</DropdownMenuRadioItem>
                {categorias.map((c) => (
                  <DropdownMenuRadioItem key={c} value={c}>
                    {c}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          {campanhasBlocked ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled
                      className="h-10 font-bold gap-2 rounded-xl border-pink-500/20 text-pink-600 opacity-60"
                    >
                      <Megaphone className="w-4 h-4" /> Criar Campanha de Coleção
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-xs">{BETA_LIMITED_BANNER_PT}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="h-10 font-bold gap-2 rounded-xl border-pink-500/20 text-pink-600 hover:bg-pink-500/5"
              onClick={() => setCampaignModal({ open: true, products: [] })}
            >
              <Megaphone className="w-4 h-4" /> Criar Campanha de Coleção
            </Button>
          )}

          <Button
            type="button"
            className="h-10 font-bold gap-2 rounded-xl bg-primary text-primary-foreground"
            onClick={irPrescricoes}
          >
            <Zap className="w-4 h-4" /> Gerar Prescrições de Produto
          </Button>
        </div>
      </div>

      {isError && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <p className="text-sm font-medium text-destructive">Não foi possível carregar os produtos.</p>
          <Button type="button" variant="outline" size="sm" className="sm:ml-auto shrink-0" onClick={() => refetch()}>
            Tentar novamente
          </Button>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard label="No catálogo" value={totalCatalog} icon={Package} tooltip="Total de SKUs com os filtros atuais (servidor)" />
        <MetricCard
          label="Estoque crítico (página)"
          value={criticoCount}
          icon={AlertCircle}
          className="border-red-500/20"
          tooltip="Contagem apenas entre os produtos desta página"
        />
        <MetricCard label="Avaliação Baixa" value={baixaAvalCount} icon={Star} />
        <MetricCard label="Top Receita" value={topReceitaLabel} icon={TrendingUp} />
      </div>

      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1 bg-red-500/10 border border-red-500/20 rounded-2xl p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center shrink-0">
            <AlertCircle className="w-5 h-5 text-red-500" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold">
              {criticoCount} produtos nesta página com estoque {"<"} 5 unidades
            </p>
            <p className="text-xs text-muted-foreground">Use filtros e páginas para rever todo o catálogo.</p>
          </div>
          <Button
            type="button"
            variant="link"
            className="ml-auto text-red-500 font-bold text-xs p-0 h-auto underline shrink-0"
            onClick={resolverEstoque}
          >
            Resolver agora
          </Button>
        </div>
      </div>

      <div ref={listaRef} id="lista-produtos" className="bg-card border rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-border/50 flex flex-col gap-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="relative max-w-sm w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por SKU ou Nome..."
                className="pl-9 h-10 rounded-xl bg-muted/20"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Buscar produtos por nome ou SKU"
              />
            </div>
            <div className="flex items-center gap-2">
              <div className="bg-muted p-1 rounded-xl flex overflow-x-auto">
                {["todos", "estoque_critico", "baixa_cvr"].map((f) => (
                  <Button
                    key={f}
                    variant={filter === f ? "secondary" : "ghost"}
                    size="sm"
                    className="h-8 text-[10px] font-black px-3 rounded-lg uppercase tracking-wider whitespace-nowrap"
                    onClick={() => setFilter(f)}
                  >
                    {FILTER_LABELS[f] ?? f}
                  </Button>
                ))}
              </div>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground px-1">
            Com 2+ caracteres a busca abrange todo o catálogo no servidor; abaixo disso filtra só a página atual.
          </p>
        </div>

        <div className="md:hidden divide-y divide-border/40">
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => <ProductSkeleton key={i} />)
          ) : showApiEmpty ? (
            emptyListMessage
          ) : showFilteredEmpty ? (
            <div className="p-10 text-center text-muted-foreground text-sm font-bold italic">
              Nenhum produto corresponde à busca ou categoria selecionada.
            </div>
          ) : (
            displayed.map((p) => (
              <ProductCard
                key={p.id}
                p={p}
                onCriarCampanha={abrirCampanhaProduto}
                onPrescricaoSku={irPrescricaoSku}
                campanhasBlocked={campanhasBlocked}
              />
            ))
          )}
        </div>

        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-muted/30 border-b border-border/50">
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Produto
                </th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Estoque
                </th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Avaliação
                </th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Vis. → Venda
                </th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Receita 30d
                </th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground text-right">
                  Ação
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-border/40">
                    <td className="px-6 py-4">
                      <Skeleton className="h-10 w-48" />
                    </td>
                    <td className="px-6 py-4">
                      <Skeleton className="h-6 w-16" />
                    </td>
                    <td className="px-6 py-4">
                      <Skeleton className="h-6 w-16" />
                    </td>
                    <td className="px-6 py-4">
                      <Skeleton className="h-10 w-24" />
                    </td>
                    <td className="px-6 py-4">
                      <Skeleton className="h-6 w-32" />
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Skeleton className="h-8 w-8 ml-auto" />
                    </td>
                  </tr>
                ))
              ) : showApiEmpty ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground text-sm font-bold italic">
                    Nenhum produto encontrado com este filtro.
                  </td>
                </tr>
              ) : showFilteredEmpty ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground text-sm font-bold italic">
                    Nenhum produto corresponde à busca ou categoria selecionada.
                  </td>
                </tr>
              ) : (
                displayed.map((p) => {
                  const est = estoqueN(p);
                  const cvr = taxaCvr(p);
                  const media = mediaAval(p);
                  return (
                    <tr key={p.id} className="border-b border-border/40 hover:bg-muted/10 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <ProductThumb
                            url={p.imagem_url}
                            alt={p.nome ? `Foto: ${p.nome}` : "Produto"}
                            className="w-10 h-10 shrink-0 rounded-lg"
                          />
                          <div className="min-w-0">
                            <div className="font-bold text-sm leading-none mb-1 truncate">{p.nome}</div>
                            <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider truncate">
                              {p.categoria || "—"} | SKU: {p.sku || "N/A"}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className={cn("text-sm font-bold", est < 5 ? "text-red-500" : "")}>{est} un</div>
                        {est < 5 && (
                          <Badge className="bg-red-500/10 text-red-500 border-0 text-[8px] font-black uppercase p-0 h-auto">
                            Crítico
                          </Badge>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1 text-sm font-bold">
                          <Star
                            className={cn(
                              "w-3.5 h-3.5 fill-current",
                              media < 3.5 ? "text-amber-500" : "text-emerald-500"
                            )}
                          />
                          {media > 0 ? media.toFixed(1) : "—"}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="flex flex-col">
                            <span className="text-sm font-bold">{cvr}%</span>
                            <div className="flex items-center gap-1 text-[9px] text-muted-foreground font-bold">
                              <Eye className="w-2.5 h-2.5" /> {p.num_visualizacoes ?? 0}
                            </div>
                          </div>
                          {cvr < 10 && <AlertCircle className="w-3 h-3 text-red-500 shrink-0" />}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-bold">
                          R$ {receitaN(p).toLocaleString("pt-BR")}
                        </div>
                        <div className="text-[9px] text-muted-foreground font-bold uppercase">
                          {p.num_vendas ?? 0} vendas
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {!campanhasBlocked ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 rounded-lg text-[9px] font-black uppercase gap-1 border-pink-500/20 text-pink-600 hover:bg-pink-500/5 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={() => abrirCampanhaProduto(toProdutoCampanha(p))}
                            >
                              <Megaphone className="w-3 h-3" /> Campanha
                            </Button>
                          ) : null}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg">
                                <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => irPrescricaoSku(p)}>Prescrição de SKU</DropdownMenuItem>
                              {!campanhasBlocked ? (
                                <DropdownMenuItem onClick={() => abrirCampanhaProduto(toProdutoCampanha(p))}>
                                  Campanha
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem disabled>Campanha (beta)</DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {totalCatalog > PAGE_SIZE && (
          <div className="flex flex-wrap items-center justify-center gap-3 px-4 py-3 border-t border-border/40">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page <= 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="gap-1"
            >
              <ChevronLeft className="w-4 h-4" /> Anterior
            </Button>
            <span className="text-xs text-muted-foreground font-mono">
              Página {page + 1} / {totalPages} · {totalCatalog} SKUs
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page + 1 >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="gap-1"
            >
              Seguinte <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}
        {isFetching && !isLoading ? (
          <div className="px-4 py-2 text-[10px] text-muted-foreground font-bold uppercase tracking-wider border-t border-border/40">
            Atualizando…
          </div>
        ) : null}
      </div>
    </div>
  );
}
