-- 🚀 AUTOMAÇÃO DE INTELIGÊNCIA — LTV BOOST
-- Triggers para RFM, Fidelidade e Estatísticas em tempo real

-- 1. Função para calcular o Segmento RFM
create or replace function calcular_segmento_rfm(recencia int, frequencia int, monetario numeric)
returns text as $$
begin
    -- Lógica simplificada de segmentação
    if recencia <= 30 and frequencia >= 5 then return 'campiao';
    elsif recencia <= 60 and frequencia >= 3 then return 'fiel';
    elsif recencia <= 30 and frequencia = 1 then return 'novo';
    elsif recencia > 180 then return 'perdido';
    elsif recencia > 90 then return 'hibernando';
    else return 'promissor';
    end if;
end;
$$ language plpgsql;

-- 2. Trigger Function para processar novo pedido
create or replace function processar_novo_pedido_v3()
returns trigger as $$
declare
    v_pontos int;
    v_loja_config record;
    v_total_pedidos int;
    v_soma_monetario numeric;
    v_ultima_compra timestamptz;
begin
    -- A. Buscar configurações de fidelidade da loja
    select * into v_loja_config from fidelidade_config where loja_id = new.loja_id;
    
    if found and v_loja_config.ativo then
        -- Calcular pontos (ex: 1 ponto por real)
        v_pontos := floor(new.valor * v_loja_config.pontos_por_real);
        
        -- Creditar pontos
        insert into fidelidade_pontos (cliente_id, loja_id, quantidade, tipo, motivo)
        values (new.cliente_id, new.loja_id, v_pontos, 'credito', 'Compra Pedido: ' || new.id);
    end if;

    -- B. Atualizar estatísticas do Cliente (RFM)
    select count(*), sum(valor), max(created_at)
    into v_total_pedidos, v_soma_monetario, v_ultima_compra
    from pedidos_v3
    where cliente_id = new.cliente_id;

    update clientes
    set 
        rfm_frequencia = v_total_pedidos,
        rfm_monetario = v_soma_monetario,
        rfm_recencia = extract(day from (now() - v_ultima_compra)),
        ultima_compra_em = v_ultima_compra,
        rfm_segmento = calcular_segmento_rfm(
            extract(day from (now() - v_ultima_compra))::int,
            v_total_pedidos,
            v_soma_monetario
        )
    where id = new.cliente_id;

    return new;
end;
$$ language plpgsql;

-- 3. Criar o Trigger
drop trigger if exists trg_processar_pedido_v3 on pedidos_v3;
create trigger trg_processar_pedido_v3
after insert on pedidos_v3
for each row execute procedure processar_novo_pedido_v3();
