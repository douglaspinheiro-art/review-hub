CREATE POLICY "system_config_read_anon_maintenance"
ON public.system_config
FOR SELECT
TO anon
USING (id = 'config_geral');