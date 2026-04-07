-- LTV Boost v4 Enrichment Migration
-- Adds tracking and context fields to abandoned_carts for better conversion

ALTER TABLE abandoned_carts 
ADD COLUMN IF NOT EXISTS utm_source TEXT,
ADD COLUMN IF NOT EXISTS utm_medium TEXT,
ADD COLUMN IF NOT EXISTS utm_campaign TEXT,
ADD COLUMN IF NOT EXISTS utm_content TEXT,
ADD COLUMN IF NOT EXISTS utm_term TEXT,
ADD COLUMN IF NOT EXISTS shipping_value NUMERIC(12,2),
ADD COLUMN IF NOT EXISTS shipping_zip_code TEXT,
ADD COLUMN IF NOT EXISTS payment_failure_reason TEXT,
ADD COLUMN IF NOT EXISTS inventory_status JSONB DEFAULT '[]';

-- Update types for TypeScript if needed (though generated usually)
COMMENT ON COLUMN abandoned_carts.utm_source IS 'Source tracking for attribution';
COMMENT ON COLUMN abandoned_carts.payment_failure_reason IS 'Reason for checkout failure if available';
COMMENT ON COLUMN abandoned_carts.shipping_value IS 'Shipping cost calculated at checkout';
