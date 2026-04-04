import Layout from "@/components/Layout";
import { CheckCircle, AlertCircle, XCircle, Clock } from "lucide-react";

const services = [
  { name: "API de Mensagens", status: "operational", uptime: "99.98%" },
  { name: "Painel de Controle", status: "operational", uptime: "99.95%" },
  { name: "Webhooks", status: "operational", uptime: "99.90%" },
  { name: "Campanhas e Disparos", status: "operational", uptime: "99.97%" },
  { name: "Chatbot e Automação", status: "operational", uptime: "99.92%" },
  { name: "Analytics e Relatórios", status: "operational", uptime: "99.88%" },
  { name: "Integrações (Shopify, WooCommerce etc.)", status: "operational", uptime: "99.85%" },
  { name: "Importação de Contatos", status: "operational", uptime: "99.99%" },
];

const incidents: { date: string; title: string; status: "resolved" | "investigating"; desc: string }[] = [
  {
    date: "25 Mar 2025",
    title: "Lentidão em envios de campanha",
    status: "resolved",
    desc: "Entre 14h e 15h40 (BRT), campanhas em andamento apresentaram atraso médio de 8 minutos. Causa: sobrecarga temporária no worker de fila. Resolvido com escalonamento automático.",
  },
  {
    date: "10 Mar 2025",
    title: "Webhooks com atraso intermitente",
    status: "resolved",
    desc: "Alguns eventos de entrega de mensagem foram entregues com atraso de até 3 minutos entre 09h e 09h30. Causa identificada e corrigida na infraestrutura de mensageria.",
  },
];

const statusConfig = {
  operational: { icon: CheckCircle, label: "Operacional", color: "text-emerald-500" },
  degraded: { icon: AlertCircle, label: "Degradado", color: "text-yellow-500" },
  outage: { icon: XCircle, label: "Fora do ar", color: "text-red-500" },
};

const allOperational = services.every((s) => s.status === "operational");

export default function Status() {
  return (
    <Layout>
      {/* Status geral */}
      <section className={`py-16 ${allOperational ? "bg-emerald-50 dark:bg-emerald-950/20" : "bg-yellow-50 dark:bg-yellow-950/20"}`}>
        <div className="container mx-auto px-4 text-center max-w-2xl">
          <div className="flex items-center justify-center gap-3 mb-4">
            {allOperational ? (
              <CheckCircle className="w-10 h-10 text-emerald-500" />
            ) : (
              <AlertCircle className="w-10 h-10 text-yellow-500" />
            )}
            <h1 className="text-3xl md:text-4xl font-extrabold">
              {allOperational ? "Todos os sistemas operacionais" : "Degradação parcial"}
            </h1>
          </div>
          <p className="text-muted-foreground flex items-center justify-center gap-1.5 text-sm">
            <Clock className="w-4 h-4" />
            Última atualização: 01 Abr 2025, 10:00 BRT
          </p>
        </div>
      </section>

      {/* Serviços */}
      <section className="py-16">
        <div className="container mx-auto px-4 max-w-3xl">
          <h2 className="text-xl font-bold mb-6">Status dos serviços</h2>
          <div className="bg-card border rounded-2xl divide-y">
            {services.map((service) => {
              const cfg = statusConfig[service.status as keyof typeof statusConfig];
              const Icon = cfg.icon;
              return (
                <div key={service.name} className="flex items-center justify-between p-4">
                  <span className="text-sm font-medium">{service.name}</span>
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-muted-foreground hidden sm:block">{service.uptime} uptime (30d)</span>
                    <div className={`flex items-center gap-1.5 ${cfg.color}`}>
                      <Icon className="w-4 h-4" />
                      <span className="text-xs font-medium">{cfg.label}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Uptime geral */}
      <section className="py-8 bg-muted/30">
        <div className="container mx-auto px-4 max-w-3xl">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="bg-card border rounded-xl p-4">
              <p className="text-2xl font-extrabold text-primary">99.96%</p>
              <p className="text-xs text-muted-foreground mt-1">Uptime 30 dias</p>
            </div>
            <div className="bg-card border rounded-xl p-4">
              <p className="text-2xl font-extrabold text-primary">99.94%</p>
              <p className="text-xs text-muted-foreground mt-1">Uptime 90 dias</p>
            </div>
            <div className="bg-card border rounded-xl p-4">
              <p className="text-2xl font-extrabold text-primary">99.91%</p>
              <p className="text-xs text-muted-foreground mt-1">Uptime 365 dias</p>
            </div>
          </div>
        </div>
      </section>

      {/* Histórico de incidentes */}
      <section className="py-16">
        <div className="container mx-auto px-4 max-w-3xl">
          <h2 className="text-xl font-bold mb-6">Histórico de incidentes</h2>
          {incidents.length === 0 ? (
            <div className="bg-card border rounded-2xl p-8 text-center">
              <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
              <p className="text-muted-foreground">Nenhum incidente nos últimos 30 dias.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {incidents.map((inc) => (
                <div key={inc.title} className="bg-card border rounded-2xl p-6">
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <h3 className="font-semibold">{inc.title}</h3>
                    <span className={`flex items-center gap-1 text-xs font-medium shrink-0 ${inc.status === "resolved" ? "text-emerald-500" : "text-yellow-500"}`}>
                      {inc.status === "resolved" ? <CheckCircle className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                      {inc.status === "resolved" ? "Resolvido" : "Investigando"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">{inc.date}</p>
                  <p className="text-sm text-muted-foreground leading-relaxed">{inc.desc}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </Layout>
  );
}
