import type { Database } from "@/integrations/supabase/types";

type JourneyInsert = Database["public"]["Tables"]["journeys_config"]["Insert"];

/**
 * Defaults para seed por loja (flow-engine: `event` === `tipo_jornada`; mensagens com {{nome}} / {{link}}).
 * Inclui `winback` e `review_request` genéricos (API) e tipos dedicados aos cards Boleto/PIX e Fidelidade.
 * Manter alinhado a `supabase/functions/post-integration-setup/index.ts` (JOURNEY_SEED).
 */
export const DEFAULT_JOURNEYS_FOR_STORE: Omit<JourneyInsert, "store_id">[] = [
  {
    tipo_jornada: "cart_abandoned",
    ativa: true,
    config_json: {
      delay_minutes: 20,
      message_template: "Oi {{nome}}! Seu carrinho ainda está reservado. Finalize aqui: {{link}}",
    },
  },
  {
    tipo_jornada: "reactivation",
    ativa: true,
    config_json: {
      delay_minutes: 60,
      message_template: "{{nome}}, sentimos sua falta. Volte com uma oferta especial: {{link}}",
    },
  },
  {
    tipo_jornada: "birthday",
    ativa: true,
    config_json: {
      delay_minutes: 0,
      message_template: "Parabéns, {{nome}}! Preparamos um presente para você hoje: {{link}}",
    },
  },
  {
    tipo_jornada: "post_purchase",
    ativa: true,
    config_json: {
      delay_minutes: 1440,
      message_template:
        "Obrigado pela compra, {{nome}}! Aqui está um benefício para seu próximo pedido: {{link}}",
    },
  },
  {
    tipo_jornada: "welcome",
    ativa: true,
    config_json: {
      delay_minutes: 5,
      message_template: "Bem-vindo(a), {{nome}}! Confira nossas ofertas iniciais: {{link}}",
    },
  },
  {
    tipo_jornada: "review_request",
    ativa: true,
    config_json: {
      delay_minutes: 2880,
      message_template: "{{nome}}, como foi sua experiência? Sua avaliação é muito importante.",
    },
  },
  {
    tipo_jornada: "winback",
    ativa: true,
    config_json: {
      delay_minutes: 10080,
      message_template: "Tem novidade para você, {{nome}}. Reative seu benefício aqui: {{link}}",
    },
  },
  {
    tipo_jornada: "payment_pending",
    ativa: true,
    config_json: {
      delay_minutes: 120,
      message_template:
        "{{nome}}, seu pedido está aguardando pagamento. Quer o link PIX ou boleto atualizado? {{link}}",
    },
  },
  {
    tipo_jornada: "loyalty_points",
    ativa: true,
    config_json: {
      delay_minutes: 0,
      message_template:
        "{{nome}}, você acumulou novos pontos de fidelidade! Veja recompensas disponíveis: {{link}}",
    },
  },
];

export const CORE_FLOW_TIPOS = ["cart_abandoned", "post_purchase", "reactivation"] as const;
