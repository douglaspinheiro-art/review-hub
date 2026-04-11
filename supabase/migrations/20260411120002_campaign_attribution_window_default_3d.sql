-- Alinha default de janela com last-touch 72h (3 dias) usado no pipeline e na UI.
ALTER TABLE public.campaigns
  ALTER COLUMN attribution_window_days SET DEFAULT 3;
