import { 
  UserPlus, ShoppingCart, CreditCard, 
  RefreshCcw, Sparkles, Gift, Heart, 
  LucideIcon 
} from "lucide-react";

export type JornadaMeta = {
  slug: string;
  /** Chave estável usada por `journeys_config.tipo_jornada` e pelo `flow-engine`. */
  tipo_jornada: string;
  titulo: string;
  desc: string;
  gatilho: string;
  trigger: "new_contact" | "cart_abandoned" | "customer_inactive" | "order_delivered" | "customer_birthday" | "custom";
  icon: LucideIcon;
  color: string;
  bg: string;
  /** Rótulo curto para a métrica exibida (ex.: envios reais agregados na página). */
  kpi: string;
  defaultActive: boolean;
  fluxo: string[];
  message_template: string;
  delay_minutes: number;
  templateVars?: string;
};

/** Seed inicial de `automations` na edge `post-integration-setup` (AUTOMATION_SEED) deve refletir estes itens. */
export const JORNADAS_META: JornadaMeta[] = [
  {
    slug: "novo-cliente",
    tipo_jornada: "welcome",
    titulo: "Jornada do Novo Cliente",
    desc: "Transforme a primeira compra em recorrência.",
    gatilho: "Primeira compra finalizada",
    trigger: "new_contact",
    icon: UserPlus,
    color: "text-blue-500",
    bg: "bg-blue-500/10",
    kpi: "Mensagens enviadas",
    defaultActive: true,
    fluxo: ["WA Confirmação (D0)", "Email Rastreio (D3)", "WA Satisfação (D7)", "Email Cross-sell (D14)"],
    message_template: "Olá {{name}}! Obrigado pela sua compra. Já separamos tudo com carinho pra você 🎉",
    delay_minutes: 0,
  },
  {
    slug: "carrinho-abandonado",
    tipo_jornada: "cart_abandoned",
    titulo: "Carrinho Abandonado",
    desc: "Recupere vendas perdidas automaticamente.",
    gatilho: "Carrinho sem compra em 1h",
    trigger: "cart_abandoned",
    icon: ShoppingCart,
    color: "text-emerald-500",
    bg: "bg-emerald-500/10",
    kpi: "Mensagens enviadas",
    defaultActive: true,
    fluxo: ["WA (1h)", "Email (4h)", "SMS + Cupom (24h)"],
    message_template: "Oi {{name}}, você deixou itens no carrinho! Finalize aqui: {{magic_link}} 🛒",
    delay_minutes: 60,
    templateVars: "{{name}}, {{value}}, {{items}}, {{magic_link}}",
  },
  {
    slug: "boleto-vencido",
    tipo_jornada: "payment_pending",
    titulo: "Boleto/PIX Vencido",
    desc: "Lembrete suave para pagamentos pendentes.",
    gatilho: "Pedido aguardando pagamento",
    trigger: "custom",
    icon: CreditCard,
    color: "text-amber-500",
    bg: "bg-amber-500/10",
    kpi: "Mensagens enviadas",
    defaultActive: true,
    fluxo: ["WA (2h)", "Email (24h)", "WA Final (48h)"],
    message_template: "{{name}}, seu pedido está aguardando pagamento. Quer um link PIX direto? ⚡",
    delay_minutes: 120,
  },
  {
    slug: "reativacao",
    tipo_jornada: "reactivation",
    titulo: "Reativação Automática",
    desc: "Recupere clientes que não compram há 60 dias.",
    gatilho: "Sem compra em nenhum canal",
    trigger: "customer_inactive",
    icon: RefreshCcw,
    color: "text-purple-500",
    bg: "bg-purple-500/10",
    kpi: "Mensagens enviadas",
    defaultActive: true, // ETAPA 8: Set to true
    fluxo: ["Email Saudade (D60)", "WA Oferta (D65)", "SMS Cupom Final (D70)"],
    message_template: "Sentimos sua falta, {{name}}! Preparamos algo especial só pra você 💜",
    delay_minutes: 86400,
  },
  {
    slug: "pos-compra",
    tipo_jornada: "post_purchase",
    titulo: "Pós-compra e Cross-sell",
    desc: "Sugira produtos complementares após o envio.",
    gatilho: "Pedido entregue",
    trigger: "order_delivered",
    icon: Sparkles,
    color: "text-pink-500",
    bg: "bg-pink-500/10",
    kpi: "Mensagens enviadas",
    defaultActive: true,
    fluxo: ["WA Obrigado (D1)", "Email Uso (D5)", "WA Sugestão (D15)"],
    message_template: "{{name}}, seu pedido foi entregue! Como foi a experiência? 😊",
    delay_minutes: 1440,
  },
  {
    slug: "fidelidade",
    tipo_jornada: "loyalty_points",
    titulo: "Fidelidade — Pontos",
    desc: "Notifique sobre pontos e recompensas.",
    gatilho: "Mudança de saldo de pontos",
    trigger: "custom",
    icon: Gift,
    color: "text-indigo-500",
    bg: "bg-indigo-500/10",
    kpi: "Mensagens enviadas",
    defaultActive: true,
    fluxo: ["WA Saldo (D0)", "WA Recompensa (D-3 expira)"],
    message_template: "{{name}}, você acumulou novos pontos! Veja suas recompensas disponíveis 🎁",
    delay_minutes: 0,
  },
  {
    slug: "aniversario",
    tipo_jornada: "birthday",
    titulo: "Aniversário",
    desc: "Presenteie seus clientes no dia especial.",
    gatilho: "3 dias antes do aniversário",
    trigger: "customer_birthday",
    icon: Heart,
    color: "text-red-500",
    bg: "bg-red-500/10",
    kpi: "Mensagens enviadas",
    defaultActive: true,
    fluxo: ["WA Oferta (D-3)", "Email Parabéns (D0)"],
    message_template: "Feliz aniversário, {{name}}! Preparamos um presente especial pra você 🎂",
    delay_minutes: -4320,
  },
];

/** Tipos dos 7 cards do UI; jornadas `winback` / `review_request` da seed ficam em «Outras jornadas». */
export const CATALOG_TIPO_JORNADAS = new Set(JORNADAS_META.map((m) => m.tipo_jornada));
