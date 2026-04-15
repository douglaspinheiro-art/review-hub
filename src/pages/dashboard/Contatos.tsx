import { cn } from "@/lib/utils";
import type { Database } from "@/integrations/supabase/types";
import {
  Search,
  MessageCircle,
  Mail,
  Phone,
  RefreshCw,
  Download,
  Tag,
  Calendar,
  ChevronLeft,
  ChevronRight,
  UserPlus,
  ArrowRight,
  DatabaseZap,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { useAuth } from "@/hooks/useAuth";
import { useContacts, useRfmReportCounts, type RfmReportCounts } from "@/hooks/useDashboard";
import { useStoreScopeOptional } from "@/contexts/StoreScopeContext";
import { supabase } from "@/lib/supabase";
import { trackMoatEvent } from "@/lib/moat-telemetry";
import { computeRfmSampleContext } from "@/lib/rfm-classify";
import { isValidRfmQuerySegment, type RfmEnglishSegment } from "@/lib/rfm-segments";
import { downloadContactsCsv } from "@/lib/contact-export-helper";
import { PAGE_SIZE_CONTACTS as PAGE_SIZE } from "@/lib/pagination-constants";

type CustomerRow = Database["public"]["Tables"]["customers_v3"]["Row"];

const RFM_REPORT_CARDS: { key: keyof RfmReportCounts; label: string }[] = [
  { key: "champions", label: "Campeões" },
  { key: "loyal", label: "Fiéis" },
  { key: "promising", label: "Promissores" },
  { key: "new", label: "Novos" },
  { key: "at_risk", label: "Em risco" },
  { key: "lost", label: "Perdidos" },
];

export default function Contatos() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const rfmQuery = searchParams.get("rfm");
  const rfmFilter = isValidRfmQuerySegment(rfmQuery) ? (rfmQuery as RfmEnglishSegment) : null;

  const { user } = useAuth();
  const scope = useStoreScopeOptional();
  const storeId = scope?.activeStoreId ?? null;

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [cursorIdx, setCursorIdx] = useState(0);
  const [cursors, setCursorList] = useState<Array<string | null>>([null]);
  const [fullExportLoading, setFullExportLoading] = useState(false);
  const [lgpdExportOpen, setLgpdExportOpen] = useState(false);

  useEffect(() => {
    const h = setTimeout(() => setDebouncedSearch(search.trim()), 400);
    return () => clearTimeout(h);
  }, [search]);

  useEffect(() => {
    setCursorIdx(0);
    setCursorList([null]);
  }, [debouncedSearch, rfmFilter, storeId]);

  const { data: contactsResult, isLoading, isFetching, error: listError } = useContacts({
    variant: "list",
    pageSize: PAGE_SIZE,
    search: debouncedSearch,
    rfmSegment: rfmFilter ?? undefined,
    cursor: cursors[cursorIdx],
  });

  const rfmReport = contactsResult?.rfmReport;
  const rfmReportLoading = isLoading;

  const contacts = useMemo(() => contactsResult?.contacts ?? [], [contactsResult?.contacts]);
  const totalCount = contactsResult?.totalCount ?? 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const hasListFilters = Boolean(debouncedSearch) || Boolean(rfmFilter);

  const rfmCtx = useMemo(() => computeRfmSampleContext(contacts), [contacts]);

  const handleRefresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["contacts", user?.id ?? null] });
    toast.success("Atualizando lista…");
  }, [queryClient, user?.id]);

  const runFullExport = useCallback(async () => {
    // Guard: prevent concurrent export requests (button is also disabled in UI,
    // but this defends against programmatic double-invocation).
    if (fullExportLoading) return;
    setFullExportLoading(true);
    const toastId = toast.loading("Gerando exportação completa…");

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error("Sessão expirada. Faça login novamente.");

      const params = new URLSearchParams();
      if (rfmFilter) params.set("rfm", rfmFilter);
      if (debouncedSearch) params.set("search", debouncedSearch);
      const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/export-contacts${params.size > 0 ? `?${params.toString()}` : ""}`;

      // AbortSignal.timeout() is simpler and avoids the clearTimeout race condition
      // that occurs when fetch resolves just before the manual timeout fires.
      const res = await fetch(fnUrl, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(120_000),
      });

      if (!res.ok) {
        if (res.status === 429) throw new Error("Limite de 3 exportações/hora atingido. Aguarde antes de exportar novamente.");
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body?.error ?? `Erro ${res.status}`);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `contatos-completo-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 150);

      toast.success("Exportação concluída", { id: toastId });
      void trackMoatEvent("full_contacts_export_completed", {
        has_search: Boolean(debouncedSearch),
        has_rfm_filter: Boolean(rfmFilter),
      });
    } catch (err) {
      const msg =
        (err as Error).name === "AbortError" || (err as Error).name === "TimeoutError"
          ? "A exportação demorou demais (limite 120s). Tente filtrar a base."
          : (err as Error).message;
      toast.error(`Falha na exportação: ${msg}`, { id: toastId });
    } finally {
      setFullExportLoading(false);
    }
  }, [debouncedSearch, rfmFilter, fullExportLoading]);

  const clearFilters = () => {
    setSearch("");
    navigate("/dashboard/contatos");
  };

  const showEmptyResults = !isLoading && contacts.length === 0 && hasListFilters;

  if (isLoading && contactsResult === undefined) {
    return (
      <div className="space-y-6" aria-busy="true">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-4 w-72" />
          </div>
          <Skeleton className="h-10 w-32 rounded-xl" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4 p-4 border rounded-t-xl bg-card/30">
            <Skeleton className="h-10 w-64 rounded-lg" />
            <Skeleton className="h-4 w-32" />
          </div>
          <TableSkeleton columns={5} rows={10} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-10">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Contatos</h1>
          <p className="text-sm text-muted-foreground">Base de clientes com busca e paginação no servidor.</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
            Os cartões de segmento mostram <strong className="text-foreground">contagens da base completa</strong> (calculadas periodicamente no banco). A tabela mostra a <strong className="text-foreground">classificação em tempo real</strong> baseada no comportamento atual.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="text-xs font-bold bg-muted/30">
            {totalCount.toLocaleString("pt-BR")} na base
          </Badge>
          <Button type="button" variant="outline" size="sm" className="gap-1 h-9 rounded-xl" onClick={() => handleRefresh()} disabled={isFetching}>
            <RefreshCw className={cn("w-3.5 h-3.5", isFetching && "animate-spin")} />
            Atualizar
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1 h-9 rounded-xl"
            onClick={() => void runFullExport()}
            disabled={fullExportLoading}
          >
            <DatabaseZap className={cn("w-3.5 h-3.5", fullExportLoading && "animate-pulse")} />
            {fullExportLoading ? "Exportando…" : "Exportar base completa"}
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-black">Segmentos (base completa)</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
          {RFM_REPORT_CARDS.map(({ key, label }) => {
            const count = rfmReport ? rfmReport[key] : null;
            return (
              <button
                key={key}
                type="button"
                disabled={rfmReportLoading}
                onClick={() => navigate(`/dashboard/contatos?rfm=${key}`)}
                className={cn(
                  "border rounded-xl p-3 bg-card text-left transition-all hover:bg-muted/50 hover:scale-[1.02]",
                  rfmFilter === key && "ring-2 ring-primary border-primary/20 bg-primary/5",
                  rfmReportLoading && "opacity-70",
                )}
              >
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">{label}</p>
                {rfmReportLoading ? (
                  <Skeleton className="h-7 w-12 mt-1" />
                ) : (
                  <p className="text-lg font-black mt-1">{(count ?? 0).toLocaleString("pt-BR")}</p>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="bg-card border rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4 border-b bg-muted/10 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative max-w-sm w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Nome, email ou telefone..."
              className="pl-9 h-10 rounded-xl"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-3">
            <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground">
              Página {cursorIdx + 1} de {Math.max(1, totalPages)}
            </p>
            {isFetching && <RefreshCw className="w-3 h-3 animate-spin text-primary" />}
          </div>
        </div>

        <div className="divide-y divide-border/50">
          {showEmptyResults && (
            <div className="p-12 text-center space-y-3 bg-muted/5">
              <p className="text-sm text-muted-foreground">
                Nenhum resultado para os filtros atuais.
              </p>
              <Button type="button" variant="outline" size="sm" onClick={clearFilters} className="rounded-xl font-bold">
                Limpar busca e filtros
              </Button>
            </div>
          )}
          {!showEmptyResults &&
            contacts.map((c) => {
              const effectiveSeg = rfmCtx.segmentOf(c);
              const lastPurchase = c.last_purchase_at
                ? format(new Date(c.last_purchase_at), "dd/MM/yyyy", { locale: ptBR })
                : null;
              return (
                <div
                  key={c.id}
                  className="p-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4 hover:bg-muted/30 transition-colors"
                >
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <p className="font-bold truncate text-sm">{c.name || "Sem nome"}</p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {c.phone && (
                        <span className="inline-flex items-center gap-1 font-mono">
                          <Phone className="w-3 h-3" />
                          {c.phone}
                        </span>
                      )}
                      {c.email && (
                        <span className="inline-flex items-center gap-1">
                          <Mail className="w-3 h-3" />
                          {c.email}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      <Badge variant="outline" className="text-[9px] uppercase font-black tracking-widest border-primary/20 text-primary bg-primary/5">
                        {effectiveSeg.replaceAll("_", " ")}
                      </Badge>
                      {c.tags && (c.tags as string[]).slice(0, 3).map(t => (
                        <Badge key={t} variant="secondary" className="text-[9px] uppercase font-bold tracking-widest">
                          {t}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <div className="text-right">
                      <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground">Última Compra</p>
                      <p className="text-xs font-bold">{lastPurchase || "Nunca"}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-lg hover:bg-primary/10 hover:text-primary" asChild>
                        <a href={`https://wa.me/${c.phone}`} target="_blank" rel="noreferrer">
                          <MessageCircle className="w-4 h-4" />
                        </a>
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8 gap-1.5 rounded-lg px-2 text-[10px] font-black uppercase tracking-widest" onClick={() => navigate(`/dashboard/inbox?q=${encodeURIComponent(c.phone || c.name || "")}`)}>
                        Abrir Inbox <ArrowRight className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
        </div>

        {totalPages > 1 && (
          <div className="p-4 border-t bg-muted/5 flex items-center justify-center gap-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 rounded-xl font-bold"
              disabled={cursorIdx === 0 || isFetching}
              onClick={() => setCursorIdx((i) => i - 1)}
            >
              <ChevronLeft className="w-4 h-4 mr-1" /> Anterior
            </Button>
            <span className="text-[10px] font-black uppercase tracking-widest">
              Página {cursorIdx + 1} de {totalPages}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 rounded-xl font-bold"
              disabled={cursorIdx >= totalPages - 1 || isFetching || !contactsResult?.nextCursor}
              onClick={() => {
                if (contactsResult?.nextCursor && !cursors[cursorIdx + 1]) {
                  setCursorList((prev) => {
                    const next = [...prev];
                    next[cursorIdx + 1] = contactsResult.nextCursor;
                    return next;
                  });
                }
                setCursorIdx((i) => i + 1);
              }}
            >
              Próxima <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
