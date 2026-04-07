-- 🚀 LTV BOOST v4.2 — DATA UNIFICATION & COMPATIBILITY
-- Unifica as tabelas antigas (v1/v2) com o novo modelo (v3/v4)
-- Cria Views de compatibilidade para garantir que o sistema não quebre

-- 1. MIGRAÇÃO DE DADOS: contacts -> customers_v3
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'contacts') 
       AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'customers_v3') THEN
        
        INSERT INTO customers_v3 (user_id, store_id, email, phone, name, created_at)
        SELECT 
            c.user_id,
            COALESCE(c.store_id, (SELECT id FROM stores s WHERE s.user_id = c.user_id LIMIT 1)),
            c.email,
            c.phone,
            c.name,
            c.created_at
        FROM contacts c
        WHERE c.user_id IS NOT NULL 
          AND (c.store_id IS NOT NULL OR EXISTS (SELECT 1 FROM stores s WHERE s.user_id = c.user_id))
        ON CONFLICT (store_id, phone) DO NOTHING;
    END IF;
END $$;

-- 2. MIGRAÇÃO DE DADOS: orders -> orders_v3 (se existir orders antiga)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'orders') 
       AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'orders_v3') THEN
        
        INSERT INTO orders_v3 (user_id, store_id, cliente_id, pedido_externo_id, valor, status, created_at)
        SELECT 
            o.user_id,
            COALESCE(o.store_id, (SELECT id FROM stores s WHERE s.user_id = o.user_id LIMIT 1)),
            (SELECT id FROM customers_v3 cv WHERE cv.phone = (SELECT phone FROM contacts ct WHERE ct.id = o.contact_id LIMIT 1) LIMIT 1),
            o.external_order_id,
            o.total_amount,
            o.status,
            o.created_at
        FROM orders o
        WHERE o.user_id IS NOT NULL
          AND (o.store_id IS NOT NULL OR EXISTS (SELECT 1 FROM stores s WHERE s.user_id = o.user_id))
        ON CONFLICT DO NOTHING;
    END IF;
END $$;

-- 3. CRIAÇÃO DE VIEWS DE COMPATIBILIDADE (PORTUGUÊS -> INGLÊS)
-- Permite que códigos legados continuem funcionando sem erros de "tabela não encontrada"

CREATE OR REPLACE VIEW lojas AS SELECT * FROM stores;
CREATE OR REPLACE VIEW canais AS SELECT * FROM channels;
CREATE OR REPLACE VIEW clientes AS SELECT * FROM customers_v3;
CREATE OR REPLACE VIEW pedidos_v3 AS SELECT * FROM orders_v3;
CREATE OR REPLACE VIEW produtos AS SELECT * FROM products;
CREATE OR REPLACE VIEW problemas AS SELECT * FROM opportunities;
CREATE OR REPLACE VIEW prescricoes AS SELECT * FROM prescriptions;
CREATE OR REPLACE VIEW execucoes AS SELECT * FROM executions;
CREATE OR REPLACE VIEW comunicacoes_enviadas AS SELECT * FROM communications_sent;
CREATE OR REPLACE VIEW sistema_config_legacy AS SELECT * FROM system_config;

-- 4. TRIGGER DE SINCRONIA: contacts -> customers_v3
-- Garante que se algo ainda inserir no modelo antigo, o dado seja replicado
CREATE OR REPLACE FUNCTION sync_contacts_to_customers_v3()
RETURNS trigger AS $$
DECLARE
  v_store_id uuid;
BEGIN
  -- Se não houver user_id, não podemos sincronizar para o modelo v3 (multi-tenant)
  IF new.user_id IS NULL THEN
    RETURN new;
  END IF;

  v_store_id := COALESCE(new.store_id, (SELECT id FROM stores WHERE user_id = new.user_id LIMIT 1));
  
  -- Se não houver loja para este usuário, também não podemos sincronizar
  IF v_store_id IS NULL THEN
    RETURN new;
  END IF;

  INSERT INTO customers_v3 (user_id, store_id, email, phone, name)
  VALUES (
    new.user_id,
    v_store_id,
    new.email,
    new.phone,
    new.name
  ) ON CONFLICT (store_id, phone) DO UPDATE 
  SET email = EXCLUDED.email, name = EXCLUDED.name;
  RETURN new;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_contacts_v3 ON contacts;
CREATE TRIGGER trg_sync_contacts_v3
AFTER INSERT OR UPDATE ON contacts
FOR EACH ROW EXECUTE PROCEDURE sync_contacts_to_customers_v3();
