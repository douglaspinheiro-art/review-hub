-- Hotfix de runtime para RPCs críticas do dashboard.
-- Mantém os GRANTs versionados para evitar regressão entre ambientes.

grant execute on function public.get_contacts_bundle_v2(
  uuid,
  text,
  text,
  timestamp without time zone,
  integer
) to authenticated;

grant execute on function public.get_prescriptions_bundle_v2(uuid) to authenticated;
