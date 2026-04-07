-- 🚀 LTV BOOST v4.1 — MULTI-TENANCY & SCHEMA FIX
-- Fixes critical issues with analytics_daily and missing columns

-- 1. FIX ANALYTICS_DAILY MULTI-TENANCY
-- First, remove the global unique constraint on 'date'
ALTER TABLE analytics_daily DROP CONSTRAINT IF EXISTS analytics_daily_date_key;

-- Add user_id if it doesn't exist (it shouldn't based on full-migration.sql)
ALTER TABLE analytics_daily ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES profiles(id) ON DELETE CASCADE;

-- Create a composite unique constraint for (user_id, date)
-- This allows different users to have their own daily stats
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'analytics_daily_user_date_unique') THEN
        ALTER TABLE analytics_daily ADD CONSTRAINT analytics_daily_user_date_unique UNIQUE (user_id, date);
    END IF;
END $$;

-- 2. FIX ABANDONED_CARTS SCHEMA
-- Add recovered_value column used by the dashboard
ALTER TABLE abandoned_carts ADD COLUMN IF NOT EXISTS recovered_value numeric(12,2) DEFAULT 0;

-- 3. UPDATE SYNC FUNCTIONS
-- Update sync_order_to_analytics to handle user_id correctly
CREATE OR REPLACE FUNCTION sync_order_to_analytics()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (TG_OP = 'INSERT' AND new.status IN ('paid', 'shipped', 'delivered')) OR
     (TG_OP = 'UPDATE' AND new.status IN ('paid', 'shipped', 'delivered') AND old.status NOT IN ('paid', 'shipped', 'delivered')) THEN
    
    INSERT INTO analytics_daily (date, user_id, revenue_influenced)
    VALUES (current_date, new.user_id, new.total_amount)
    ON CONFLICT (user_id, date) DO UPDATE
    SET revenue_influenced = analytics_daily.revenue_influenced + EXCLUDED.revenue_influenced;
    
  END IF;
  return new;
END;
$$;

-- Update increment_daily_revenue helper (found in fase1-attribution.sql)
CREATE OR REPLACE FUNCTION increment_daily_revenue(
  p_user_id uuid,
  p_date date,
  p_amount numeric
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO analytics_daily (user_id, date, revenue_influenced)
  VALUES (p_user_id, p_date, p_amount)
  ON CONFLICT (user_id, date)
  DO UPDATE SET revenue_influenced = analytics_daily.revenue_influenced + EXCLUDED.revenue_influenced;
END;
$$;
