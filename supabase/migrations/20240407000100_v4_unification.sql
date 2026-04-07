-- LTV Boost v4 Unification: lojas -> stores
-- Unifies the entity into a single 'stores' table to avoid data fragmentation

-- 1. Add missing fields to 'stores'
ALTER TABLE stores 
ADD COLUMN IF NOT EXISTS plataforma TEXT,
ADD COLUMN IF NOT EXISTS url TEXT,
ADD COLUMN IF NOT EXISTS ticket_medio NUMERIC DEFAULT 250,
ADD COLUMN IF NOT EXISTS ga4_property_id TEXT,
ADD COLUMN IF NOT EXISTS ga4_access_token TEXT,
ADD COLUMN IF NOT EXISTS pix_key TEXT;

-- 2. Migrate existing data from 'lojas' to 'stores' if any
-- (This assumes users might have data in either table)
INSERT INTO stores (user_id, name, plataforma, url, ticket_medio, ga4_property_id, ga4_access_token, created_at)
SELECT user_id, nome, plataforma, url, ticket_medio, ga4_property_id, ga4_access_token, created_at
FROM lojas
ON CONFLICT (user_id) DO UPDATE SET
  plataforma = EXCLUDED.plataforma,
  url = EXCLUDED.url,
  ticket_medio = EXCLUDED.ticket_medio,
  ga4_property_id = EXCLUDED.ga4_property_id,
  ga4_access_token = EXCLUDED.ga4_access_token;

-- 3. Update references in other tables
-- metricas_funil
ALTER TABLE metricas_funil DROP CONSTRAINT IF EXISTS metricas_funil_loja_id_fkey;
ALTER TABLE metricas_funil ADD CONSTRAINT metricas_funil_loja_id_fkey FOREIGN KEY (loja_id) REFERENCES stores(id) ON DELETE CASCADE;

-- diagnosticos
ALTER TABLE diagnosticos DROP CONSTRAINT IF EXISTS diagnosticos_loja_id_fkey;
ALTER TABLE diagnosticos ADD CONSTRAINT diagnosticos_loja_id_fkey FOREIGN KEY (loja_id) REFERENCES stores(id) ON DELETE CASCADE;

-- 4. Drop the redundant 'lojas' table
DROP TABLE IF EXISTS lojas CASCADE;

-- Update RLS for stores to be fully inclusive
DROP POLICY IF EXISTS "Users can view own stores" ON stores;
CREATE POLICY "Users own stores" ON stores FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
