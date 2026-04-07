-- 🚀 LTV BOOST v4 — STANDARDIZATION MIGRATION
-- Renaming tables and columns from Portuguese to English for internal consistency

-- 1. TABLE RENAMES
alter table if exists lojas rename to stores;
alter table if exists canais rename to channels;
alter table if exists clientes rename to customers_v3;
alter table if exists pedidos_v3 rename to orders_v3;
alter table if exists produtos rename to products;
alter table if exists configuracoes_v3 rename to settings_v3;
alter table if exists problemas rename to opportunities;
alter table if exists prescricoes rename to prescriptions;
alter table if exists execucoes rename to executions;
alter table if exists comunicacoes_enviadas rename to communications_sent;
alter table if exists calendario_sazonal rename to seasonal_calendar;
alter table if exists fidelidade_config rename to loyalty_config;
alter table if exists fidelidade_recompensas rename to loyalty_rewards;
alter table if exists fidelidade_pontos rename to loyalty_points_v3;
alter table if exists jornadas_config rename to journeys_config;
alter table if exists benchmarks_setor rename to sector_benchmarks;
alter table if exists sistema_config rename to system_config;
alter table if exists metricas_funil_v3 rename to funnel_metrics_v3;
alter table if exists diagnosticos_v3 rename to diagnostics_v3;
alter table if exists agente_ia_config rename to ai_agent_config;
alter table if exists metricas_funil rename to funnel_metrics;
alter table if exists diagnosticos rename to diagnostics;
alter table if exists configuracoes_convertiq rename to convertiq_settings;

-- 2. COLUMN RENAMES (SYSTEMATICALLY)
do $$ 
declare
    t record;
begin
    -- Rename 'loja_id' to 'store_id' in all tables
    for t in (select table_name from information_schema.columns where column_name = 'loja_id' and table_schema = 'public') loop
        execute format('alter table %I rename column loja_id to store_id', t.table_name);
    end loop;

    -- Rename 'problema_id' to 'opportunity_id'
    for t in (select table_name from information_schema.columns where column_name = 'problema_id' and table_schema = 'public') loop
        execute format('alter table %I rename column problema_id to opportunity_id', t.table_name);
    end loop;

    -- Specific renames for 'opportunities' (formerly problemas)
    if exists (select 1 from information_schema.columns where table_name = 'opportunities' and column_name = 'detectado_em') then
        alter table opportunities rename column detectado_em to detected_at;
    end if;
    if exists (select 1 from information_schema.columns where table_name = 'opportunities' and column_name = 'resolvido_em') then
        alter table opportunities rename column resolvido_em to resolved_at;
    end if;
    if exists (select 1 from information_schema.columns where table_name = 'opportunities' and column_name = 'impacto_estimado') then
        alter table opportunities rename column impacto_estimado to estimated_impact;
    end if;
    if exists (select 1 from information_schema.columns where table_name = 'opportunities' and column_name = 'causa_raiz') then
        alter table opportunities rename column causa_raiz to root_cause;
    end if;
    if exists (select 1 from information_schema.columns where table_name = 'opportunities' and column_name = 'severidade') then
        alter table opportunities rename column severidade to severity;
    end if;

    -- Specific renames for 'settings_v3' (formerly configuracoes_v3)
    if exists (select 1 from information_schema.columns where table_name = 'settings_v3' and column_name = 'meta_conversao') then
        alter table settings_v3 rename column meta_conversao to conversion_goal;
    end if;
    if exists (select 1 from information_schema.columns where table_name = 'settings_v3' and column_name = 'ticket_medio') then
        alter table settings_v3 rename column ticket_medio to average_ticket;
    end if;
    if exists (select 1 from information_schema.columns where table_name = 'settings_v3' and column_name = 'margem_media') then
        alter table settings_v3 rename column margem_media to average_margin;
    end if;
    if exists (select 1 from information_schema.columns where table_name = 'settings_v3' and column_name = 'aprovacao_automatica') then
        alter table settings_v3 rename column aprovacao_automatica to auto_approval;
    end if;
    if exists (select 1 from information_schema.columns where table_name = 'settings_v3' and column_name = 'pulse_ativo') then
        alter table settings_v3 rename column pulse_ativo to pulse_active;
    end if;
    if exists (select 1 from information_schema.columns where table_name = 'settings_v3' and column_name = 'pulse_dia_semana') then
        alter table settings_v3 rename column pulse_dia_semana to pulse_day_of_week;
    end if;
    if exists (select 1 from information_schema.columns where table_name = 'settings_v3' and column_name = 'pulse_horario') then
        alter table settings_v3 rename column pulse_horario to pulse_time;
    end if;
    if exists (select 1 from information_schema.columns where table_name = 'settings_v3' and column_name = 'pulse_numero_whatsapp') then
        alter table settings_v3 rename column pulse_numero_whatsapp to pulse_whatsapp_number;
    end if;

    -- Specific renames for 'prescriptions' (formerly prescricoes)
    if exists (select 1 from information_schema.columns where table_name = 'prescriptions' and column_name = 'canal_execucao') then
        alter table prescriptions rename column canal_execucao to execution_channel;
    end if;
    if exists (select 1 from information_schema.columns where table_name = 'prescriptions' and column_name = 'potencial_estimado') then
        alter table prescriptions rename column potencial_estimado to estimated_potential;
    end if;
    if exists (select 1 from information_schema.columns where table_name = 'prescriptions' and column_name = 'roi_estimado') then
        alter table prescriptions rename column roi_estimado to estimated_roi;
    end if;

    -- Specific renames for 'customers_v3' (formerly clientes)
    if exists (select 1 from information_schema.columns where table_name = 'customers_v3' and column_name = 'ultima_compra_em') then
        alter table customers_v3 rename column ultima_compra_em to last_purchase_at;
    end if;
    if exists (select 1 from information_schema.columns where table_name = 'customers_v3' and column_name = 'telefone') then
        alter table customers_v3 rename column telefone to phone;
    end if;
    if exists (select 1 from information_schema.columns where table_name = 'customers_v3' and column_name = 'nome') then
        alter table customers_v3 rename column nome to name;
    end if;

    -- Specific renames for 'channels' (formerly canais)
    if exists (select 1 from information_schema.columns where table_name = 'channels' and column_name = 'ultima_sync') then
        alter table channels rename column ultima_sync to last_sync_at;
    end if;

    -- Specific renames for 'system_config'
    if exists (select 1 from information_schema.columns where table_name = 'system_config' and column_name = 'manutencao_ativa') then
        alter table system_config rename column manutencao_ativa to maintenance_active;
    end if;
    if exists (select 1 from information_schema.columns where table_name = 'system_config' and column_name = 'mensagem_manutencao') then
        alter table system_config rename column mensagem_manutencao to maintenance_message;
    end if;

end $$;
