import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, TrendingUp, DollarSign, Save } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

type MarginRow = {
  store_id: string;
  store_name: string | null;
  messages_count: number;
  revenue_brl: number;
  cost_brl: number;
  margin_brl: number;
  margin_pct: number;
};

type PricingRow = {
  id: string;
  category: string;
  country: string;
  cost_brl: number;
  price_brl: number;
  effective_from: string;
};

function brl(n: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n ?? 0);
}

function periodRange(period: "7d" | "30d" | "90d"): { start: string; end: string } {
  const end = new Date();
  const start = new Date();
  const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
  start.setDate(end.getDate() - days);
  return { start: start.toISOString(), end: end.toISOString() };
}

export default function WhatsAppMarginTab() {
  const qc = useQueryClient();
  const [period, setPeriod] = useState<"7d" | "30d" | "90d">("30d");
  const range = useMemo(() => periodRange(period), [period]);

  const marginQuery = useQuery({
    queryKey: ["wa-admin-margin", period],
    queryFn: async (): Promise<MarginRow[]> => {
      const { data, error } = await supabase.rpc("wa_admin_margin_report", {
        p_start: range.start,
        p_end: range.end,
      });
      if (error) throw error;
      return (data ?? []) as MarginRow[];
    },
    staleTime: 60_000,
  });

  const pricingQuery = useQuery({
    queryKey: ["wa-pricing-list"],
    queryFn: async (): Promise<PricingRow[]> => {
      const { data, error } = await supabase
        .from("wa_message_pricing" as never)
        .select("id, category, country, cost_brl, price_brl, effective_from")
        .order("effective_from", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PricingRow[];
    },
    staleTime: 60_000,
  });

  const totals = useMemo(() => {
    const rows = marginQuery.data ?? [];
    const revenue = rows.reduce((s, r) => s + Number(r.revenue_brl ?? 0), 0);
    const cost = rows.reduce((s, r) => s + Number(r.cost_brl ?? 0), 0);
    const messages = rows.reduce((s, r) => s + Number(r.messages_count ?? 0), 0);
    const margin = revenue - cost;
    const pct = revenue > 0 ? (margin / revenue) * 100 : 0;
    return { revenue, cost, margin, pct, messages, stores: rows.length };
  }, [marginQuery.data]);

  return (
    <div className="space-y-6">
      {/* Header / period */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">Margem WhatsApp</h2>
          <p className="text-sm text-muted-foreground">
            Receita cobrada das lojas vs. custo Meta. Visível só para staff.
          </p>
        </div>
        <Select value={period} onValueChange={(v) => setPeriod(v as "7d" | "30d" | "90d")}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">Últimos 7 dias</SelectItem>
            <SelectItem value="30d">Últimos 30 dias</SelectItem>
            <SelectItem value="90d">Últimos 90 dias</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardHeader className="pb-2"><CardDescription>Receita</CardDescription>
          <CardTitle className="text-2xl">{brl(totals.revenue)}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Custo Meta</CardDescription>
          <CardTitle className="text-2xl">{brl(totals.cost)}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Margem</CardDescription>
          <CardTitle className={`text-2xl ${totals.margin >= 0 ? "text-emerald-500" : "text-red-500"}`}>
            {brl(totals.margin)}
          </CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Margem %</CardDescription>
          <CardTitle className="text-2xl">{totals.pct.toFixed(1)}%</CardTitle></CardHeader></Card>
      </div>

      {/* Margin table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="w-4 h-4" /> Margem por loja
          </CardTitle>
          <CardDescription>{totals.stores} lojas · {totals.messages} mensagens no período</CardDescription>
        </CardHeader>
        <CardContent>
          {marginQuery.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
              <Loader2 className="w-4 h-4 animate-spin" /> Carregando margem…
            </div>
          ) : (marginQuery.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Nenhum evento de cobrança no período. Mensagens enviadas em modo shadow aparecerão aqui.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Loja</TableHead>
                  <TableHead className="text-right">Mensagens</TableHead>
                  <TableHead className="text-right">Receita</TableHead>
                  <TableHead className="text-right">Custo Meta</TableHead>
                  <TableHead className="text-right">Margem</TableHead>
                  <TableHead className="text-right">Margem %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(marginQuery.data ?? []).map((r) => (
                  <TableRow key={r.store_id}>
                    <TableCell className="font-medium">{r.store_name ?? r.store_id.slice(0, 8)}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.messages_count}</TableCell>
                    <TableCell className="text-right tabular-nums">{brl(Number(r.revenue_brl))}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {brl(Number(r.cost_brl))}
                    </TableCell>
                    <TableCell className={`text-right tabular-nums font-semibold ${
                      Number(r.margin_brl) >= 0 ? "text-emerald-500" : "text-red-500"
                    }`}>
                      {brl(Number(r.margin_brl))}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <Badge variant={Number(r.margin_pct) >= 30 ? "default" : "secondary"}>
                        {Number(r.margin_pct).toFixed(1)}%
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pricing editor */}
      <PricingEditor pricing={pricingQuery.data ?? []} onSaved={() => {
        void qc.invalidateQueries({ queryKey: ["wa-pricing-list"] });
      }} />
    </div>
  );
}

function PricingEditor({ pricing, onSaved }: { pricing: PricingRow[]; onSaved: () => void }) {
  const [category, setCategory] = useState<"marketing" | "utility" | "authentication" | "service">("marketing");
  const [country, setCountry] = useState("BR");
  const [costBrl, setCostBrl] = useState("");
  const [priceBrl, setPriceBrl] = useState("");

  const upsert = useMutation({
    mutationFn: async () => {
      const cost = parseFloat(costBrl.replace(",", "."));
      const price = parseFloat(priceBrl.replace(",", "."));
      if (!Number.isFinite(cost) || !Number.isFinite(price)) {
        throw new Error("Valores inválidos");
      }
      const { error } = await supabase.rpc("wa_pricing_upsert", {
        p_category: category,
        p_country: country,
        p_cost_brl: cost,
        p_price_brl: price,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Preço atualizado");
      setCostBrl("");
      setPriceBrl("");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <DollarSign className="w-4 h-4" /> Tabela de preços (custo Meta + venda)
        </CardTitle>
        <CardDescription>
          Edite o custo Meta (interno) e o preço cobrado da loja por categoria.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
          <div>
            <Label className="text-xs">Categoria</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as typeof category)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="marketing">Marketing</SelectItem>
                <SelectItem value="utility">Utility</SelectItem>
                <SelectItem value="authentication">Authentication</SelectItem>
                <SelectItem value="service">Service</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">País</Label>
            <Input value={country} onChange={(e) => setCountry(e.target.value.toUpperCase())} maxLength={2} />
          </div>
          <div>
            <Label className="text-xs">Custo Meta (R$)</Label>
            <Input value={costBrl} onChange={(e) => setCostBrl(e.target.value)} placeholder="0.07" inputMode="decimal" />
          </div>
          <div>
            <Label className="text-xs">Preço venda (R$)</Label>
            <Input value={priceBrl} onChange={(e) => setPriceBrl(e.target.value)} placeholder="0.12" inputMode="decimal" />
          </div>
          <Button onClick={() => upsert.mutate()} disabled={upsert.isPending || !costBrl || !priceBrl}>
            {upsert.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span className="ml-2">Salvar</span>
          </Button>
        </div>

        {pricing.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Nenhum preço cadastrado ainda.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Categoria</TableHead>
                <TableHead>País</TableHead>
                <TableHead className="text-right">Custo Meta</TableHead>
                <TableHead className="text-right">Preço venda</TableHead>
                <TableHead className="text-right">Margem unit.</TableHead>
                <TableHead className="text-right">Vigente desde</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pricing.map((p) => {
                const m = Number(p.price_brl) - Number(p.cost_brl);
                const pct = Number(p.price_brl) > 0 ? (m / Number(p.price_brl)) * 100 : 0;
                return (
                  <TableRow key={p.id}>
                    <TableCell><Badge variant="outline">{p.category}</Badge></TableCell>
                    <TableCell>{p.country}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{brl(Number(p.cost_brl))}</TableCell>
                    <TableCell className="text-right tabular-nums">{brl(Number(p.price_brl))}</TableCell>
                    <TableCell className={`text-right tabular-nums font-semibold ${m >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                      {brl(m)} <span className="text-xs text-muted-foreground">({pct.toFixed(0)}%)</span>
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {new Date(p.effective_from).toLocaleDateString("pt-BR")}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}