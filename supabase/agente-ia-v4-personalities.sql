-- 🚀 MULTI-AGENTE POR LOJA COM PERSONALIDADE
-- Ajustando para que cada loja tenha sua própria alma e tom de voz

-- 1. Remover a restrição antiga baseada em usuário e aplicar por loja
alter table agente_ia_config drop constraint if exists agente_ia_config_user_id_key;
alter table agente_ia_config add constraint agente_ia_config_loja_id_key unique (loja_id);

-- 2. Adicionar campos de personalidade e preset
alter table agente_ia_config add column if not exists personalidade_preset text default 'consultivo';
alter table agente_ia_config add column if not exists tom_de_voz text default 'amigável e profissional';

-- 3. Comentários para documentação
comment on column agente_ia_config.personalidade_preset is 'Presets: vendedor, suporte, amigavel, formal, tecnico';
