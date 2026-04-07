import { 
  UserPlus, ShoppingCart, CreditCard, 
  RefreshCcw, Sparkles, Gift, Heart, 
  LucideIcon 
} from "lucide-react";

export type JornadaMeta = {
  slug: string;
  titulo: string;
  desc: string;
  gatilho: string;
  trigger: "new_contact" | "cart_abandoned" | "customer_inactive" | "order_delivered" | "customer_birthday" | "custom";
  icon: LucideIcon;
  color: string;
  bg: string;
  kpi: string;
  kpiValue: string;
  defaultActive: boolean;
  fluxo: string[];
  message_template: string;
  delay_minutes: number;
  templateVars?: string;
};

export const JORNADAS_META: JornadaMeta[] = [
  {
    slug: "novo-cliente",
    titulo: "Jornada do Novo Cliente",
    desc: "Transforme a primeira compra em recorrência.",
    gatilho: "Primeira compra finalizada",
    trigger: "new_contact",
    icon: UserPlus,
    color: "text-blue-500",
    bg: "bg-blue-500/10",
    kpi: "Taxa 2ª Compra",
    kpiValue: "18.4%",
    defaultActive: true,
    fluxo: ["WA Confirmação (D0)", "Email Rastreio (D3)", "WA Satisfação (D7)", "Email Cross-sell (D14)"],
    message_template: "Olá {{name}}! Obrigado pela sua compra. Já separamos tudo com carinho pra você 🎉",
    delay_minutes: 0,
  },
  {
    slug: "carrinho-abandonado",
    titulo: "Carrinho Abandonado",
    desc: "Recupere vendas perdidas automaticamente.",
    gatilho: "Carrinho sem compra em 1h",
    trigger: "cart_abandoned",
    icon: ShoppingCart,
    color: "text-emerald-500",
    bg: "bg-emerald-500/10",
    kpi: "Recuperação",
    kpiValue: "14.2%",
    defaultActive: true,
    fluxo: ["WA (1h)", "Email (4h)", "SMS + Cupom (24h)"],
    message_template: "Oi {{name}}, você deixou itens no carrinho! Finalize aqui: {{magic_link}} 🛒",
    delay_minutes: 60,
    templateVars: "{{name}}, {{value}}, {{items}}, {{magic_link}}",
  },
  {
    slug: "boleto-vencido",
    titulo: "Boleto/PIX Vencido",
    desc: "Lembrete suave para pagamentos pendentes.",
    gatilho: "Pedido aguardando pagamento",
    trigger: "custom",
    icon: CreditCard,
    color: "text-amber-500",
    bg: "bg-amber-500/10",
    kpi: "Pagos",
    kpiValue: "42.1%",
    defaultActive: true,
    fluxo: ["WA (2h)", "Email (24h)", "WA Final (48h)"],
    message_template: "{{name}}, seu pedido está aguardando pagamento. Quer um link PIX direto? ⚡",
    delay_minutes: 120,
  },
  {
    slug: "reativacao",
    titulo: "Reativação Automática",
    desc: "Recupere clientes que não compram há 60 dias.",
    gatilho: "Sem compra em nenhum canal",
    trigger: "customer_inactive",
    icon: RefreshCcw,
    color: "text-purple-500",
    bg: "bg-purple-500/10",
    kpi: "Reativados",
    kpiValue: "8.7%",
    defaultActive: true, // ETAPA 8: Set to true
    fluxo: ["Email Saudade (D60)", "WA Oferta (D65)", "SMS Cupom Final (D70)"],
    message_template: "Sentimos sua falta, {{name}}! Preparamos algo especial só pra você 💜",
    delay_minutes: 86400,
  },
  {
    slug: "pos-compra",
    titulo: "Pós-compra e Cross-sell",
    desc: "Sugira produtos complementares após o envio.",
    gatilho: "Pedido entregue",
    trigger: "order_delivered",
    icon: Sparkles,
    color: "text-pink-500",
    bg: "bg-pink-500/10",
    kpi: "Ticket Médio",
    kpiValue: "+R$ 42",
    defaultActive: true,
    fluxo: ["WA Obrigado (D1)", "Email Uso (D5)", "WA Sugestão (D15)"],
    message_template: "{{name}}, seu pedido foi entregue! Como foi a experiência? 😊",
    delay_minutes: 1440,
  },
  {
    slug: "fidelidade",
    titulo: "Fidelidade — Pontos",
    desc: "Notifique sobre pontos e recompensas.",
    gatilho: "Mudança de saldo de pontos",
    trigger: "custom",
    icon: Gift,
    color: "text-indigo-500",
    bg: "bg-indigo-500/10",
    kpi: "Uso Pontos",
    kpiValue: "22%",
    defaultActive: true,
    fluxo: ["WA Saldo (D0)", "WA Recompensa (D-3 expira)"],
    message_template: "{{name}}, você acumulou novos pontos! Veja suas recompensas disponíveis 🎁",
    delay_minutes: 0,
  },
  {
    slug: "aniversario",
    titulo: "Aniversário",
    desc: "Presenteie seus clientes no dia especial.",
    gatilho: "3 dias antes do aniversário",
    trigger: "customer_birthday",
    icon: Heart,
    color: "text-red-500",
    bg: "bg-red-500/10",
    kpi: "Conversão",
    kpiValue: "31.5%",
    defaultActive: true,
    fluxo: ["WA Oferta (D-3)", "Email Parabéns (D0)"],
    message_template: "Feliz aniversário, {{name}}! Preparamos um presente especial pra você 🎂",
    delay_minutes: -4320,
  },
];
