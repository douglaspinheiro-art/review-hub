import { useCallback, useEffect, useMemo, useState } from "react";
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
  Shield,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useContacts, useRfmReportCounts, type RfmReportCounts } from "@/hooks/useDashboard";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { isValidRfmQuerySegment, type RfmEnglishSegment } from "@/lib/rfm-segments";
import { computeRfmSampleContext } from "@/lib/rfm-classify";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { trackMoatEvent } from "@/lib/moat-telemetry";

/**
 * Exportação CSV: só a página actual (PAGE_SIZE). Export assíncrono da base completa = edge dedicada
 * (fila, rate limit); ver `docs/production-env-checklist.md` secção Contatos — não ligado por defeito.
 */
const RFM_COUNT_LABEL: Record<RfmEnglishSegment, string> = {
  champions: "Campeões",
  loyal: "Fiéis",
  at_risk: "Em risco",
  lost: "Perdidos",
  new: "Novos",
};

const PAGE_SIZE = 50;

type CustomerV3Row = Database["public"]["Tables"]["customers_v3"]["Row"];
const EMPTY_CONTACTS: CustomerV3Row[] = [];

const RFM_REPORT_CARDS: { key: keyof RfmReportCounts; label: string }[] = [
  { key: "champions", label: "Campeões" },
  { key: "loyal", label: "Fiéis" },
  { key: "new", label: "Novos" },
  { key: "at_risk", label: "Em risco" },
  { key: "lost", label: "Perdidos" },
];

function downloadContactsCsv(rows: CustomerV3Row[], segmentOf: (c: CustomerV3Row) => RfmEnglishSegment) {
  const header = [
    "id",
    "nome",
    "email",
    "telefone",
    "segmento_matriz",
    "segmento_banco",
    "tags",
    "ultima_compra",
    "chs",
    "opt_out_email",
    "email_hard_bounce",
    "reclamacao_email",
  ];
  const lines = rows.map((c) =>
    [
      c.id,
      `"${String(c.name ?? "").replaceAll('"', '""')}"`,
      `"${String(c.email ?? "").replaceAll('"', '""')}"`,
      `"${String(c.phone ?? "").replaceAll('"', '""')}"`,
      segmentOf(c),
      `"${String(c.rfm_segment ?? "").replaceAll('"', '""')}"`,
      `"${(c.tags ?? []).join("; ").replaceAll('"', '""')}"`,
      c.last_purchase_at ? format(new Date(c.last_purchase_at), "yyyy-MM-dd") : "",
      c.customer_health_score ?? "",
      c.unsubscribed_at ? "sim" : "",
      c.email_hard_bounce_at ? "sim" : "",
      c.email_complaint_at ? "sim" : "",
    ].join(","),
  );
  const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `contatos-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Contatos() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [lgpdExportOpen, setLgpdExportOpen] = useState(false);
  const [searchParams] = useSearchParams();
  const rfmParam = searchParams.get("rfm");
  const rfmFilter: RfmEnglishSegment | null =
    rfmParam && isValidRfmQuerySegment(rfmParam) ? rfmParam : null;

  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 320);
    return () => window.clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, rfmFilter]);

  const {
    data: contactsResult,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useContacts({
    variant: "list",
    page,
    pageSize: PAGE_SIZE,
    search: debouncedSearch,
    rfmSegment: rfmFilter,
  });

  const {
    data: rfmReport,
    isLoading: rfmReportLoading,
    isError: rfmReportError,
    refetch: refetchRfmReport,
  } = useRfmReportCounts();

  const contacts = (contactsResult?.contacts ?? EMPTY_CONTACTS) as CustomerV3Row[];
  const totalCount = contactsResult?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const hasListFilters = Boolean(debouncedSearch) || Boolean(rfmFilter);

  const rfmCtx = useMemo(() => computeRfmSampleContext(contacts), [contacts]);

  const handleRefresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["contacts", user?.id ?? null] });
    void queryClient.invalidateQueries({ queryKey: ["rfm-report-counts", user?.id ?? null] });
    void refetch();
    void refetchRfmReport();
    toast.success("Atualizando lista…");
  }, [queryClient, refetch, refetchRfmReport, user?.id]);

  const runExportCsv = useCallback(() => {
    if (contacts.length === 0) {
      toast.error("Nada para exportar nesta página.");
      return;
    }
    downloadContactsCsv(contacts, (c) => rfmCtx.segmentOf(c));
    void trackMoatEvent("contacts_csv_export", {
      rows: contacts.length,
      page,
      has_search: Boolean(debouncedSearch),
      has_rfm_filter: Boolean(rfmFilter),
    });
    toast.success("CSV exportado", {
      description: `${contacts.length} linha(s) — só esta página (${PAGE_SIZE}/pág.). Use os filtros e exporte outras páginas se precisar.`,
    });
    setLgpdExportOpen(false);
  }, [contacts, rfmCtx, page, debouncedSearch, rfmFilter]);

  const clearFilters = useCallback(() => {
    setSearch("");
    navigate("/dashboard/contatos");
  }, [navigate]);

  if (isError) {
    return (
      <div className="space-y-4 max-w-2xl">
        <h1 className="text-2xl font-bold">Contatos</h1>
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : "Não foi possível carregar os contatos."}
        </p>
        <Button type="button" variant="outline" onClick={() => void refetch()} className="gap-2">
          <RefreshCw className="w-4 h-4" />
          Tentar novamente
        </Button>
      </div>
    );
  }

  if (isLoading && contactsResult === undefined) {
    return (
      <div className="space-y-6 animate-pulse" aria-busy="true">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-4 w-72" />
          </div>
          <Skeleton className="h-6 w-24" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
        <div className="bg-card border rounded-xl p-4 space-y-3">
          <Skeleton className="h-10 max-w-sm" />
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </div>
    );
  }

  const baseEmpty = !isLoading && totalCount === 0 && !debouncedSearch && !rfmFilter;

  if (baseEmpty) {
    return (
      <div className="space-y-4 max-w-2xl">
        <h1 className="text-2xl font-bold">Contatos</h1>
        <p className="text-muted-foreground text-sm">
          Ainda não há clientes sincronizados nesta loja. Conecte seu e-commerce via integrações ou importe a base para
          enriquecer campanhas e automações.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="default" onClick={() => navigate("/dashboard/integracoes")}>
            Integrações
          </Button>
          <Button variant="outline" onClick={() => navigate("/dashboard/configuracoes")}>
            Configurações
          </Button>
        </div>
      </div>
    );
  }

  const showEmptyResults = !isLoading && contacts.length === 0;

  return (
    <div className="space-y-6">
      <AlertDialog open={lgpdExportOpen} onOpenChange={setLgpdExportOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Exportar dados pessoais (CSV)</AlertDialogTitle>
            <AlertDialogDescription className="text-left space-y-2">
              <span className="block">
                O ficheiro pode incluir <strong>nome, e-mail e telefone</strong>. Trate o ficheiro como informação confidencial,
                em conformidade com a LGPD e a política interna da sua loja.
              </span>
              <span className="block text-foreground/90">
                {totalCount === 0 && hasListFilters ? (
                  <>
                    Não há contactos nesta consulta com os filtros atuais — não é possível exportar até existirem linhas na
                    tabela.
                  </>
                ) : (
                  <>
                    Só entram na exportação os <strong>{PAGE_SIZE}</strong> contactos desta página (página {page} de{" "}
                    {totalPages}), com os filtros atuais — não é exportação da base completa.
                  </>
                )}
              </span>
              <span className="block text-muted-foreground text-xs">
                Exportação assíncrona da base completa (com rate limit) pode ser disponibilizada via API ou função dedicada
                em planos enterprise — contacte o suporte se for requisito operacional.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Cancelar</AlertDialogCancel>
            <AlertDialogAction type="button" onClick={() => runExportCsv()}>
              Concordo, exportar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Contatos</h1>
          <p className="text-sm text-muted-foreground">Base de clientes com busca e paginação no servidor.</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
            Os cartões de segmento mostram <strong className="text-foreground">contagens da base completa</strong> (campo
            RFM persistido por contacto, alinhado à Matriz RFM). A tabela mostra <strong className="text-foreground">só a
            página atual</strong> com busca e filtro de segmento no servidor — por isso os números dos cartões podem não
            coincidir com o número de linhas visíveis.
          </p>
          {rfmFilter && (
            <p className="text-xs text-muted-foreground mt-1">
              Filtro RFM no servidor (aliases de segmento no banco):{" "}
              <span className="font-medium text-foreground">{rfmFilter.replaceAll("_", " ")}</span>{" "}
              <button type="button" className="text-primary underline" onClick={() => navigate("/dashboard/contatos")}>
                limpar
              </button>
            </p>
          )}
          <p className="text-[11px] text-muted-foreground max-w-2xl mt-2">
            O CSV cobre apenas a página listada (até {PAGE_SIZE} linhas). Não há exportação automática da base inteira nesta
            versão da app.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="text-xs">
            {totalCount.toLocaleString("pt-BR")} na base
          </Badge>
          <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => void handleRefresh()} disabled={isFetching}>
            <RefreshCw className={cn("w-3.5 h-3.5", isFetching && "animate-spin")} />
            Atualizar
          </Button>
          <Button type="button" variant="secondary" size="sm" className="gap-1" onClick={() => setLgpdExportOpen(true)}>
            <Download className="w-3.5 h-3.5" />
            Exportar CSV
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Segmentos (base completa)</p>
        {rfmReportError && (
          <p className="text-xs text-amber-600 dark:text-amber-500">
            Não foi possível carregar contagens agregadas.{" "}
            <button type="button" className="underline" onClick={() => void refetchRfmReport()}>
              Tentar de novo
            </button>
          </p>
        )}
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
                  "border rounded-lg p-3 bg-card text-left transition-colors hover:bg-muted/50",
                  rfmFilter === key && "ring-2 ring-primary",
                  rfmReportLoading && "opacity-70",
                )}
              >
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
                {rfmReportLoading ? (
                  <Skeleton className="h-7 w-12 mt-1" />
                ) : (
                  <p className="text-lg font-semibold">{(count ?? 0).toLocaleString("pt-BR")}</p>
                )}
              </button>
            );
          })}
          <div className="border rounded-lg p-3 bg-card">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Outros</p>
            {rfmReportLoading ? (
              <Skeleton className="h-7 w-12 mt-1" />
            ) : (
              <p className="text-lg font-semibold">{(rfmReport?.other ?? 0).toLocaleString("pt-BR")}</p>
            )}
          </div>
        </div>
      </div>

      <div className="bg-card border rounded-xl">
        <div className="p-4 border-b flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative max-w-sm w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Nome, email ou telefone..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {totalCount === 0 && hasListFilters ? (
              <>Sem linhas nesta consulta · {PAGE_SIZE} por página{isFetching && !isLoading ? " · atualizando…" : ""}</>
            ) : (
              <>
                Página {page} de {totalPages} · {PAGE_SIZE} por página
                {isFetching && !isLoading ? " · atualizando…" : ""}
              </>
            )}
          </p>
        </div>
        <div className="divide-y">
          {showEmptyResults && (
            <div className="p-8 text-center space-y-2">
              <p className="text-sm text-muted-foreground">
                Nenhum resultado para os filtros atuais (busca ou segmento RFM).
              </p>
              <Button type="button" variant="outline" size="sm" onClick={clearFilters}>
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
              const inboxQs = c.phone
                ? `?q=${encodeURIComponent(c.phone)}`
                : c.name
                  ? `?q=${encodeURIComponent(c.name)}`
                  : "";
              return (
                <div
                  key={c.id}
                  className="p-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
                >
                  <div className="min-w-0 flex-1 space-y-2">
                    <p className="font-semibold truncate">{c.name || "Sem nome"}</p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {c.email && (
                        <span className="inline-flex items-center gap-1 min-w-0">
                          <Mail className="w-3 h-3 shrink-0" />
                          <span className="truncate">{c.email}</span>
                        </span>
                      )}
                      {c.phone && (
                        <span className="inline-flex items-center gap-1">
                          <Phone className="w-3 h-3 shrink-0" />
                          {c.phone}
                        </span>
                      )}
                      {lastPurchase && (
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="w-3 h-3 shrink-0" />
                          Última compra: {lastPurchase}
                        </span>
                      )}
                      {c.customer_health_score != null && (
                        <span className="inline-flex items-center gap-1">
                          <Shield className="w-3 h-3 shrink-0" />
                          CHS {c.customer_health_score}
                        </span>
                      )}
                    </div>
                    {c.tags && c.tags.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1 text-xs">
                        <Tag className="w-3 h-3 text-muted-foreground shrink-0" />
                        {c.tags.slice(0, 8).map((t) => (
                          <Badge key={t} variant="outline" className="text-[10px] font-normal">
                            {t}
                          </Badge>
                        ))}
                        {c.tags.length > 8 && (
                          <span className="text-muted-foreground">+{c.tags.length - 8}</span>
                        )}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-1">
                      <Badge variant="outline" className="text-[10px]">
                        Matriz: {RFM_COUNT_LABEL[effectiveSeg] ?? effectiveSeg}
                      </Badge>
                      {c.rfm_segment && (
                        <Badge variant="secondary" className="text-[10px]">
                          Banco: {c.rfm_segment}
                        </Badge>
                      )}
                      {c.unsubscribed_at && (
                        <Badge variant="destructive" className="text-[10px]">
                          Opt-out e-mail
                        </Badge>
                      )}
                      {(c.email_hard_bounce_at || c.email_complaint_at) && (
                        <Badge variant="outline" className="text-[10px] border-amber-600/50 text-amber-700 dark:text-amber-400">
                          {c.email_hard_bounce_at ? "Hard bounce" : ""}
                          {c.email_hard_bounce_at && c.email_complaint_at ? " · " : ""}
                          {c.email_complaint_at ? "Reclamação" : ""}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <Button size="sm" variant="outline" className="gap-1 shrink-0 self-start" asChild>
                    <Link to={`/dashboard/inbox${inboxQs}`}>
                      <MessageCircle className="w-3.5 h-3.5" />
                      Inbox
                    </Link>
                  </Button>
                </div>
              );
            })}
        </div>
        {!showEmptyResults && totalPages > 1 && (
          <div className="p-4 border-t flex flex-wrap items-center justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page <= 1 || isFetching}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Anterior
            </Button>
            <span className="text-xs text-muted-foreground">
              {totalCount.toLocaleString("pt-BR")} resultado(s) com os filtros atuais
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page >= totalPages || isFetching}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Próxima
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
