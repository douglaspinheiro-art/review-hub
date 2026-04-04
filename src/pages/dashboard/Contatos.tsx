import { useState } from "react";
import { 
  Users, Search, Filter, Download, MoreHorizontal, 
  Mail, MessageCircle, Phone, Calendar, ShoppingBag,
  TrendingUp, Award, X, Smartphone, Monitor, Globe,
  ArrowUpRight, Heart, Shield, ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { mockClienteDestaque } from "@/lib/mock-data";

export default function Contatos() {
  const [selectedClient, setSelectedClient] = useState<any>(null);

  const rfmSegments = [
    { label: "Campeões", count: 124, color: "bg-emerald-500" },
    { label: "Fiéis", count: 234, color: "bg-blue-500" },
    { label: "Potencial Fiel", count: 189, color: "bg-indigo-500" },
    { label: "Novos", count: 87, color: "bg-sky-500" },
    { label: "Promissores", count: 56, color: "bg-teal-500" },
    { label: "Em Risco", count: 234, color: "bg-orange-500" },
    { label: "Hibernando", count: 145, color: "bg-amber-500" },
    { label: "Perdidos", count: 432, color: "bg-red-500" },
  ];

  return (
    <div className="space-y-8 pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black font-syne tracking-tighter uppercase">Clientes — Visão Unificada</h1>
          <p className="text-muted-foreground text-sm mt-1">Perfil 360º consolidando loja própria e marketplaces.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="font-bold gap-2 rounded-xl">
            <Download className="w-4 h-4" /> Exportar CSV
          </Button>
          <Button className="font-bold gap-2 rounded-xl">
            <Users className="w-4 h-4" /> Novo Segmento
          </Button>
        </div>
      </div>

      {/* RFM Heatmap Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        {rfmSegments.map((s) => (
          <div key={s.label} className="bg-card border rounded-xl p-3 hover:border-primary/50 transition-all cursor-pointer group">
            <div className={cn("w-full h-1 rounded-full mb-2 opacity-50 group-hover:opacity-100", s.color)} />
            <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground truncate">{s.label}</div>
            <div className="text-lg font-black font-syne">{s.count}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-card border rounded-2xl p-6">
          <h3 className="font-bold text-sm mb-4 uppercase tracking-tighter text-muted-foreground flex items-center gap-2">
            <Heart className="w-3.5 h-3.5" /> Segmentos Comportamentais
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-muted/30 rounded-xl border border-border/50">
              <div>
                <div className="text-sm font-bold">Caçadores de Desconto</div>
                <div className="text-[10px] text-muted-foreground">Só compram com cupom</div>
              </div>
              <Badge className="bg-orange-500/10 text-orange-500 border-0">234</Badge>
            </div>
            <div className="flex items-center justify-between p-3 bg-muted/30 rounded-xl border border-border/50">
              <div>
                <div className="text-sm font-bold">Compradores de Presente</div>
                <div className="text-[10px] text-muted-foreground">Datas sazonais específicas</div>
              </div>
              <Badge className="bg-indigo-500/10 text-indigo-500 border-0">89</Badge>
            </div>
          </div>
        </div>

        <div className="bg-card border rounded-2xl p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-sm uppercase tracking-tighter text-muted-foreground flex items-center gap-2">
              <TrendingUp className="w-3.5 h-3.5" /> Métricas de Base
            </h3>
          </div>
          <div className="grid grid-cols-3 gap-6">
            <div>
              <div className="text-[10px] font-bold uppercase text-muted-foreground mb-1">Únicos</div>
              <div className="text-2xl font-black font-syne">1.247</div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase text-muted-foreground mb-1">Multicanal</div>
              <div className="text-2xl font-black font-syne text-emerald-500">89 <span className="text-xs text-muted-foreground">(7.1%)</span></div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase text-muted-foreground mb-1">Risco Churn</div>
              <div className="text-2xl font-black font-syne text-red-500">234</div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-card border rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-border/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative max-w-sm w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Nome, email ou telefone..." className="pl-9 h-10 rounded-xl bg-muted/20" />
          </div>
          <Button variant="outline" size="sm" className="h-10 font-bold gap-2 rounded-xl">
            <Filter className="w-4 h-4" /> Filtros Avançados
          </Button>
        </div>

        {/* Mobile Contact Stack */}
        <div className="md:hidden divide-y divide-border/40">
          {[mockClienteDestaque].map((c, i) => (
            <div 
              key={i} 
              className="p-5 space-y-4 hover:bg-muted/10 transition-colors cursor-pointer"
              onClick={() => setSelectedClient(c)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center font-bold text-xs text-primary shadow-sm">MS</div>
                  <div>
                    <h4 className="font-bold text-sm leading-tight">{c.nome}</h4>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{c.email}</p>
                  </div>
                </div>
                <Badge variant="outline" className="text-[8px] font-black uppercase tracking-tighter border-emerald-500/30 text-emerald-500">Campeão</Badge>
              </div>

              <div className="flex items-center justify-between text-[10px] bg-muted/30 p-3 rounded-xl">
                <div className="space-y-1">
                  <span className="font-bold text-muted-foreground uppercase block">LTV Unificado</span>
                  <span className="font-black text-sm">R$ {c.ltv_total.toLocaleString('pt-BR')}</span>
                </div>
                <div className="space-y-1 text-right">
                  <span className="font-bold text-muted-foreground uppercase block">Última Compra</span>
                  <span className="font-bold">{c.ultima_compra}</span>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex gap-1.5">
                  <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center border border-border/50"><Globe className="w-3.5 h-3.5" /></div>
                  <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center border border-border/50"><ShoppingBag className="w-3.5 h-3.5" /></div>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="flex items-center gap-1 text-[9px] text-emerald-500 font-black uppercase">
                    <Award className="w-3 h-3" /> Score: {c.customer_health_score}
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-muted/30 border-b border-border/50">
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Cliente</th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">RFM / Perfil</th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Canais</th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Última Compra</th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">LTV Unificado</th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground text-right"></th>
              </tr>
            </thead>
            <tbody>
              {[mockClienteDestaque].map((c, i) => (
                <tr 
                  key={i} 
                  className="border-b border-border/40 hover:bg-muted/10 transition-colors cursor-pointer group"
                  onClick={() => setSelectedClient(c)}
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center font-bold text-xs text-primary">MS</div>
                      <div>
                        <div className="font-bold text-sm leading-none mb-1">{c.nome}</div>
                        <div className="text-[10px] text-muted-foreground">{c.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-1">
                      <Badge variant="outline" className="w-fit text-[9px] font-black uppercase tracking-tighter border-emerald-500/30 text-emerald-500">Campeão</Badge>
                      <span className="text-[10px] text-muted-foreground font-bold italic">Mobile-first</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-1.5">
                      <div className="w-6 h-6 rounded bg-muted flex items-center justify-center"><Globe className="w-3 h-3" /></div>
                      <div className="w-6 h-6 rounded bg-muted flex items-center justify-center"><ShoppingBag className="w-3 h-3" /></div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm font-bold">{c.ultima_compra}</td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-bold">R$ {c.ltv_total.toLocaleString('pt-BR')}</div>
                    <div className="text-[9px] text-emerald-500 font-black uppercase flex items-center gap-0.5">
                      <Award className="w-2.5 h-2.5" /> Score: {c.customer_health_score}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-muted-foreground group-hover:text-foreground">
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Unified Profile Side Sheet */}
      <Sheet open={!!selectedClient} onOpenChange={() => setSelectedClient(null)}>
        <SheetContent className="w-full sm:max-w-md p-0 overflow-y-auto">
          <div className="h-24 bg-gradient-to-r from-primary/20 to-indigo-500/20 relative">
            <Button 
              variant="ghost" 
              size="icon" 
              className="absolute top-4 right-4 h-8 w-8 bg-background/50 backdrop-blur rounded-full"
              onClick={() => setSelectedClient(null)}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
          <div className="px-6 -mt-10 pb-10 space-y-8">
            <div className="space-y-4">
              <div className="w-20 h-20 rounded-2xl bg-card border-4 border-background shadow-lg flex items-center justify-center text-2xl font-black text-primary">MS</div>
              <div>
                <h2 className="text-xl font-black font-syne">{selectedClient?.nome}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <Badge className="bg-emerald-500/10 text-emerald-500 border-0 text-[10px] font-bold uppercase">Campeão</Badge>
                  <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Ativo</Badge>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-muted/30 border rounded-xl p-3">
                <span className="text-[9px] font-bold uppercase text-muted-foreground block mb-1">Customer Health</span>
                <div className="text-lg font-black font-syne text-emerald-500 flex items-center gap-1.5">
                  78/100 <ArrowUpRight className="w-4 h-4" />
                </div>
              </div>
              <div className="bg-muted/30 border rounded-xl p-3">
                <span className="text-[9px] font-bold uppercase text-muted-foreground block mb-1">Risco Churn</span>
                <div className="text-lg font-black font-syne text-emerald-500">8%</div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground border-b pb-2">Compras por Canal</h3>
              <div className="space-y-2">
                {selectedClient?.compras_por_canal && Object.entries(selectedClient.compras_por_canal).map(([canal, info]: [string, any]) => (
                  <div key={canal} className="flex items-center justify-between p-3 bg-muted/20 rounded-xl">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-background flex items-center justify-center">
                        {canal === 'loja_propria' ? <Globe className="w-4 h-4" /> : <ShoppingBag className="w-4 h-4" />}
                      </div>
                      <div>
                        <div className="text-xs font-bold uppercase tracking-tight">{canal.replace('_', ' ')}</div>
                        <div className="text-[10px] text-muted-foreground">{info.pedidos} pedidos • há {info.ultima}</div>
                      </div>
                    </div>
                    <div className="text-sm font-bold">R$ {info.receita}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground border-b pb-2">Comunicação</h3>
              <div className="grid grid-cols-3 gap-2">
                <div className="flex flex-col items-center gap-2 p-3 bg-muted/20 rounded-xl">
                  <MessageCircle className="w-5 h-5 text-emerald-500" />
                  <span className="text-[9px] font-bold uppercase">WhatsApp</span>
                  <Badge variant="outline" className="text-[8px] px-1 border-emerald-500/50 text-emerald-500">OPT-IN</Badge>
                </div>
                <div className="flex flex-col items-center gap-2 p-3 bg-muted/20 rounded-xl opacity-50">
                  <Mail className="w-5 h-5" />
                  <span className="text-[9px] font-bold uppercase">Email</span>
                  <Badge variant="outline" className="text-[8px] px-1">OPT-OUT</Badge>
                </div>
                <div className="flex flex-col items-center gap-2 p-3 bg-muted/20 rounded-xl">
                  <Smartphone className="w-5 h-5 text-purple-500" />
                  <span className="text-[9px] font-bold uppercase">SMS</span>
                  <Badge variant="outline" className="text-[8px] px-1 border-purple-500/50 text-purple-500">OPT-IN</Badge>
                </div>
              </div>
            </div>

            <Button className="w-full h-12 rounded-xl font-bold gap-2">
              <MessageCircle className="w-4 h-4" /> Abrir no Inbox
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
