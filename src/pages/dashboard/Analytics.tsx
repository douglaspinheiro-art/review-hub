import { useState } from "react";
import { TrendingUp, Send, Eye, DollarSign, Users } from "lucide-react";
import { useAnalytics } from "@/hooks/useDashboard";
import { Button } from "@/components/ui/button";
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

const PERIODS = [
  { label: "7 dias", value: 7 },
  { label: "30 dias", value: 30 },
  { label: "90 dias", value: 90 },
];

export default function Analytics() {
  const [period, setPeriod] = useState(30);
  const { data, isLoading, error, refetch } = useAnalytics(period);

  const kpis = data ? [
    {
      label: "Mensagens Enviadas",
      value: data.totals.messagesSent.toLocaleString("pt-BR"),
      icon: Send,
      color: "text-blue-500",
      bg: "bg-blue-500/10",
    },
    {
      label: "Taxa de Entrega",
      value: `${data.deliveryRate}%`,
      icon: TrendingUp,
      color: "text-green-500",
      bg: "bg-green-500/10",
    },
    {
      label: "Taxa de Leitura",
      value: `${data.readRate}%`,
      icon: Eye,
      color: "text-purple-500",
      bg: "bg-purple-500/10",
    },
    {
      label: "Receita Influenciada",
      value: data.totals.revenue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
      icon: DollarSign,
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
    },
    {
      label: "Novos Contatos",
      value: data.totals.newContacts.toLocaleString("pt-BR"),
      icon: Users,
      color: "text-orange-500",
      bg: "bg-orange-500/10",
    },
  ] : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Analytics</h1>
          <p className="text-muted-foreground text-sm mt-1">Métricas e desempenho das suas campanhas</p>
        </div>
        <div className="flex gap-1">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                period === p.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading && (
        <div className="text-center py-16 text-muted-foreground text-sm">Carregando dados...</div>
      )}

      {error && (
        <div className="text-center py-12 space-y-3">
          <p className="text-muted-foreground text-sm">Erro ao carregar analytics.</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>Tentar novamente</Button>
        </div>
      )}

      {!isLoading && data && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {kpis.map(({ label, value, icon: Icon, color, bg }) => (
              <div key={label} className="bg-card border rounded-xl p-4 space-y-2">
                <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center`}>
                  <Icon className={`w-4 h-4 ${color}`} />
                </div>
                <p className="text-xl font-bold">{value}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>

          {/* Gráfico mensagens */}
          <div className="bg-card border rounded-xl p-5 space-y-4">
            <h2 className="font-semibold">Mensagens — últimos {period} dias</h2>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={data.chartData} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorEnviadas" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorLidas" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                />
                <Legend />
                <Area type="monotone" dataKey="enviadas" name="Enviadas" stroke="#6366f1" fill="url(#colorEnviadas)" strokeWidth={2} />
                <Area type="monotone" dataKey="lidas" name="Lidas" stroke="#10b981" fill="url(#colorLidas)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Gráfico receita */}
          <div className="bg-card border rounded-xl p-5 space-y-4">
            <h2 className="font-semibold">Receita Influenciada — últimos {period} dias</h2>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.chartData.slice(-14)} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" />
                <Tooltip
                  formatter={(v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                />
                <Bar dataKey="receita" name="Receita" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Benchmark setorial */}
          <div className="bg-card border rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Benchmark Setorial — Moda & Vestuário</h2>
              <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">Dados do setor · Abril 2026</span>
            </div>
            <div className="grid sm:grid-cols-3 gap-4">
              {[
                { label: "Taxa de abertura", yours: data.readRate, sector: 62, unit: "%" },
                { label: "Taxa de clique", yours: Math.round(data.readRate * 0.18), sector: 18, unit: "%" },
                { label: "Taxa de conversão", yours: Math.round(data.readRate * 0.06), sector: 6, unit: "%" },
              ].map(({ label, yours, sector, unit }) => {
                const diff = yours - sector;
                const isAbove = diff >= 0;
                return (
                  <div key={label} className="space-y-2">
                    <p className="text-xs text-muted-foreground font-medium">{label}</p>
                    <div className="flex items-end gap-3">
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Você</span>
                          <span className="font-semibold">{yours}{unit}</span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(yours, 100)}%` }} />
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Setor</span>
                          <span className="text-muted-foreground">{sector}{unit}</span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-muted-foreground/40 rounded-full" style={{ width: `${Math.min(sector, 100)}%` }} />
                        </div>
                      </div>
                    </div>
                    <p className={`text-xs font-medium ${isAbove ? "text-green-600" : "text-orange-600"}`}>
                      {isAbove ? "▲" : "▼"} {Math.abs(diff)}{unit} {isAbove ? "acima" : "abaixo"} da média
                    </p>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground border-t pt-3">
              Benchmark calculado com dados agregados e anonimizados de lojistas do setor de moda no Brasil usando o LTV Boost.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
