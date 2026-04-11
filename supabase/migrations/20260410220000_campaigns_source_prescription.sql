-- Link campaign drafts to the prescription that originated them (auditoria / relatórios).
alter table public.campaigns
  add column if not exists source_prescription_id uuid references public.prescriptions(id) on delete set null;

create index if not exists idx_campaigns_source_prescription
  on public.campaigns (source_prescription_id)
  where source_prescription_id is not null;

comment on column public.campaigns.source_prescription_id is 'Prescrição aprovada que originou esta campanha (Central de Prescrições).';
