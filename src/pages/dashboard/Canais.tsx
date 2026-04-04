import { useState } from "react";
import { 
  Link2, Globe, ShoppingBag, Smartphone, 
  ArrowRight, Shield, AlertTriangle, RefreshCw,
  Terminal, CheckCircle2, XCircle, Clock, Eye
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { mockCanais } from "@/lib/mock-data";
import { useAuth } from "@/hooks/useAuth";
import { useWebhookLogs } from "@/hooks/useLTVBoost";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export default function Canais() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const { data: logs, isLoading: loadingLogs } = useWebhookLogs(profile?.id, isAdmin);
  const [selectedPayload, setSelectedPayload] = useState<any>(null);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "sucesso": return <CheckCircle2 className="w-3 h-3 text-emerald-500" />;
      case "erro": return <XCircle className="w-3 h-3 text-red-500" />;
      default: return <Clock className="w-3 h-3 text-amber-500" />;
    }
  };

  return (
    <div className="space-y-8 pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black font-syne tracking-tighter uppercase">Meus Canais</h1>
          <p className="text-muted-foreground text-sm mt-1">Gerencie as fontes de dados e integrações da sua loja.</p>
        </div>
        <Button variant="outline" className="font-bold gap-2 rounded-xl">
          <RefreshCw className="w-4 h-4" /> Sincronizar Tudo
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {mockCanais.map((c) => (
          <div key={c.tipo} className="bg-card border border-border/50 rounded-2xl p-6 space-y-6 shadow-sm hover:border-primary/30 transition-all group">
            <div className="flex items-start justify-between">
              <div className={cn(
                "w-12 h-12 rounded-xl flex items-center justify-center shadow-lg",
                c.tipo === 'loja_propria' ? 'bg-primary/10 text-primary' : 'bg-yellow-400 text-white'
              )}>
                {c.tipo === 'loja_propria' ? <Globe className="w-6 h-6" /> : <ShoppingBag className="w-6 h-6" />}
              </div>
              <Badge className="bg-emerald-500/10 text-emerald-500 border-0 text-[10px] font-black uppercase tracking-widest px-2 py-0.5">
                {c.status.toUpperCase()}
              </Badge>
            </div>

            <div>
              <h3 className="font-bold text-lg leading-tight">{c.nome}</h3>
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                <Clock className="w-3 h-3" /> Última sync: {c.ultima_sync}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 py-4 border-y border-border/40">
              <div>
                <span className="text-[9px] font-bold uppercase text-muted-foreground block mb-1">Pedidos</span>
                <div className="text-lg font-black font-syne">{c.pedidos}</div>
              </div>
              <div>
                <span className="text-[9px] font-bold uppercase text-muted-foreground block mb-1">Conversão</span>
                <div className="text-lg font-black font-syne text-emerald-500">{c.cvr}%</div>
              </div>
            </div>

            {c.reputacao && (
              <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3 flex items-center gap-3">
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                <div>
                  <p className="text-[10px] font-bold text-amber-500 uppercase">Atenção Reputação</p>
                  <p className="text-[10px] text-amber-200/80 leading-tight">{c.reputacao.aviso}</p>
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 h-9 text-[10px] font-black uppercase tracking-widest rounded-lg">Configurar</Button>
              <Button variant="ghost" className="h-9 w-9 p-0 rounded-lg"><ArrowRight className="w-4 h-4" /></Button>
            </div>
          </div>
        ))}

        {/* Adicionar Novo Canal */}
        <div className="border-2 border-dashed border-border/60 rounded-2xl p-6 flex flex-col items-center justify-center text-center space-y-4 hover:border-primary/40 hover:bg-primary/5 transition-all cursor-pointer group">
          <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center group-hover:bg-primary/10 transition-colors">
            <Link2 className="w-6 h-6 text-muted-foreground group-hover:text-primary transition-colors" />
          </div>
          <div>
            <h4 className="font-bold text-sm">Conectar Canal</h4>
            <p className="text-xs text-muted-foreground">Adicione Shopify, Shopee ou TikTok Shop.</p>
          </div>
        </div>
      </div>

      {/* ADMIN ONLY: DEBUG DASHBOARD */}
      {isAdmin && (
        <div className="pt-12 space-y-6">
          <div className="flex items-center gap-3 border-b border-border pb-4">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-500">
              <Terminal className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold font-syne tracking-tight">Debug de Integrações</h2>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-widest italic">Acesso restrito ao Administrador</p>
            </div>
          </div>

          <div className="bg-card border border-border/50 rounded-2xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-border/50 flex items-center justify-between bg-muted/20">
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Logs de Webhooks Recentes</h3>
              <Badge className="bg-purple-500/10 text-purple-500 border-0 text-[10px] font-black">LIVE</Badge>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-muted/10 border-b border-border/50">
                    <th className="px-6 py-3 text-[9px] font-black uppercase tracking-widest text-muted-foreground">Timestamp</th>
                    <th className="px-6 py-3 text-[9px] font-black uppercase tracking-widest text-muted-foreground">Plataforma</th>
                    <th className="px-6 py-3 text-[9px] font-black uppercase tracking-widest text-muted-foreground">Loja</th>
                    <th className="px-6 py-3 text-[9px] font-black uppercase tracking-widest text-muted-foreground">Status</th>
                    <th className="px-6 py-3 text-[9px] font-black uppercase tracking-widest text-muted-foreground text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {loadingLogs ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="animate-pulse">
                        <td colSpan={5} className="px-6 py-4 h-12 bg-muted/5"></td>
                      </tr>
                    ))
                  ) : logs?.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-xs text-muted-foreground italic font-medium">Nenhum log de webhook registrado ainda.</td>
                    </tr>
                  ) : (
                    logs?.map((log: any) => (
                      <tr key={log.id} className="hover:bg-muted/10 transition-colors">
                        <td className="px-6 py-4 text-[10px] font-mono font-bold text-muted-foreground">
                          {new Date(log.created_at).toLocaleString('pt-BR')}
                        </td>
                        <td className="px-6 py-4">
                          <Badge variant="outline" className="text-[9px] font-black uppercase border-border/60">
                            {log.plataforma}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 text-[11px] font-bold">
                          {(log.lojas as any)?.nome || 'Loja Desconhecida'}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-tighter">
                            {getStatusIcon(log.status_processamento)}
                            <span className={cn(
                              log.status_processamento === 'sucesso' ? 'text-emerald-500' : 
                              log.status_processamento === 'erro' ? 'text-red-500' : 'text-amber-500'
                            )}>
                              {log.status_processamento || 'pendente'}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-8 text-[10px] font-black uppercase tracking-tighter gap-1 hover:bg-purple-500/10 hover:text-purple-500">
                                <Eye className="w-3 h-3" /> Payload
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-2xl bg-[#0A0A0F] border-[#1E1E2E] text-white">
                              <DialogHeader>
                                <DialogTitle className="text-sm font-black uppercase tracking-widest text-purple-500">Webhook Payload — {log.plataforma}</DialogTitle>
                              </DialogHeader>
                              <div className="bg-black/50 p-4 rounded-xl border border-border/40 max-h-[400px] overflow-y-auto">
                                <pre className="text-[10px] font-mono text-emerald-400">
                                  {JSON.stringify(log.payload_bruto, null, 2)}
                                </pre>
                              </div>
                              {log.erro_mensagem && (
                                <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 text-[10px] font-bold">
                                  ERRO: {log.erro_mensagem}
                                </div>
                              )}
                            </DialogContent>
                          </Dialog>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
