-- Tipos dedicados aos cards «Boleto/PIX» e «Fidelidade» em /dashboard/automacoes.
-- O flow-engine agenda quando o evento recebido for igual a tipo_jornada (payment_pending | loyalty_points).
-- Não altera linhas já existentes (do nothing on conflict).

insert into public.journeys_config (store_id, tipo_jornada, ativa, config_json, kpi_atual, updated_at)
select
  s.id,
  j.tipo_jornada,
  j.ativa,
  j.config_json,
  0,
  now()
from public.stores s
cross join (
  values
    (
      'payment_pending'::text,
      true,
      '{"delay_minutes":120,"message_template":"{{nome}}, seu pedido está aguardando pagamento. Quer o link PIX ou boleto atualizado? {{link}}"}'::jsonb
    ),
    (
      'loyalty_points'::text,
      true,
      '{"delay_minutes":0,"message_template":"{{nome}}, você acumulou novos pontos de fidelidade! Veja recompensas disponíveis: {{link}}"}'::jsonb
    )
) as j(tipo_jornada, ativa, config_json)
on conflict (store_id, tipo_jornada) do nothing;
