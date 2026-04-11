import { useEffect, useMemo, useState } from "react";
import {
  Gift,
  Users,
  Coins,
  Settings2,
  Target,
  Sparkles,
  Trophy,
  Link2,
  Copy,
  ExternalLink,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { useAuth } from "@/hooks/useAuth";
import {
  useLoyaltyDashboard,
  useLoyaltyTransactions,
  useUpdateLoyaltyProfile,
  fetchLoyaltyTransactionsForExport,
  LOYALTY_TX_PAGE_SIZE,
} from "@/hooks/useLoyalty";
import { useToast } from "@/hooks/use-toast";
import { hasFullLoyaltyPlan } from "@/lib/loyalty-access";
import {
  isValidLoyaltySlug,
  loyaltyReasonLabel,
  loyaltyTierLabel,
  normalizeLoyaltySlug,
} from "@/lib/loyalty-labels";

function formatInt(n: number): string {
  return new Intl.NumberFormat("pt-BR").format(Math.round(n));
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function csvEscape(s: string): string {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function dominantTier(tierCounts: Record<string, number>): string {
  let best = "bronze";
  let max = -1;
  for (const [k, v] of Object.entries(tierCounts)) {
    if (v > max) {
      max = v;
      best = k;
    }
  }
  return best;
}

export default function Fidelidade() {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const canEdit = hasFullLoyaltyPlan(profile?.plan);

  const [rewardsStoreId, setRewardsStoreId] = useState<string | null>(null);
  const dashboard = useLoyaltyDashboard(rewardsStoreId);

  useEffect(() => {
    const ids = dashboard.data?.storeIds ?? [];
    if (!ids.length) return;
    if (rewardsStoreId && ids.includes(rewardsStoreId)) return;
    setRewardsStoreId(ids[0] ?? null);
  }, [dashboard.data?.storeIds, rewardsStoreId]);
  const [txPage, setTxPage] = useState(0);
  const txQuery = useLoyaltyTransactions(txPage);
  const updateProfile = useUpdateLoyaltyProfile();

  const [configOpen, setConfigOpen] = useState(false);
  const [formName, setFormName] = useState("");
  const [formSlug, setFormSlug] = useState("");
  const [formPpr, setFormPpr] = useState("1");
  const [formTtl, setFormTtl] = useState<string>("");
  const [exportBusy, setExportBusy] = useState(false);

  const p = dashboard.data?.profile;
  const programEnabled = p?.loyalty_program_enabled !== false;

  useEffect(() => {
    if (!configOpen || !dashboard.data?.profile) return;
    const pr = dashboard.data.profile;
    setFormName(pr.loyalty_program_name ?? "");
    setFormSlug(pr.loyalty_slug ?? "");
    setFormPpr(pr.points_per_real != null && pr.points_per_real > 0 ? String(pr.points_per_real) : "1");
    setFormTtl(
      pr.loyalty_points_ttl_days == null ? "" : String(pr.loyalty_points_ttl_days),
    );
  }, [configOpen, dashboard.data?.profile]);

  const portalUrl = useMemo(() => {
    const slug = p?.loyalty_slug?.trim();
    if (!slug || typeof window === "undefined") return "";
    return `${window.location.origin}/pontos/${slug}`;
  }, [p?.loyalty_slug]);

  async function copyPortalLink() {
    if (!portalUrl) {
      toast({
        title: "Defina um slug",
        description: "Configure um endereço único em “Configurar programa”.",
        variant: "destructive",
      });
      return;
    }
    try {
      await navigator.clipboard.writeText(portalUrl);
      toast({ title: "Link copiado" });
    } catch {
      toast({ title: "Não foi possível copiar", variant: "destructive" });
    }
  }

  async function handleExportCsv() {
    if (!user?.id) return;
    setExportBusy(true);
    try {
      const rows = await fetchLoyaltyTransactionsForExport(user.id, 2000);
      const header = ["data", "cliente", "telefone", "pontos", "motivo", "descricao", "referencia"];
      const lines = [
        header.join(","),
        ...rows.map((r) =>
          [
            csvEscape(r.created_at),
            csvEscape(r.contactName),
            csvEscape(r.contactPhone),
            String(r.points),
            csvEscape(loyaltyReasonLabel(r.reason)),
            csvEscape(r.description ?? ""),
            csvEscape(r.reference_id ?? ""),
          ].join(","),
        ),
      ];
      const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "fidelidade-transacoes.csv";
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "CSV exportado", description: `${rows.length} linhas (máx. 2000).` });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro desconhecido";
      toast({ title: "Erro ao exportar", description: msg, variant: "destructive" });
    } finally {
      setExportBusy(false);
    }
  }

  function saveProgramSettings() {
    const slug = normalizeLoyaltySlug(formSlug);
    if (slug && !isValidLoyaltySlug(slug)) {
      toast({
        title: "Slug inválido",
        description: "Use 3 a 40 caracteres: letras minúsculas, números e hífen (sem começar/terminar com hífen).",
        variant: "destructive",
      });
      return;
    }
    const ppr = parseFloat(formPpr.replace(",", "."));
    if (!Number.isFinite(ppr) || ppr <= 0 || ppr > 500) {
      toast({
        title: "Pontos por real inválido",
        description: "Informe um número entre 0,01 e 500.",
        variant: "destructive",
      });
      return;
    }
    const ttl =
      formTtl === "" ? null : Number.parseInt(formTtl, 10);
    if (formTtl !== "" && (ttl == null || !Number.isFinite(ttl) || ttl < 1 || ttl > 730)) {
      toast({ title: "Validade inválida", description: "Use entre 1 e 730 dias ou deixe em branco.", variant: "destructive" });
      return;
    }

    updateProfile.mutate(
      {
        loyalty_program_name: formName.trim() || null,
        loyalty_slug: slug || null,
        points_per_real: ppr,
        loyalty_points_ttl_days: ttl,
      },
      {
        onSuccess: () => {
          toast({ title: "Programa salvo" });
          setConfigOpen(false);
        },
        onError: (err: unknown) => {
          const code =
            typeof err === "object" && err !== null && "code" in err ? String((err as { code: string }).code) : "";
          if (code === "23505") {
            toast({ title: "Slug já em uso", description: "Escolha outro endereço único.", variant: "destructive" });
            return;
          }
          const msg = err instanceof Error ? err.message : "Tente novamente.";
          toast({ title: "Erro ao salvar", description: msg, variant: "destructive" });
        },
      },
    );
  }

  function toggleProgram(v: boolean) {
    updateProfile.mutate(
      { loyalty_program_enabled: v },
      {
        onSuccess: () => toast({ title: v ? "Programa ativado" : "Programa pausado" }),
        onError: (e: unknown) =>
          toast({
            title: "Erro ao atualizar",
            description: e instanceof Error ? e.message : "Tente novamente.",
            variant: "destructive",
          }),
      },
    );
  }

  const tierTop = dashboard.data ? dominantTier(dashboard.data.tierCounts) : "bronze";
  const previewPoints =
    dashboard.data && dashboard.data.membersWithBalance > 0
      ? Math.max(0, Math.round(dashboard.data.totalPointsBalance / dashboard.data.membersWithBalance))
      : 0;

  const totalPages = txQuery.data ? Math.max(1, Math.ceil(txQuery.data.total / LOYALTY_TX_PAGE_SIZE)) : 1;

  if (dashboard.isLoading) {
    return (
      <div className="space-y-8 pb-10">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <Skeleton className="h-10 w-64" />
          <div className="flex gap-2">
            <Skeleton className="h-10 w-36" />
            <Skeleton className="h-10 w-40" />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-[2rem]" />
      </div>
    );
  }

  if (dashboard.isError) {
    return (
      <div className="space-y-6 pb-10">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Erro ao carregar fidelidade</AlertTitle>
          <AlertDescription className="flex flex-col sm:flex-row sm:items-center gap-3 mt-2">
            <span>{dashboard.error instanceof Error ? dashboard.error.message : "Tente novamente."}</span>
            <Button variant="outline" size="sm" onClick={() => dashboard.refetch()}>
              Tentar de novo
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Com `enabled: !!user?.id`, o React Query pode não ter `data` (query desativada / transição);
  // nunca aceder a `dashboard.data` sem verificar.
  if (!dashboard.data) {
    return (
      <div className="space-y-8 pb-10">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <Skeleton className="h-10 w-64" />
          <div className="flex gap-2">
            <Skeleton className="h-10 w-36" />
            <Skeleton className="h-10 w-40" />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-[2rem]" />
      </div>
    );
  }

  const d = dashboard.data;

  return (
    <div className="space-y-8 pb-10">
      {!canEdit && (
        <Alert>
          <Trophy className="h-4 w-4" />
          <AlertTitle>Plano Starter</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-x-3 gap-y-2 mt-1">
            <span>Programa de fidelidade completo está nos planos Growth e Scale.</span>
            <Button asChild size="sm" variant="secondary" className="font-bold rounded-lg">
              <Link to="/dashboard/planos">Ver planos</Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black font-syne tracking-tighter uppercase">Fidelidade</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Pontos, tiers e portal do cliente, ligados às tabelas de fidelidade e transações no Supabase.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(dashboard.data?.storesBrief?.length ?? 0) > 1 && (
            <Select
              value={rewardsStoreId ?? dashboard.data?.storesBrief?.[0]?.id ?? ""}
              onValueChange={(v) => setRewardsStoreId(v)}
            >
              <SelectTrigger className="w-[220px] h-10 rounded-xl font-semibold text-xs" aria-label="Loja do catálogo de recompensas">
                <SelectValue placeholder="Loja" />
              </SelectTrigger>
              <SelectContent>
                {(dashboard.data?.storesBrief ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name?.trim() || s.id.slice(0, 8)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button
            variant="outline"
            className="font-bold gap-2 rounded-xl border-2"
            disabled={!canEdit}
            onClick={() => setConfigOpen(true)}
          >
            <Settings2 className="w-4 h-4" /> Configurar programa
          </Button>
          <Button
            variant="outline"
            className="font-bold gap-2 rounded-xl border-2"
            onClick={copyPortalLink}
            disabled={!portalUrl}
          >
            <Copy className="w-4 h-4" /> Copiar link do portal
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          label="Membros com saldo"
          value={formatInt(d.membersWithBalance)}
          icon={Users}
          tooltip="Contatos com pontos disponíveis > 0"
        />
        <MetricCard
          label="Pontos em circulação"
          value={formatInt(d.totalPointsBalance)}
          icon={Coins}
          tooltip="Soma do saldo atual de todos os contatos"
        />
        <MetricCard
          label="Pontos ganhos (total)"
          value={formatInt(d.totalEarnedSum)}
          icon={Target}
        />
        <MetricCard
          label="Pontos resgatados (total)"
          value={formatInt(d.totalRedeemedSum)}
          icon={Gift}
          className="border-emerald-500/30 bg-emerald-500/[0.02]"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-card/50 backdrop-blur-sm border-2 border-border/50 rounded-[2rem] p-8 lg:col-span-2 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full -mr-32 -mt-32 blur-3xl group-hover:bg-emerald-500/10 transition-all duration-1000" />

          <div className="relative z-10 space-y-8">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <h3 className="font-black font-syne text-lg tracking-tighter uppercase flex items-center gap-2">
                <Target className="w-5 h-5 text-emerald-500" /> Programa de pontos
              </h3>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
                  {programEnabled ? "Ativo" : "Pausado"}
                </span>
                <Switch
                  checked={programEnabled}
                  disabled={!canEdit || updateProfile.isPending}
                  onCheckedChange={toggleProgram}
                />
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60 mb-1">
                    Nome do programa
                  </p>
                  <p className="text-lg font-black font-syne tracking-tight">
                    {d.profile?.loyalty_program_name?.trim() || "Programa de fidelidade"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60 mb-1">
                    Pontos por R$ 1 em compras
                  </p>
                  <p className="text-2xl font-black font-mono text-emerald-500">
                    {d.profile?.points_per_real != null && d.profile.points_per_real > 0
                      ? d.profile.points_per_real
                      : 1}
                  </p>
                  <p className="text-[10px] text-muted-foreground/60 leading-relaxed mt-1">
                    Crédito de pontos costuma ser disparado por automações e integrações (ex.: pós-compra).
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60 mb-2">
                    Validade (referência no painel)
                  </p>
                  <p className="text-sm font-bold">
                    {d.profile?.loyalty_points_ttl_days != null
                      ? `${d.profile.loyalty_points_ttl_days} dias`
                      : "Não definido"}
                  </p>
                </div>
              </div>

              <div className="bg-background/40 rounded-3xl p-6 border border-border/20">
                <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-3">
                  Distribuição por tier
                </p>
                <div className="space-y-2">
                  {["bronze", "silver", "gold", "diamond"].map((t) => (
                    <div key={t} className="flex items-center justify-between text-sm">
                      <span className="font-bold text-muted-foreground">{loyaltyTierLabel(t)}</span>
                      <span className="font-mono font-black">{formatInt(d.tierCounts[t] ?? 0)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {portalUrl && (
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/40">
                <Link2 className="w-4 h-4 text-muted-foreground shrink-0" />
                <a
                  href={portalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-mono text-primary hover:underline break-all"
                >
                  {portalUrl}
                </a>
                <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8" asChild>
                  <a href={portalUrl} target="_blank" rel="noopener noreferrer" aria-label="Abrir portal">
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </Button>
              </div>
            )}
          </div>
        </div>

        <div className="bg-[#0A0A0F] border-2 border-[#1E1E2E] rounded-[2rem] p-8 relative overflow-hidden flex flex-col group">
          <div className="absolute top-0 right-0 p-6 opacity-20 group-hover:scale-110 transition-transform duration-1000">
            <Sparkles className="w-16 h-16 text-emerald-500" />
          </div>
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/40 mb-6">
            Prévia do cliente (portal)
          </span>

          <div className="bg-background/80 backdrop-blur-xl border-2 border-emerald-500/20 rounded-[2.5rem] p-6 space-y-6 shadow-2xl mt-auto self-center w-full max-w-[280px] transform rotate-1 group-hover:rotate-0 transition-all duration-700">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-emerald-600 rounded-xl flex items-center justify-center font-black text-[12px] text-white italic shadow-lg shadow-emerald-900/40">
                  {(d.profile?.loyalty_program_name ?? "L").slice(0, 1).toUpperCase()}
                </div>
                <span className="text-[11px] font-black tracking-tighter uppercase truncate max-w-[140px]">
                  {d.profile?.loyalty_program_name?.trim() || "Sua marca"}
                </span>
              </div>
              <Badge variant="outline" className="text-[8px] font-black h-4 border-emerald-500/30 text-emerald-500 px-2 tracking-widest">
                {loyaltyTierLabel(tierTop).toUpperCase()}
              </Badge>
            </div>

            <div className="space-y-1">
              <p className="text-[9px] text-muted-foreground/60 font-black uppercase tracking-widest">Saldo de pontos (média)</p>
              <div className="flex items-center gap-2">
                <Coins className="w-5 h-5 text-emerald-500" />
                <span className="text-2xl font-black font-mono tracking-tighter">{formatInt(previewPoints)}</span>
              </div>
            </div>

            <p className="text-[9px] text-muted-foreground/70 leading-relaxed">
              O cliente consulta pelo telefone em `/pontos/seu-slug`.
            </p>
          </div>

          <p className="text-[10px] text-muted-foreground/40 text-center mt-8 italic px-2 font-medium leading-relaxed">
            Os tiers seguem os marcos do portal: 500 / 1500 / 5000 pontos ganhos no histórico.
          </p>
        </div>
      </div>

      {d.rewards.length > 0 && (
        <div className="bg-card/30 backdrop-blur-sm border-2 border-border/50 rounded-[2rem] overflow-hidden">
          <div className="p-6 border-b border-border/50">
            <h3 className="font-black font-syne text-sm uppercase tracking-tighter text-muted-foreground flex items-center gap-2">
              <Gift className="w-4 h-4" /> Recompensas (catálogo)
            </h3>
          </div>
          <div className="divide-y divide-border/30">
            {d.rewards.map((rw) => (
              <div key={rw.id} className="px-8 py-4 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-black text-sm">{rw.nome}</p>
                  {rw.descricao && (
                    <p className="text-xs text-muted-foreground mt-0.5">{rw.descricao}</p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="secondary" className="font-mono">
                    {formatInt(rw.custo_pontos)} pts
                  </Badge>
                  <Badge className={cn(rw.ativo ? "bg-emerald-500/15 text-emerald-600" : "bg-muted")}>
                    {rw.ativo ? "Ativo" : "Inativo"}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-card/30 backdrop-blur-sm border-2 border-border/50 rounded-[2rem] overflow-hidden">
        <div className="p-6 border-b border-border/50 flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-black font-syne text-sm uppercase tracking-tighter text-muted-foreground flex items-center gap-2">
            <Gift className="w-4 h-4" /> Histórico de pontos
          </h3>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="text-[10px] font-black uppercase tracking-widest text-primary"
              disabled={exportBusy || (txQuery.data?.total === 0 && !txQuery.isLoading)}
              onClick={handleExportCsv}
            >
              {exportBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Exportar CSV
            </Button>
          </div>
        </div>

        {txQuery.isLoading ? (
          <div className="p-8 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : txQuery.isError ? (
          <div className="p-8 text-center text-sm text-destructive">
            {txQuery.error instanceof Error ? txQuery.error.message : "Erro ao carregar transações"}
            <Button variant="outline" size="sm" className="mt-3" onClick={() => txQuery.refetch()}>
              Tentar de novo
            </Button>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[640px]">
                <thead>
                  <tr className="bg-muted/30 border-b border-border/50">
                    <th className="px-6 md:px-8 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">
                      Cliente
                    </th>
                    <th className="px-6 md:px-8 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">
                      Pontos
                    </th>
                    <th className="px-6 md:px-8 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">
                      Motivo
                    </th>
                    <th className="px-6 md:px-8 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">
                      Data
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {txQuery.data!.rows.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-8 py-12 text-center text-muted-foreground text-sm">
                        Nenhuma movimentação ainda. Pontos entram via automações, campanhas ou ajustes manuais.
                        {canEdit && (
                          <>
                            {" "}
                            <Link to="/dashboard/campanhas" className="text-primary font-bold underline-offset-2 hover:underline">
                              Ir para campanhas
                            </Link>
                          </>
                        )}
                      </td>
                    </tr>
                  ) : (
                    txQuery.data!.rows.map((r) => (
                      <tr key={r.id} className="border-b border-border/20 hover:bg-primary/[0.02] transition-colors">
                        <td className="px-6 md:px-8 py-4">
                          <div className="font-black text-sm tracking-tight">{r.contactName}</div>
                          <div className="text-[11px] text-muted-foreground font-mono">{r.contactPhone}</div>
                        </td>
                        <td className="px-6 md:px-8 py-4">
                          <span
                            className={cn(
                              "text-sm font-mono font-black",
                              r.points >= 0 ? "text-emerald-500" : "text-amber-600",
                            )}
                          >
                            {r.points >= 0 ? "+" : ""}
                            {formatInt(r.points)}
                          </span>
                        </td>
                        <td className="px-6 md:px-8 py-4 text-xs font-bold text-muted-foreground">
                          {loyaltyReasonLabel(r.reason)}
                          {r.description && (
                            <div className="text-[10px] font-normal mt-1 line-clamp-2">{r.description}</div>
                          )}
                        </td>
                        <td className="px-6 md:px-8 py-4 text-xs font-mono text-muted-foreground whitespace-nowrap">
                          {formatDate(r.created_at)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {txQuery.data!.total > LOYALTY_TX_PAGE_SIZE && (
              <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-t border-border/40">
                <p className="text-xs text-muted-foreground">
                  Página {txPage + 1} de {totalPages} — {txQuery.data!.total} registros
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={txPage <= 0}
                    onClick={() => setTxPage((p) => Math.max(0, p - 1))}
                  >
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={txPage >= totalPages - 1}
                    onClick={() => setTxPage((p) => p + 1)}
                  >
                    Próxima
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <Dialog open={configOpen} onOpenChange={setConfigOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-syne">Configurar programa</DialogTitle>
            <DialogDescription>
              Slug público, nome e regra de pontos (por R$ 1). Alterações valem para o portal e campanhas.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="loy-name">Nome do programa</Label>
              <Input
                id="loy-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Ex.: Clube VIP"
                disabled={!canEdit}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="loy-slug">Slug do portal (URL)</Label>
              <Input
                id="loy-slug"
                value={formSlug}
                onChange={(e) => setFormSlug(e.target.value.toLowerCase())}
                placeholder="minha-loja"
                disabled={!canEdit}
              />
              <p className="text-[11px] text-muted-foreground">Ficará em /pontos/seu-slug</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="loy-ppr">Pontos por R$ 1 em compra</Label>
              <Input
                id="loy-ppr"
                type="number"
                step="0.01"
                min={0.01}
                max={500}
                value={formPpr}
                onChange={(e) => setFormPpr(e.target.value)}
                disabled={!canEdit}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="loy-ttl">Validade de referência (dias)</Label>
              <select
                id="loy-ttl"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={formTtl}
                onChange={(e) => setFormTtl(e.target.value)}
                disabled={!canEdit}
              >
                <option value="">Não definido</option>
                <option value="30">30 dias</option>
                <option value="60">60 dias</option>
                <option value="90">90 dias</option>
              </select>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setConfigOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={saveProgramSettings} disabled={!canEdit || updateProfile.isPending}>
              {updateProfile.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
